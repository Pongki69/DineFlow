<?php

use App\Models\AuditLog;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\AuthSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->seed(AuthSeeder::class);
});

function activityUser(string $role, string $name): User
{
    $user = User::create(['name' => $name, 'email' => $role.'-'.uniqid().'@example.test', 'password' => Hash::make('Strong-Passphrase-922!'), 'is_active' => true]);
    $user->roles()->attach(Role::where('slug', $role)->firstOrFail());

    return $user;
}

function activityTicket(): OrderItem
{
    $order = Order::create(['order_number' => 'DF-77', 'customer_name_snapshot' => 'Table 3', 'order_type' => 'dine_in', 'status' => 'preparing', 'subtotal' => '300.00', 'total' => '300.00']);

    return OrderItem::create(['order_id' => $order->id, 'item_name_snapshot' => 'Sinigang', 'category_name_snapshot' => 'Soups', 'base_unit_price' => 150, 'quantity' => 2, 'line_total' => 300]);
}

it('records each kitchen tick as a plain sentence under the cook who did it', function () {
    $carla = activityUser('kitchen_staff', 'Carla');
    $item = activityTicket();

    $this->actingAs($carla)->patchJson("/api/v1/kitchen/order-items/{$item->id}/prepared", ['prepared' => true])->assertOk();

    $this->getJson('/api/v1/activity')->assertOk()
        ->assertJsonPath('data.0.summary', 'Ticked off 2× Sinigang on DF-77')
        ->assertJsonPath('data.0.area', 'kitchen')
        ->assertJsonPath('data.0.actor.name', 'Carla');
});

it('shows staff only their own actions, and administrators everyone’s with filters', function () {
    $carla = activityUser('kitchen_staff', 'Carla');
    $ben = activityUser('cashier', 'Ben');
    $order = activityTicket()->order;
    AuditLog::create(['actor_id' => $carla->id, 'event' => 'order.status_changed', 'subject_type' => $order->getMorphClass(), 'subject_id' => $order->id, 'metadata' => ['status' => 'ready_to_serve']]);
    AuditLog::create(['actor_id' => $ben->id, 'event' => 'payment.cash_received', 'metadata' => ['amount' => '300.00']]);

    // Ben sees his cash entry, never Carla's work.
    $this->actingAs($ben)->getJson('/api/v1/activity')->assertOk()
        ->assertJsonCount(1, 'data')->assertJsonPath('data.0.summary', 'Recorded ₱300.00 cash');
    $this->getJson('/api/v1/admin/activity')->assertForbidden();

    $admin = activityUser('administrator', 'Admin');
    $this->actingAs($admin)->getJson('/api/v1/admin/activity')->assertOk()->assertJsonCount(2, 'data');
    $this->getJson("/api/v1/admin/activity?actor_id={$carla->id}")->assertOk()
        ->assertJsonCount(1, 'data')->assertJsonPath('data.0.summary', 'Marked DF-77 ready to serve');
    $this->getJson('/api/v1/admin/activity?area=cashier')->assertOk()
        ->assertJsonCount(1, 'data')->assertJsonPath('data.0.actor.name', 'Ben');
    $this->getJson('/api/v1/admin/activity/people')->assertOk()->assertJsonFragment(['name' => 'Carla']);
});

it('narrows a day to a time window', function () {
    $admin = activityUser('administrator', 'Window Admin');
    $zone = config('app.timezone');
    $day = now($zone)->subDay()->toDateString();
    foreach (['08:30', '12:15', '18:45'] as $time) {
        $log = AuditLog::create(['actor_id' => $admin->id, 'event' => 'auth.login', 'metadata' => []]);
        $log->forceFill(['created_at' => \Illuminate\Support\Carbon::parse($day.' '.$time, $zone)->utc()])->save();
    }

    $this->actingAs($admin)->getJson("/api/v1/activity?from={$day}&to={$day}")->assertOk()->assertJsonPath('total', 3);
    $this->getJson("/api/v1/activity?from={$day}&to={$day}&from_time=12:00&to_time=13:00")->assertOk()->assertJsonPath('total', 1);
    $this->getJson("/api/v1/activity?from={$day}&to={$day}&from_time=12:00")->assertOk()->assertJsonPath('total', 2);
    $this->getJson("/api/v1/activity?from={$day}&to={$day}&to_time=9:00")->assertUnprocessable();
});
