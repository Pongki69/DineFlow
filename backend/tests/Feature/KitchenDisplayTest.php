<?php

use App\Models\MenuCategory;
use App\Models\MenuItem;
use App\Models\Order;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\AuthSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->seed(AuthSeeder::class);
    $this->kitchen = kdsUser('kitchen_staff');
    $this->customer = kdsUser('customer');
});

function kdsUser(string $role): User
{
    $user = User::create(['name' => ucfirst($role).' '.uniqid(), 'email' => $role.'-'.uniqid().'@example.test', 'password' => Hash::make('Strong-Passphrase-922!'), 'is_active' => true]);
    $user->roles()->attach(Role::where('slug', $role)->firstOrFail());

    return $user;
}

function kitchenOrder($test, string $type = 'pickup', array $extra = []): Order
{
    $category = MenuCategory::firstOrCreate(['slug' => 'kds-mains'], ['name' => 'Mains', 'is_active' => true]);
    $item = MenuItem::create(['category_id' => $category->id, 'name' => 'Noodle Bowl', 'slug' => 'kds-'.uniqid(), 'base_price' => '100.00', 'is_active' => true, 'is_available' => true, 'is_sold_out' => false]);
    $order = Order::create($extra + ['order_number' => 'KDS'.uniqid(), 'customer_id' => $test->customer->id, 'customer_name_snapshot' => 'Guest', 'order_type' => $type, 'status' => 'confirmed', 'subtotal' => 100, 'total' => 100, 'currency' => 'PHP']);
    $order->items()->create(['menu_item_id' => $item->id, 'category_id' => $item->category_id, 'item_name_snapshot' => 'Noodle Bowl', 'category_name_snapshot' => 'Mains', 'base_unit_price' => 100, 'quantity' => 1, 'line_total' => 100]);

    return $order;
}

it('keeps ready tickets on the board and lets the kitchen recall them', function () {
    $order = kitchenOrder($this);
    $this->actingAs($this->kitchen)->patchJson("/api/v1/orders/{$order->id}/status", ['status' => 'preparing'])->assertOk();
    $this->patchJson("/api/v1/orders/{$order->id}/status", ['status' => 'ready_to_serve'])->assertOk();

    $this->getJson('/api/v1/kitchen/orders')->assertOk()
        ->assertJsonPath('data.0.status', 'ready_to_serve')
        ->assertJsonPath('data.0.recallable', true)
        ->assertJsonPath('meta.today.done', 1);

    $this->postJson("/api/v1/kitchen/orders/{$order->id}/recall")->assertOk()->assertJsonPath('data.status', 'preparing');
    $this->assertDatabaseHas('order_status_history', ['order_id' => $order->id, 'from_status' => 'ready_to_serve', 'to_status' => 'preparing']);
    // Once it has left the kitchen, the ticket cannot come back.
    $this->patchJson("/api/v1/orders/{$order->id}/status", ['status' => 'ready_to_serve'])->assertOk();
    $order->forceFill(['status' => 'completed'])->save();
    $this->postJson("/api/v1/kitchen/orders/{$order->id}/recall")->assertUnprocessable();
});

it('stops recalling after the recall window', function () {
    $order = kitchenOrder($this, 'pickup', ['status' => 'ready_to_serve']);
    $entry = $order->statusHistory()->create(['to_status' => 'ready_to_serve', 'from_status' => 'preparing']);
    $entry->forceFill(['created_at' => now()->subMinutes(20)])->save();
    $this->actingAs($this->kitchen)->postJson("/api/v1/kitchen/orders/{$order->id}/recall")->assertUnprocessable();
});

it('lets cooks tick dishes off only on open tickets', function () {
    $order = kitchenOrder($this);
    $item = $order->items()->first();
    $this->actingAs($this->kitchen)->patchJson("/api/v1/kitchen/order-items/{$item->id}/prepared", ['prepared' => true])->assertOk();
    expect($item->fresh()->prepared_at)->not->toBeNull();
    expect($this->getJson('/api/v1/kitchen/orders')->json('data.0.items.0.prepared_at'))->not->toBeNull();
    $this->patchJson("/api/v1/kitchen/order-items/{$item->id}/prepared", ['prepared' => false])->assertOk();
    expect($item->fresh()->prepared_at)->toBeNull();
    $order->forceFill(['status' => 'completed'])->save();
    $this->patchJson("/api/v1/kitchen/order-items/{$item->id}/prepared", ['prepared' => true])->assertUnprocessable();
    $this->actingAs($this->customer)->patchJson("/api/v1/kitchen/order-items/{$item->id}/prepared", ['prepared' => true])->assertForbidden();
});

it('tells waiters when a dine-in order is ready to serve', function () {
    $waiter = kdsUser('waiter');
    $order = kitchenOrder($this, 'dine_in', ['status' => 'preparing', 'table_number_snapshot' => 'Table 6']);
    $this->actingAs($this->kitchen)->patchJson("/api/v1/orders/{$order->id}/status", ['status' => 'ready_to_serve'])->assertOk();
    $note = $waiter->notifications()->first();
    expect($note?->data['event'])->toBe('order.ready_for_service')
        ->and($note->data['message'])->toStartWith('Table 6 · ');
    expect($this->kitchen->notifications()->count())->toBe(0);
});
