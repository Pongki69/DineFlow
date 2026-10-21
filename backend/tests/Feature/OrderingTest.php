<?php

use App\Models\MenuCategory;
use App\Models\MenuItem;
use App\Models\MenuItemAddon;
use App\Models\RestaurantTable;
use App\Models\DiningSession;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->seed(\Database\Seeders\AuthSeeder::class);
});

function orderingUser(string $role): User
{
    $user = User::create(['name' => 'Order User', 'email' => $role.'-'.uniqid().'@example.test', 'password' => Hash::make('Strong-Passphrase-922!'), 'is_active' => true]);
    $user->roles()->attach(Role::where('slug', $role)->firstOrFail());
    return $user;
}

function orderableItem(array $overrides = []): MenuItem
{
    $category = MenuCategory::create(['name' => 'Mains', 'slug' => 'mains', 'is_active' => true]);
    return MenuItem::create($overrides + ['category_id' => $category->id, 'name' => 'Noodle Bowl', 'slug' => 'noodle-bowl', 'base_price' => '100.00', 'discount_percent' => '10.00', 'is_active' => true, 'is_available' => true, 'is_sold_out' => false]);
}

it('calculates prices on the server and preserves order item snapshots', function () {
    $customer = orderingUser('customer');
    $item = orderableItem();
    $addon = MenuItemAddon::create(['menu_item_id' => $item->id, 'name' => 'Egg', 'price' => '25.00', 'is_active' => true]);

    $response = $this->actingAs($customer)->postJson('/api/v1/orders', [
        'order_type' => 'pickup', 'items' => [['menu_item_id' => $item->id, 'addon_ids' => [$addon->id], 'quantity' => 2]],
    ]);
    $response->assertCreated()->assertJsonPath('data.subtotal', '250.00')->assertJsonPath('data.item_discount_total', '20.00')->assertJsonPath('data.total', '230.00');
    $order = \App\Models\Order::firstOrFail();
    $item->update(['name' => 'Renamed Dish', 'base_price' => '999.00']);
    expect($order->fresh()->items->first()->item_name_snapshot)->toBe('Noodle Bowl')
        ->and($order->fresh()->items->first()->base_unit_price)->toBe('100.00');
});

it('rejects unavailable menu items and prevents customers from reading other orders', function () {
    $customer = orderingUser('customer');
    $otherCustomer = orderingUser('customer');
    $item = orderableItem(['is_sold_out' => true]);
    $this->actingAs($customer)->postJson('/api/v1/orders', ['order_type' => 'pickup', 'items' => [['menu_item_id' => $item->id, 'quantity' => 1]]])->assertUnprocessable();

    $order = \App\Models\Order::create(['order_number' => 'DFTEST001', 'customer_id' => $otherCustomer->id, 'customer_name_snapshot' => $otherCustomer->name, 'order_type' => 'pickup', 'status' => 'pending', 'subtotal' => 100, 'item_discount_total' => 0, 'service_charge' => 0, 'delivery_fee' => 0, 'tax' => 0, 'total' => 100, 'currency' => 'PHP']);
    $this->actingAs($customer)->getJson('/api/v1/orders/'.$order->id)->assertNotFound();
});

it('supports multiple dine-in orders in one active dining session', function () {
    $customer = orderingUser('customer');
    $waiter = orderingUser('waiter');
    $item = orderableItem(['discount_percent' => 0]);
    $table = RestaurantTable::create(['table_number' => 'T-01', 'qr_code' => (string) \Illuminate\Support\Str::uuid(), 'capacity' => 4, 'is_active' => true]);
    $session = DiningSession::create(['table_id' => $table->id, 'opened_by' => $waiter->id, 'guest_count' => 2, 'status' => 'open', 'opened_at' => now()]);
    $payload = ['order_type' => 'dine_in', 'table_code' => $table->qr_code, 'items' => [['menu_item_id' => $item->id, 'quantity' => 1]]];

    $this->actingAs($customer)->postJson('/api/v1/orders', $payload)->assertCreated()->assertJsonPath('data.dining_session_id', $session->id);
    $this->actingAs($customer)->postJson('/api/v1/orders', $payload)->assertCreated()->assertJsonPath('data.dining_session_id', $session->id);
    expect($session->orders()->count())->toBe(2);
});

it('protects menu administration at the API boundary', function () {
    $customer = orderingUser('customer');
    $this->actingAs($customer)->postJson('/api/v1/menu/categories', ['name' => 'Hidden'])->assertForbidden();
    $manager = orderingUser('manager');
    $this->actingAs($manager)->postJson('/api/v1/menu/categories', ['name' => 'Beverages'])->assertCreated();
});

