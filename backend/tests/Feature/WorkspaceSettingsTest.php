<?php

use App\Models\Delivery;
use App\Models\Order;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\AuthSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

function workspaceUser(string $role): User
{
    $user = User::create(['name' => 'Workspace '.$role, 'email' => uniqid().'@example.test', 'password' => 'Workspace-Test-123!', 'is_active' => true]);
    $user->roles()->attach(Role::where('slug', $role)->firstOrFail());

    return $user;
}

beforeEach(function () {
    $this->seed(AuthSeeder::class);
});

it('lets every role persist only its own display preferences', function (string $role) {
    $user = workspaceUser($role);
    $other = workspaceUser('customer');
    $this->actingAs($user)->putJson('/api/v1/me/preferences', ['home_page' => '/settings', 'compact_view' => true, 'reduced_motion' => true, 'show_notification_badge' => false, 'user_id' => $other->id, 'roles' => ['administrator']])
        ->assertOk()->assertJsonPath('user.preferences.compact_view', true)->assertJsonPath('user.preferences.show_notification_badge', false);
    $this->getJson('/api/v1/me')->assertJsonPath('user.preferences.home_page', '/settings');
    expect($other->fresh()->ui_preferences)->toBeNull();
    expect($user->fresh()->roles()->pluck('slug')->all())->toBe([$role]);
})->with(['customer', 'rider', 'kitchen_staff', 'waiter', 'cashier', 'manager', 'administrator']);

it('validates start pages and accepts the default page without giving access to restricted settings', function () {
    $user = workspaceUser('rider');
    $prefs = ['home_page' => '/admin/business-settings', 'compact_view' => false, 'reduced_motion' => false, 'show_notification_badge' => true];
    $this->actingAs($user)->putJson('/api/v1/me/preferences', $prefs)->assertUnprocessable()->assertJsonValidationErrors('home_page');
    $prefs['home_page'] = '';
    $this->putJson('/api/v1/me/preferences', $prefs)->assertOk()->assertJsonPath('user.preferences.home_page', '');
    $this->getJson('/api/v1/admin/settings')->assertForbidden();
    $prefs['compact_view'] = 'invalid';
    $this->putJson('/api/v1/me/preferences', $prefs)->assertUnprocessable()->assertJsonValidationErrors('compact_view');
});

it('requires authentication for preferences', function () {
    $this->putJson('/api/v1/me/preferences', [])->assertUnauthorized();
});

it('accepts the new workspace start pages only when the role can access them', function () {
    $prefs = ['compact_view' => false, 'reduced_motion' => false, 'show_notification_badge' => true];
    $manager = workspaceUser('manager');
    $this->actingAs($manager)->putJson('/api/v1/me/preferences', [...$prefs, 'home_page' => '/admin/dashboard'])->assertOk();
    $this->putJson('/api/v1/me/preferences', [...$prefs, 'home_page' => '/admin/orders'])->assertOk();
    $this->putJson('/api/v1/me/preferences', [...$prefs, 'home_page' => '/admin/system-settings'])->assertUnprocessable();
    $this->actingAs(workspaceUser('administrator'))->putJson('/api/v1/me/preferences', [...$prefs, 'home_page' => '/admin/outlets'])->assertOk();
    $this->actingAs(workspaceUser('customer'))->putJson('/api/v1/me/preferences', [...$prefs, 'home_page' => '/admin/dashboard'])->assertUnprocessable();
});

it('separates rider active work from paginated history and keeps all counts private', function () {
    $rider = workspaceUser('rider');
    $other = workspaceUser('rider');
    $customer = workspaceUser('customer');
    $create = function ($assigned, $status) use ($customer) {
        $order = Order::create(['order_number' => 'WS'.uniqid(), 'customer_id' => $customer->id, 'customer_name_snapshot' => 'Customer', 'order_type' => 'delivery', 'status' => $status === 'delivered' ? 'completed' : 'preparing', 'total' => 100, 'subtotal' => 100, 'currency' => 'PHP']);

        return Delivery::create(['order_id' => $order->id, 'rider_user_id' => $assigned->id, 'status' => $status, 'delivered_at' => $status === 'delivered' ? now() : null]);
    };
    $active = $create($rider, 'accepted');
    for ($index = 0; $index < 22; $index++) {
        $create($rider, 'delivered');
    }
    $create($rider, 'failed');
    $create($other, 'accepted');
    $create($other, 'delivered');
    $this->actingAs($rider)->getJson('/api/v1/rider/summary')->assertOk()->assertJsonPath('data.active_count', 1)->assertJsonPath('data.completed_today', 22)->assertJsonPath('data.delivered_total', 22)->assertJsonPath('data.next_delivery.id', $active->id)->assertJsonPath('data.rating_count', 0);
    $this->getJson('/api/v1/rider/assignments?scope=active')->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $active->id);
    $this->getJson('/api/v1/rider/assignments?scope=history')->assertJsonCount(20, 'data')->assertJsonPath('meta.total', 23)->assertJsonPath('meta.last_page', 2);
    $this->getJson('/api/v1/rider/assignments?scope=history&page=2')->assertJsonCount(3, 'data');
    $this->getJson('/api/v1/rider/assignments?scope=history&status=failed')->assertJsonCount(1, 'data')->assertJsonPath('data.0.status', 'failed');
    $this->actingAs($customer)->getJson('/api/v1/rider/summary')->assertForbidden();
    $this->actingAs(workspaceUser('administrator'))->getJson('/api/v1/rider/summary')->assertForbidden();
});

it('searches the riders own history before applying outcome filters and pagination', function () {
    $rider = workspaceUser('rider');
    $other = workspaceUser('rider');
    $customer = workspaceUser('customer');
    for ($index = 1; $index <= 13; $index++) {
        $order = Order::create(['order_number' => 'LOOKUP-'.$index, 'customer_id' => $customer->id, 'customer_name_snapshot' => 'Customer', 'order_type' => 'delivery', 'status' => 'completed', 'total' => 100, 'subtotal' => 100, 'currency' => 'PHP', 'delivery_address' => $index === 12 ? 'Manila' : 'Laguna', 'delivery_recipient_name' => 'Alex']);
        Delivery::create(['order_id' => $order->id, 'rider_user_id' => $index === 13 ? $other->id : $rider->id, 'status' => $index > 10 ? 'failed' : 'delivered']);
    }
    $this->actingAs($rider)->getJson('/api/v1/rider/assignments?scope=history&q=lookup&per_page=10')
        ->assertOk()->assertJsonCount(10, 'data')->assertJsonPath('meta.total', 12)->assertJsonPath('meta.last_page', 2);
    $this->getJson('/api/v1/rider/assignments?scope=history&q=lookup&per_page=10&page=2')->assertJsonCount(2, 'data');
    $this->getJson('/api/v1/rider/assignments?scope=history&q=LAGUNA&status=failed')->assertJsonCount(1, 'data')->assertJsonPath('data.0.order.order_number', 'LOOKUP-11');
    $this->getJson('/api/v1/rider/assignments?scope=history&q=alex')->assertJsonPath('meta.total', 12);
    $this->getJson('/api/v1/rider/assignments?scope=history&q=manila')->assertJsonCount(1, 'data');
    $this->getJson('/api/v1/rider/assignments?scope=history&per_page=5')->assertUnprocessable();
});
