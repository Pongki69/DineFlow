<?php

use App\Models\DiningSession;
use App\Models\Order;
use App\Models\RestaurantFloor;
use App\Models\RestaurantTable;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\AuthSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->seed(AuthSeeder::class);
    $this->cashier = counterUser('cashier');
    $this->customer = counterUser('customer');
});

function counterUser(string $role): User
{
    $user = User::create(['name' => ucfirst($role).' '.uniqid(), 'email' => $role.'-'.uniqid().'@example.test', 'password' => Hash::make('Strong-Passphrase-922!'), 'is_active' => true]);
    $user->roles()->attach(Role::where('slug', $role)->firstOrFail());

    return $user;
}

function counterOrder($test, float $subtotal, array $extra = []): Order
{
    $order = Order::create($extra + ['order_number' => 'CTR'.uniqid(), 'customer_id' => $test->customer->id, 'customer_name_snapshot' => 'Guest', 'order_type' => 'pickup', 'status' => 'ready_to_serve', 'subtotal' => $subtotal, 'total' => $subtotal, 'currency' => 'PHP']);
    $order->items()->create(['item_name_snapshot' => 'Adobo', 'category_name_snapshot' => 'Mains', 'base_unit_price' => $subtotal, 'quantity' => 1, 'line_total' => $subtotal]);

    return $order;
}

function counterSession($test): DiningSession
{
    $floor = RestaurantFloor::create(['name' => 'Main', 'slug' => 'main-'.uniqid(), 'is_active' => true]);
    $table = RestaurantTable::create(['floor_id' => $floor->id, 'table_number' => 'Table 6', 'qr_code' => (string) Str::uuid(), 'capacity' => 4, 'is_active' => true, 'operational_status' => 'occupied']);

    return DiningSession::create(['table_id' => $table->id, 'guest_count' => 2, 'status' => 'open', 'opened_at' => now()]);
}

it('takes part payments in cash and works out the change', function () {
    $order = counterOrder($this, 500);
    $this->actingAs($this->cashier)->postJson("/api/v1/orders/{$order->id}/payments/cash", ['amount' => 200, 'tendered' => 500])
        ->assertCreated()->assertJsonPath('data.amount', '200.00')->assertJsonPath('data.change', '300.00');
    $this->getJson('/api/v1/cashier/bill?order_id='.$order->id)->assertOk()->assertJsonPath('data.balance_due', 300);
    $this->postJson("/api/v1/orders/{$order->id}/payments/cash", ['tendered' => 100])->assertUnprocessable()->assertJsonValidationErrors('tendered');
    $this->postJson("/api/v1/orders/{$order->id}/payments/cash", ['tendered' => 300])->assertCreated()->assertJsonPath('data.change', '0.00');
    $this->getJson('/api/v1/cashier/bill?order_id='.$order->id)->assertJsonPath('data.balance_due', 0);
});

it('shows a table bill item by item and applies the Senior Citizen discount', function () {
    $session = counterSession($this);
    // VAT-inclusive prices: ₱112 = ₱100 + 12% VAT.
    counterOrder($this, 112, ['order_type' => 'dine_in', 'status' => 'served', 'dining_session_id' => $session->id]);
    counterOrder($this, 224, ['order_type' => 'dine_in', 'status' => 'served', 'dining_session_id' => $session->id]);
    $this->actingAs($this->cashier)->getJson('/api/v1/cashier/bill?session_id='.$session->id)->assertOk()
        ->assertJsonPath('data.table_number', 'Table 6')->assertJsonCount(2, 'data.orders')
        ->assertJsonPath('data.orders.0.items.0.name', 'Adobo')->assertJsonPath('data.total', 336);

    // One of two guests is a senior: half the bill (₱168 = ₱150 + VAT) is VAT-exempt and 20% off.
    $this->postJson('/api/v1/cashier/discount', ['session_id' => $session->id, 'type' => 'senior', 'id_number' => 'SC-123', 'name' => 'Lola Rosa', 'eligible_guests' => 1, 'total_guests' => 2])
        ->assertOk()->assertJsonPath('data.special_discount', 48)->assertJsonPath('data.total', 288)
        ->assertJsonPath('data.discount.id_number', 'SC-123');
    $this->assertDatabaseHas('audit_logs', ['event' => 'payment.special_discount_applied']);

    $this->deleteJson('/api/v1/cashier/discount', ['session_id' => $session->id])->assertOk()->assertJsonPath('data.total', 336);
    $this->postJson("/api/v1/dining-sessions/{$session->id}/payments/cash", ['amount' => 100])->assertCreated();
    $this->postJson('/api/v1/cashier/discount', ['session_id' => $session->id, 'type' => 'pwd', 'id_number' => 'PWD-1', 'name' => 'Ana', 'eligible_guests' => 1, 'total_guests' => 2])
        ->assertUnprocessable()->assertJsonValidationErrors('discount');
});

it('keeps a cash drawer shift and compares counted cash with expected cash', function () {
    $this->actingAs($this->cashier)->postJson('/api/v1/cashier/shift/open', ['opening_float' => 1000])->assertCreated();
    $this->postJson('/api/v1/cashier/shift/open', ['opening_float' => 500])->assertUnprocessable();
    $order = counterOrder($this, 250);
    $this->postJson("/api/v1/orders/{$order->id}/payments/cash", ['tendered' => 300])->assertCreated();
    $this->getJson('/api/v1/cashier/shift')->assertOk()->assertJsonPath('data.current.expected_cash', 1250)->assertJsonPath('data.current.cash_received', 250);
    $this->postJson('/api/v1/cashier/shift/close', ['counted_cash' => 1240, 'notes' => 'Short by 10'])
        ->assertOk()->assertJsonPath('data.difference', -10)->assertJsonPath('data.expected_cash', 1250);
    $this->getJson('/api/v1/cashier/shift')->assertJsonPath('data.current', null)->assertJsonPath('data.last.counted_cash', 1240);
});

it('lets a waiter ask for the bill and tells the cashier', function () {
    $waiter = counterUser('waiter');
    $session = counterSession($this);
    counterOrder($this, 300, ['order_type' => 'dine_in', 'status' => 'served', 'dining_session_id' => $session->id]);
    $this->actingAs($waiter)->postJson("/api/v1/dining-sessions/{$session->id}/request-bill")->assertOk();
    $note = $this->cashier->notifications()->first();
    expect($note?->data['event'])->toBe('bill.requested')->and($note->data['message'])->toBe('Table 6 asked for the bill (₱300.00).');
    $this->actingAs($this->cashier)->getJson('/api/v1/dining-sessions/open-bills')->assertJsonPath('data.0.bill_requested_at', fn ($value) => $value !== null);
    // Paying the whole bill answers the request.
    $this->postJson("/api/v1/dining-sessions/{$session->id}/payments/cash", ['tendered' => 500])->assertCreated()->assertJsonPath('data.change', '200.00');
    expect($session->fresh()->bill_requested_at)->toBeNull();
    $this->actingAs($this->customer)->postJson("/api/v1/dining-sessions/{$session->id}/request-bill")->assertForbidden();
});
