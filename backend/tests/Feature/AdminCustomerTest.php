<?php

use App\Models\Order;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\AuthSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->seed(AuthSeeder::class);
});

function customerAdminUser(string $role, string $name = 'Someone'): User
{
    $user = User::create(['name' => $name, 'email' => $role.'-'.uniqid().'@example.test', 'password' => Hash::make('Strong-Passphrase-922!'), 'is_active' => true]);
    $user->roles()->attach(Role::where('slug', $role)->firstOrFail());

    return $user;
}

function customerOrder(User $customer, string $status, string $total): Order
{
    return Order::create([
        'order_number' => 'T-'.uniqid(), 'customer_id' => $customer->id, 'customer_name_snapshot' => $customer->name,
        'order_type' => 'pickup', 'status' => $status, 'subtotal' => $total, 'total' => $total,
    ]);
}

it('lists only customers, with their activity, for administrators', function () {
    $admin = customerAdminUser('administrator', 'Admin');
    $maria = customerAdminUser('customer', 'Maria Santos');
    customerAdminUser('customer', 'Juan Cruz');
    customerAdminUser('cashier', 'Ben Cashier');
    customerOrder($maria, 'completed', '250.00');
    customerOrder($maria, 'served', '150.00');
    customerOrder($maria, 'cancelled', '999.00');

    $response = $this->actingAs($admin)->getJson('/api/v1/admin/customers')->assertOk();
    expect(collect($response->json('data'))->pluck('name')->all())->toBe(['Juan Cruz', 'Maria Santos']);
    $row = collect($response->json('data'))->firstWhere('name', 'Maria Santos');
    // Cancelled orders do not count toward orders or spending.
    expect($row['orders_count'])->toBe(2)->and($row['total_spent'])->toEqual(400);

    $this->getJson('/api/v1/admin/customers?search=mari')->assertOk()->assertJsonCount(1, 'data');
    $this->getJson("/api/v1/admin/customers/{$maria->id}")->assertOk()
        ->assertJsonPath('data.email', $maria->email)->assertJsonCount(3, 'data.recent_orders');
});

it('deletes a customer but keeps their order history without contact details', function () {
    $admin = customerAdminUser('administrator');
    $customer = customerAdminUser('customer', 'Maria Santos');
    $done = customerOrder($customer, 'completed', '250.00');

    $this->actingAs($admin)->deleteJson("/api/v1/admin/customers/{$customer->id}")->assertOk();
    expect(User::find($customer->id))->toBeNull();
    $done->refresh();
    expect($done->customer_name_snapshot)->toBe('Deleted customer')->and((float) $done->total)->toBe(250.0);
    $this->assertDatabaseHas('audit_logs', ['actor_id' => $admin->id, 'event' => 'customer.deleted']);
});

it('refuses to delete a customer with an order in progress, or a staff account', function () {
    $admin = customerAdminUser('administrator');
    $customer = customerAdminUser('customer');
    customerOrder($customer, 'preparing', '120.00');
    $this->actingAs($admin)->deleteJson("/api/v1/admin/customers/{$customer->id}")
        ->assertUnprocessable()->assertJsonValidationErrors('account');
    expect(User::find($customer->id))->not->toBeNull();

    $cashier = customerAdminUser('cashier');
    $this->deleteJson("/api/v1/admin/customers/{$cashier->id}")->assertNotFound();
    $this->actingAs($cashier)->deleteJson("/api/v1/admin/customers/{$customer->id}")->assertForbidden();
});

it('keeps customer records from staff without account access and hides staff from the customer view', function () {
    $cashier = customerAdminUser('cashier');
    $customer = customerAdminUser('customer');
    $this->actingAs($cashier)->getJson('/api/v1/admin/customers')->assertForbidden();

    $admin = customerAdminUser('administrator');
    $this->actingAs($admin)->getJson("/api/v1/admin/customers/{$cashier->id}")->assertNotFound();
    $this->getJson("/api/v1/admin/customers/{$customer->id}")->assertOk();
});
