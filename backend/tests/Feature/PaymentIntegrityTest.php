<?php

use App\Models\Payment;
use App\Models\PaymentTransaction;
use Database\Seeders\AuthSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->seed(AuthSeeder::class);
    config(['services.paymongo.secret' => 'sk_test_fixture', 'services.paymongo.webhook_secret' => 'fixture-signing-secret']);
});

function pendingPaymentFixture($test): Payment
{
    $item = orderableItem();
    $order = $test->actingAs(orderingUser('customer'))->postJson('/api/v1/orders', ['order_type' => 'pickup', 'items' => [['menu_item_id' => $item->id, 'quantity' => 1]]])->assertCreated()->json('data');

    return Payment::create(['order_id' => $order['id'], 'method' => 'online', 'purpose' => 'order', 'status' => 'pending', 'amount' => $order['total'], 'currency' => 'PHP', 'provider' => 'paymongo', 'reference_number' => 'DF-PAY-TEST', 'checkout_session_id' => 'cs_fixture']);
}

function paidWebhook(Payment $payment, int $amount = 9000, string $currency = 'PHP', bool $live = false, string $eventId = 'evt_fixture'): array
{
    return ['data' => ['id' => $eventId, 'attributes' => ['type' => 'checkout_session.payment.paid', 'livemode' => $live, 'data' => [
        'id' => 'cs_fixture', 'attributes' => ['reference_number' => $payment->reference_number, 'payments' => [
            ['id' => 'pay_fixture', 'attributes' => ['status' => 'paid', 'amount' => $amount, 'currency' => $currency]],
        ]],
    ]]]];
}

function sendSignedWebhook($test, array $event, ?int $timestamp = null, bool $valid = true)
{
    $raw = json_encode($event, JSON_UNESCAPED_SLASHES);
    $time = $timestamp ?? time();
    $signature = hash_hmac('sha256', $time.'.'.$raw, $valid ? 'fixture-signing-secret' : 'wrong-secret');

    return $test->call('POST', '/api/v1/webhooks/paymongo', [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json', 'HTTP_PAYMONGO_SIGNATURE' => "t=$time,te=$signature,li=$signature"], $raw);
}

it('requires a valid current signature and reconciles the same event once', function () {
    $payment = pendingPaymentFixture($this);
    $event = paidWebhook($payment);
    sendSignedWebhook($this, $event, valid: false)->assertUnauthorized();
    sendSignedWebhook($this, $event, time() - 600)->assertUnauthorized();
    expect($payment->fresh()->status)->toBe('pending');
    sendSignedWebhook($this, $event)->assertOk()->assertJsonPath('outcome', 'paid');
    sendSignedWebhook($this, $event)->assertOk()->assertJsonPath('outcome', 'duplicate');
    expect($payment->fresh()->status)->toBe('paid');
    expect($payment->order->fresh()->status)->toBe('confirmed');
    expect(PaymentTransaction::where('provider_event_id', 'evt_fixture')->count())->toBe(1);
});

it('does not accept a mismatched amount currency or live-mode event', function () {
    $payment = pendingPaymentFixture($this);
    foreach ([[1, 'PHP', false], [9000, 'USD', false], [9000, 'PHP', true]] as $index => [$amount, $currency, $live]) {
        sendSignedWebhook($this, paidWebhook($payment, $amount, $currency, $live, 'evt_bad_'.$index))->assertOk()->assertJsonPath('outcome', 'amount_or_mode_mismatch');
    }
    expect($payment->fresh()->status)->toBe('pending');
    expect(PaymentTransaction::count())->toBe(0);
});

it('keeps payment details private and does not pay an order from a return URL', function () {
    $payment = pendingPaymentFixture($this);
    $this->actingAs(orderingUser('customer'))->getJson('/api/v1/payments/'.$payment->id)->assertNotFound();
    $this->get('/payment-return?payment_id='.$payment->id.'&result=success');
    expect($payment->fresh()->status)->toBe('pending');
});
