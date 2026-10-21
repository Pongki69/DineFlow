<?php

use App\Models\DiningSession;
use App\Models\RestaurantSetting;
use App\Services\ReservationService;
use Carbon\CarbonImmutable;
use Database\Seeders\AuthSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;

uses(RefreshDatabase::class);
beforeEach(fn () => $this->seed(AuthSeeder::class));

it('replays an order submission without another order and rejects changed details', function () {
    $customer = orderingUser('customer');
    $item = orderableItem();
    $body = ['order_type' => 'pickup', 'items' => [['menu_item_id' => $item->id, 'quantity' => 1]]];
    $first = $this->actingAs($customer)->withHeader('Idempotency-Key', 'order-retry-123')->postJson('/api/v1/orders', $body)->assertCreated();
    $this->postJson('/api/v1/orders', $body)->assertCreated()->assertHeader('Idempotency-Replayed', 'true')->assertJsonPath('data.id', $first->json('data.id'));
    $body['items'][0]['quantity'] = 2;
    $this->postJson('/api/v1/orders', $body)->assertConflict()->assertJsonPath('code', 'idempotency_conflict');
    $this->assertDatabaseCount('orders', 1);
    $other = orderingUser('customer');
    $this->actingAs($other)->postJson('/api/v1/orders', $body)->assertCreated();
    $this->assertDatabaseCount('orders', 2);
});

it('does not reserve idempotency keys on failed validation', function () {
    $this->actingAs(orderingUser('customer'))->withHeader('Idempotency-Key', 'correctable-retry')->postJson('/api/v1/orders', [])->assertUnprocessable()->assertJsonPath('code', 'validation_failed');
    $this->assertDatabaseCount('idempotency_requests', 0);
});

it('allows profile changes but requires the current password and never accepts role changes', function () {
    $customer = orderingUser('customer');
    $this->actingAs($customer)->patchJson('/api/v1/me', ['name' => 'Updated Customer', 'roles' => ['administrator']])->assertOk()->assertJsonPath('user.name', 'Updated Customer');
    expect($customer->fresh()->hasRole('administrator'))->toBeFalse();
    $this->patchJson('/api/v1/me', ['name' => 'Updated Customer', 'password' => 'New-Strong-Password-123!', 'password_confirmation' => 'New-Strong-Password-123!'])->assertUnprocessable();
    $this->patchJson('/api/v1/me', ['name' => 'Updated Customer', 'current_password' => 'Strong-Passphrase-922!', 'password' => 'New-Strong-Password-123!', 'password_confirmation' => 'New-Strong-Password-123!'])->assertOk();
    expect(Hash::check('New-Strong-Password-123!', $customer->fresh()->password))->toBeTrue();
});

it('keeps the customer owner when staff reschedule and opens a session only when seated', function () {
    [$floor, $table] = publishedFloorWithTable();
    $customer = reservationUser('customer');
    $staff = reservationUser('waiter');
    $service = app(ReservationService::class);
    $booking = $service->create($customer, ['guest_name' => 'Guest', 'guest_count' => 2, 'table_id' => $table->id, 'starts_at' => now()->addDays(2)->setTime(14, 0)->toIso8601String()])['reservation'];
    $changed = $service->reschedule($booking, $staff, ['table_id' => $table->id, 'starts_at' => now()->addDays(3)->setTime(14, 0)->toIso8601String()])['reservation'];
    expect($changed->customer_id)->toBe($customer->id);
    $this->assertDatabaseCount('dining_sessions', 0);
    $service->transition($changed, $staff, 'checked_in');
    $service->transition($changed, $staff, 'seated');
    expect(DiningSession::where('reservation_id', $changed->id)->where('status', 'open')->exists())->toBeTrue();
    expect($table->fresh()->operational_status)->toBe('occupied');
    $service->transition($changed, $staff, 'completed');
    expect($table->fresh()->operational_status)->toBe('cleaning');
});

it('blocks closing a table with unpaid orders', function () {
    $customer = orderingUser('customer');
    $staff = orderingUser('waiter');
    [$floor, $table] = publishedFloorWithTable();
    $session = DiningSession::create(['table_id' => $table->id, 'opened_by' => $staff->id, 'guest_count' => 2, 'status' => 'open', 'opened_at' => now()]);
    $item = orderableItem();
    $this->actingAs($customer)->postJson('/api/v1/orders', ['order_type' => 'dine_in', 'table_code' => $table->qr_code, 'items' => [['menu_item_id' => $item->id, 'quantity' => 1]]])->assertCreated();
    $this->actingAs($staff)->patchJson('/api/v1/service/dining-sessions/'.$session->id.'/close')->assertUnprocessable();
    expect($session->fresh()->status)->toBe('open');
});

it('returns readiness without exposing connection credentials', function () {
    $this->getJson('/api/v1/health')->assertOk()->assertExactJson(['status' => 'ok', 'checks' => ['database' => 'ok']]);
});

it('retains the turnover buffer promised by existing reservations after policy changes', function () {
    [$floor, $table] = publishedFloorWithTable();
    $service = app(ReservationService::class);
    $start = CarbonImmutable::now()->addDays(2)->setTime(14, 0);
    $service->create(reservationUser('customer'), ['guest_name' => 'Guest', 'guest_count' => 2, 'table_id' => $table->id, 'starts_at' => $start->toIso8601String()]);
    RestaurantSetting::updateOrCreate(['key' => 'reservation_policy'], ['value' => ['buffer_minutes' => 0]]);
    expect($service->availability($start->addMinutes(100), 2)[0]['available'])->toBeFalse();
    expect($service->availability($start->addMinutes(120), 2)[0]['available'])->toBeTrue();
});

it('stores restaurant-local bookings in UTC and checks availability in the same instant', function () {
    RestaurantSetting::create(['key' => 'business_profile', 'value' => ['timezone' => 'Asia/Manila']]);
    [$floor, $table] = publishedFloorWithTable();
    $start = CarbonImmutable::now('Asia/Manila')->addDays(2)->setTime(18, 0);
    $service = app(ReservationService::class);
    $reservation = $service->create(reservationUser('customer'), ['guest_name' => 'Guest', 'guest_count' => 2, 'table_id' => $table->id, 'starts_at' => $start->toIso8601String()])['reservation'];
    expect($reservation->fresh()->starts_at->format('H:i'))->toBe('10:00');
    expect($service->availability($start->utc(), 2)[0]['available'])->toBeFalse();
});
