<?php

use App\Models\Delivery;
use App\Models\DeliveryAddress;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Reservation;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\AuthSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->seed(AuthSeeder::class);
    $this->customer = User::create(['name' => 'Delete Test', 'email' => 'delete@example.test', 'password' => 'Delete-Account-123!', 'is_active' => true]);
    $this->customer->roles()->attach(Role::where('slug', 'customer')->firstOrFail());
    $this->customer->customerProfile()->create();
    $this->payload = ['current_password' => 'Delete-Account-123!', 'confirmation' => true];
    $this->order = Order::create(['order_number' => 'DELETE-COMPLETE', 'customer_id' => $this->customer->id, 'customer_name_snapshot' => $this->customer->name, 'customer_email_snapshot' => $this->customer->email, 'order_type' => 'delivery', 'status' => 'completed', 'delivery_address' => 'Private road', 'delivery_recipient_name' => 'Private recipient', 'delivery_phone' => '09170000000', 'delivery_latitude' => 14.2, 'delivery_longitude' => 121.2, 'subtotal' => 100, 'total' => 100, 'currency' => 'PHP']);
});

it('deletes only the authenticated customer and personal data while retaining anonymized completed transactions', function () {
    $address = DeliveryAddress::create(['user_id' => $this->customer->id, 'label' => 'Home', 'formatted_address' => 'Private road', 'recipient_name' => 'Private recipient', 'phone' => '09170000000', 'latitude' => 14.2, 'longitude' => 121.2]);
    $payment = Payment::create(['order_id' => $this->order->id, 'method' => 'cash', 'status' => 'paid', 'amount' => 100, 'currency' => 'PHP']);
    $reservation = Reservation::create(['reference' => 'DELETE-BOOKING', 'customer_id' => $this->customer->id, 'guest_name' => 'Private name', 'guest_email' => $this->customer->email, 'guest_phone' => '09170000000', 'guest_count' => 2, 'starts_at' => now()->subDays(2), 'ends_at' => now()->subDays(2)->addHour(), 'duration_minutes' => 60, 'status' => 'completed']);
    $token = $this->customer->createToken('Other device')->accessToken;
    $rider = User::create(['name' => 'Review rider', 'email' => 'review-rider@example.test', 'password' => 'Review-Test-123!']);
    $delivery = Delivery::create(['order_id' => $this->order->id, 'rider_user_id' => $rider->id, 'status' => 'delivered']);
    DB::table('delivery_ratings')->insert(['delivery_id' => $delivery->id, 'rider_user_id' => $rider->id, 'customer_id' => $this->customer->id, 'rating' => 5, 'comment' => 'Private review', 'show_name' => true, 'created_at' => now(), 'updated_at' => now()]);
    DB::table('sessions')->insert(['id' => 'other-device-session', 'user_id' => $this->customer->id, 'payload' => '', 'last_activity' => time()]);
    DB::table('password_reset_tokens')->insert(['email' => $this->customer->email, 'token' => 'test-token', 'created_at' => now()]);
    $other = User::create(['name' => 'Untouched', 'email' => 'untouched@example.test', 'password' => 'Untouched-Test-123!']);
    $this->actingAs($this->customer)->deleteJson('/api/v1/me', $this->payload + ['user_id' => $other->id])->assertOk();
    $this->assertDatabaseMissing('users', ['id' => $this->customer->id]);
    $this->assertDatabaseMissing('customer_profiles', ['user_id' => $this->customer->id]);
    $this->assertDatabaseMissing('delivery_addresses', ['id' => $address->id]);
    $this->assertDatabaseMissing('personal_access_tokens', ['id' => $token->id]);
    $this->assertDatabaseMissing('sessions', ['user_id' => $this->customer->id]);
    $this->assertDatabaseMissing('password_reset_tokens', ['email' => $this->customer->email]);
    $this->assertDatabaseMissing('delivery_ratings', ['customer_id' => $this->customer->id]);
    expect($other->fresh()->name)->toBe('Untouched');
    expect($this->order->fresh())->toMatchArray(['customer_id' => null, 'customer_name_snapshot' => 'Deleted customer', 'customer_email_snapshot' => null, 'delivery_address' => null, 'delivery_latitude' => null, 'delivery_phone' => null]);
    expect($payment->fresh()->amount)->toBe('100.00');
    expect($reservation->fresh())->toMatchArray(['customer_id' => null, 'guest_name' => 'Deleted customer', 'guest_email' => null, 'guest_phone' => null]);
    $this->assertDatabaseHas('audit_logs', ['event' => 'account.deleted', 'actor_id' => null]);
});

it('requires a correct password and explicit confirmation without changing the account', function () {
    $this->actingAs($this->customer)->deleteJson('/api/v1/me', ['current_password' => 'Wrong-Password-123!', 'confirmation' => true])->assertUnprocessable()->assertJsonValidationErrors('current_password');
    $this->deleteJson('/api/v1/me', ['current_password' => 'Delete-Account-123!', 'confirmation' => false])->assertUnprocessable()->assertJsonValidationErrors('confirmation');
    expect($this->customer->fresh())->not->toBeNull();
    expect($this->order->fresh()->customer_name_snapshot)->toBe('Delete Test');
});

it('rejects staff and mixed-role accounts and requires authentication', function () {
    $this->deleteJson('/api/v1/me', $this->payload)->assertUnauthorized();
    $this->customer->roles()->attach(Role::where('slug', 'administrator')->firstOrFail());
    $this->actingAs($this->customer)->deleteJson('/api/v1/me', $this->payload)->assertForbidden();
    expect($this->customer->fresh())->not->toBeNull();
});

it('blocks active orders, deliveries, bookings and pending payments without partial deletion', function (string $blocker) {
    if ($blocker === 'order') {
        $this->order->update(['status' => 'preparing']);
    }
    if ($blocker === 'delivery') {
        Delivery::create(['order_id' => $this->order->id, 'status' => 'in_transit']);
    }
    if ($blocker === 'reservation') {
        Reservation::create(['reference' => 'DELETE-ACTIVE', 'customer_id' => $this->customer->id, 'guest_name' => 'Keep customer', 'guest_count' => 2, 'starts_at' => now()->addDay(), 'ends_at' => now()->addDay()->addHour(), 'duration_minutes' => 60, 'status' => 'confirmed']);
    }
    if ($blocker === 'payment') {
        Payment::create(['order_id' => $this->order->id, 'method' => 'online', 'status' => 'pending', 'amount' => 100, 'currency' => 'PHP']);
    }
    if ($blocker === 'refund') {
        $payment = Payment::create(['order_id' => $this->order->id, 'method' => 'online', 'status' => 'paid', 'amount' => 100, 'currency' => 'PHP']);
        $payment->transactions()->create(['transaction_type' => 'refund', 'status' => 'pending', 'amount' => 100]);
    }
    $this->actingAs($this->customer)->deleteJson('/api/v1/me', $this->payload)->assertUnprocessable()->assertJsonValidationErrors('account');
    expect($this->customer->fresh())->not->toBeNull();
    expect($this->order->fresh()->customer_name_snapshot)->toBe('Delete Test');
    $this->assertDatabaseMissing('audit_logs', ['event' => 'account.deleted']);
})->with(['order', 'delivery', 'reservation', 'payment', 'refund']);

it('deletes a remembered account without recreating its user and rejects old remembered access', function () {
    config(['sanctum.stateful' => ['localhost']]);
    $this->withHeaders(['Origin' => 'http://localhost', 'Referer' => 'http://localhost/']);
    $this->withCredentials();
    $name = Auth::guard('web')->getRecallerName();
    $login = $this->postJson('/api/v1/login', ['email' => $this->customer->email, 'password' => 'Delete-Account-123!', 'remember' => true])->assertOk();
    $cookie = $login->getCookie($name, false)->getValue();
    $this->withUnencryptedCookie($name, $cookie)->deleteJson('/api/v1/me', $this->payload)->assertOk()->assertCookieExpired($name);
    $this->assertDatabaseMissing('users', ['id' => $this->customer->id]);
    $this->flushSession();
    Auth::forgetGuards();
    $this->withUnencryptedCookie($name, $cookie)->getJson('/api/v1/me')->assertUnauthorized();
});

it('rate limits password guesses without deleting the account', function () {
    $this->actingAs($this->customer);
    for ($attempt = 0; $attempt < 3; $attempt++) {
        $this->deleteJson('/api/v1/me', ['current_password' => 'Wrong-Password-123!', 'confirmation' => true])->assertUnprocessable();
    }
    $this->deleteJson('/api/v1/me', $this->payload)->assertTooManyRequests();
    expect($this->customer->fresh())->not->toBeNull();
});
