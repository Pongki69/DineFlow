<?php

namespace App\Services;

use App\Models\DiningSession;
use App\Models\Order;
use App\Models\Payment;
use App\Models\PaymentAllocation;
use App\Models\PaymentTransaction;
use App\Models\PaymentWebhookEvent;
use App\Models\Reservation;
use App\Models\RestaurantSetting;
use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\ValidationException;
use RuntimeException;

class PaymentService
{
    public function __construct(private PayMongoGateway $gateway, private AuditLogService $audit) {}

    public function policy(): array
    {
        return array_replace(['cash_enabled' => true, 'payment_method_types' => ['card', 'gcash', 'qrph']], RestaurantSetting::where('key', 'payment_policy')->value('value') ?? []) + ['configured' => (bool) config('services.paymongo.secret'), 'mode' => str_starts_with((string) config('services.paymongo.secret'), 'sk_live_') ? 'live' : 'test'];
    }

    public function savePolicy(array $data): array
    {
        RestaurantSetting::updateOrCreate(['key' => 'payment_policy'], ['value' => $data]);
        return $this->policy();
    }

    public function checkoutOrder(Order $order, User $actor): array
    {
        $plan = DB::transaction(function () use ($order, $actor): array {
            $locked = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
            if (in_array($locked->status, ['completed', 'cancelled'], true)) throw ValidationException::withMessages(['order' => 'Online payment is unavailable for completed or cancelled orders. Contact the restaurant if the payment record needs correction.']);
            $existing = $locked->payments()->where('status', 'pending')->latest()->first();
            if ($existing) return ['payment' => $existing, 'existing' => true];
            $this->assertNoPending($locked);
            $amount = $this->orderDueCents($locked);
            if ($amount < 1) throw ValidationException::withMessages(['order' => 'This order has no remaining balance.']);
            return $this->createPending(['order_id' => $locked->id, 'purpose' => 'order'], $amount, $locked->currency, $locked->order_number, $actor, $locked->customer_email_snapshot);
        }, 3);
        return $this->openCheckout($plan);
    }

    public function checkoutSession(DiningSession $session, User $actor): array
    {
        $plan = DB::transaction(function () use ($session, $actor): array {
            $locked = DiningSession::whereKey($session->id)->lockForUpdate()->firstOrFail();
            if ($locked->status !== 'open') throw ValidationException::withMessages(['dining_session' => 'This dining bill is closed.']);
            $existing = Payment::where('dining_session_id', $locked->id)->where('status', 'pending')->latest()->first();
            if ($existing) return ['payment' => $existing, 'existing' => true];
            $orders = Order::where('dining_session_id', $locked->id)->whereNotIn('status', ['cancelled'])->lockForUpdate()->get();
            if ($orders->isEmpty()) throw ValidationException::withMessages(['dining_session' => 'There are no orders on this dining bill.']);
            foreach ($orders as $order) $this->assertNoPending($order);
            if (Payment::where('dining_session_id', $locked->id)->where('status', 'pending')->exists()) throw ValidationException::withMessages(['payment' => 'A checkout is already open for this bill.']);
            $amount = $orders->sum(fn (Order $order) => $this->orderDueCents($order));
            if ($amount < 1) throw ValidationException::withMessages(['dining_session' => 'This dining bill has no remaining balance.']);
            return $this->createPending(['dining_session_id' => $locked->id, 'purpose' => 'dining_session'], $amount, 'PHP', 'Table '.$locked->table_id.' bill', $actor);
        }, 3);
        return $this->openCheckout($plan);
    }

    public function checkoutReservation(Reservation $reservation, User $actor): array
    {
        $plan = DB::transaction(function () use ($reservation, $actor): array {
            $locked = Reservation::whereKey($reservation->id)->lockForUpdate()->firstOrFail();
            if (! in_array($locked->status, ['pending', 'confirmed'], true)) throw ValidationException::withMessages(['reservation' => 'This reservation is not eligible for a deposit.']);
            $policy = app(ReservationService::class)->policy();
            if (! ($policy['deposit_required'] ?? false)) throw ValidationException::withMessages(['reservation' => 'Reservation deposits are not enabled.']);
            if ($locked->payments()->where('status', 'paid')->exists()) throw ValidationException::withMessages(['reservation' => 'The reservation deposit has already been paid.']);
            $existing = $locked->payments()->where('status', 'pending')->latest()->first();
            if ($existing) return ['payment' => $existing, 'existing' => true];
            $amount = $this->cents($policy['deposit_amount'] ?? 0);
            if ($amount < 100) throw ValidationException::withMessages(['reservation' => 'The configured reservation deposit must be at least ₱1.00.']);
            return $this->createPending(['reservation_id' => $locked->id, 'purpose' => 'reservation_deposit'], $amount, 'PHP', $locked->reference, $actor, $locked->guest_email);
        }, 3);
        return $this->openCheckout($plan);
    }

    public function recordCashOrder(Order $order, User $actor): Payment
    {
        return DB::transaction(function () use ($order, $actor): Payment {
            $locked = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
            if (! $this->policy()['cash_enabled']) throw ValidationException::withMessages(['method' => 'Cash payments are currently disabled.']);
            if ($locked->status === 'cancelled') throw ValidationException::withMessages(['order' => 'This order is no longer payable.']);
            $this->assertNoPending($locked);
            $amount = $this->orderDueCents($locked);
            if ($amount < 1) throw ValidationException::withMessages(['order' => 'This order has no remaining balance.']);
            $payment = Payment::create(['order_id' => $locked->id, 'purpose' => 'order', 'method' => 'cash', 'status' => 'paid', 'amount' => $this->money($amount), 'currency' => $locked->currency, 'received_by' => $actor->id, 'paid_at' => now(), 'reference_number' => $this->reference()]);
            $payment->transactions()->create(['transaction_type' => 'cash_payment', 'status' => 'paid', 'amount' => $payment->amount, 'notes' => 'Cash payment recorded by '.$actor->name]);
            $this->applyToOrder($locked, $amount, $payment, $actor);
            app(RestaurantNotificationService::class)->send($locked->customer, 'payment.paid', 'Payment received', 'Cash payment for order '.$locked->order_number.' was recorded.', ['payment_id' => $payment->id, 'order_id' => $locked->id, 'amount' => $payment->amount]);
            $this->audit->record($actor, 'payment.cash_received', $payment, ['amount' => $payment->amount], request());
            return $payment->fresh();
        }, 3);
    }

    public function recordCashSession(DiningSession $session, User $actor): Payment
    {
        return DB::transaction(function () use ($session, $actor): Payment {
            $locked = DiningSession::whereKey($session->id)->lockForUpdate()->firstOrFail();
            if (! $this->policy()['cash_enabled']) throw ValidationException::withMessages(['method' => 'Cash payments are currently disabled.']);
            if ($locked->status !== 'open') throw ValidationException::withMessages(['dining_session' => 'This dining session is no longer open for payment.']);
            $orders = Order::where('dining_session_id', $locked->id)->whereNotIn('status', ['cancelled'])->lockForUpdate()->get();
            foreach ($orders as $order) $this->assertNoPending($order);
            if (Payment::where('dining_session_id', $locked->id)->where('status', 'pending')->exists()) throw ValidationException::withMessages(['payment' => 'A checkout is already open for this bill.']);
            $amount = $orders->sum(fn (Order $order) => $this->orderDueCents($order));
            if ($amount < 1) throw ValidationException::withMessages(['dining_session' => 'This dining bill has no remaining balance.']);
            $payment = Payment::create(['dining_session_id' => $locked->id, 'purpose' => 'dining_session', 'method' => 'cash', 'status' => 'paid', 'amount' => $this->money($amount), 'currency' => 'PHP', 'received_by' => $actor->id, 'paid_at' => now(), 'reference_number' => $this->reference()]);
            $payment->transactions()->create(['transaction_type' => 'cash_payment', 'status' => 'paid', 'amount' => $payment->amount, 'notes' => 'Cash dining bill recorded by '.$actor->name]);
            $this->allocateSession($payment, $actor);
            foreach (Order::where('dining_session_id', $locked->id)->with('customer')->get() as $billOrder) {
                app(RestaurantNotificationService::class)->send($billOrder->customer, 'payment.paid', 'Payment received', 'Cash payment for your dining bill was recorded.', ['payment_id' => $payment->id, 'order_id' => $billOrder->id, 'amount' => $payment->amount]);
            }
            $this->audit->record($actor, 'payment.cash_received', $payment, ['amount' => $payment->amount, 'dining_session_id' => $locked->id], request());
            return $payment->fresh();
        }, 3);
    }

    public function recordCashReservationDeposit(Reservation $reservation, User $actor): Payment
    {
        return DB::transaction(function () use ($reservation, $actor): Payment {
            $locked = Reservation::whereKey($reservation->id)->lockForUpdate()->firstOrFail();
            $policy = app(ReservationService::class)->policy();
            if (! $this->policy()['cash_enabled'] || ! ($policy['deposit_required'] ?? false)) throw ValidationException::withMessages(['payment' => 'Cash reservation deposits are not enabled.']);
            if (! in_array($locked->status, ['pending', 'confirmed'], true) || $locked->payments()->where('status', 'paid')->exists()) throw ValidationException::withMessages(['reservation' => 'This reservation is not eligible for a deposit payment.']);
            if ($locked->payments()->where('status', 'pending')->exists()) throw ValidationException::withMessages(['payment' => 'Cancel the active deposit checkout before recording cash.']);
            $amount = $this->cents($policy['deposit_amount'] ?? 0);
            if ($amount < 100) throw ValidationException::withMessages(['reservation' => 'The configured reservation deposit must be at least ₱1.00.']);
            $payment = Payment::create(['reservation_id' => $locked->id, 'purpose' => 'reservation_deposit', 'method' => 'cash', 'status' => 'paid', 'amount' => $this->money($amount), 'currency' => 'PHP', 'received_by' => $actor->id, 'paid_at' => now(), 'reference_number' => $this->reference()]);
            $payment->transactions()->create(['transaction_type' => 'cash_payment', 'status' => 'paid', 'amount' => $payment->amount, 'notes' => 'Cash reservation deposit recorded by '.$actor->name]);
            $this->confirmDepositReservation($locked);
            app(RestaurantNotificationService::class)->send($locked->customer, 'payment.paid', 'Deposit received', 'Your reservation deposit was recorded.', ['payment_id' => $payment->id, 'reservation_id' => $locked->id, 'reference' => $locked->reference, 'amount' => $payment->amount]);
            $this->audit->record($actor, 'payment.cash_received', $payment, ['amount' => $payment->amount, 'reservation_id' => $locked->id], request());
            return $payment->fresh();
        }, 3);
    }

    public function refund(Payment $payment, User $actor, string $reason, string $notes): Payment
    {
        if ($payment->status !== 'paid') throw ValidationException::withMessages(['payment' => 'Only paid payments can be refunded.']);
        if ($payment->method === 'cash') {
            $updated = DB::transaction(function () use ($payment, $actor, $reason, $notes): Payment {
                $locked = Payment::whereKey($payment->id)->lockForUpdate()->firstOrFail();
                if ($locked->status !== 'paid') throw ValidationException::withMessages(['payment' => 'This payment is no longer refundable.']);
                $locked->update(['status' => 'refunded', 'refunded_at' => now()]);
                $locked->transactions()->create(['transaction_type' => 'refund', 'status' => 'succeeded', 'amount' => $locked->amount, 'notes' => $reason.': '.$notes]);
                return $locked;
            }, 3);
        } else {
            if (! $payment->provider_payment_id) throw ValidationException::withMessages(['payment' => 'The provider payment reference is not available for a refund.']);
            $transaction = DB::transaction(function () use ($payment, $reason, $notes): PaymentTransaction {
                $locked = Payment::whereKey($payment->id)->lockForUpdate()->firstOrFail();
                if ($locked->status !== 'paid') throw ValidationException::withMessages(['payment' => 'This payment is no longer refundable.']);
                $active = $locked->transactions()->where('transaction_type', 'refund')->whereIn('status', ['pending', 'processing'])->latest()->first();
                if ($active) return $active;
                return $locked->transactions()->create(['transaction_type' => 'refund', 'status' => 'pending', 'amount' => $locked->amount, 'idempotency_key' => 'refund-'.$locked->id.'-'.str()->uuid(), 'notes' => $reason.': '.$notes]);
            }, 3);
            $provider = $this->gateway->refund($payment->provider_payment_id, $this->cents($payment->amount), $reason, $transaction->idempotency_key);
            $attributes = $provider['attributes'] ?? [];
            $status = in_array($attributes['status'] ?? '', ['pending', 'processing', 'succeeded', 'failed'], true) ? $attributes['status'] : 'pending';
            $transaction->update(['provider_transaction_id' => $provider['id'] ?? null, 'status' => $status, 'response_payload' => ['status' => $status, 'amount' => $attributes['amount'] ?? null, 'reason' => $attributes['reason'] ?? $reason]]);
            if ($status === 'succeeded') $payment->update(['status' => 'refunded', 'refunded_at' => now()]);
            $updated = $payment->fresh();
        }
        $this->audit->record($actor, 'payment.refunded', $updated, ['reason' => $reason, 'notes' => $notes], request());
        $updated->loadMissing(['order.customer', 'reservation.customer']);
        app(RestaurantNotificationService::class)->send($updated->order?->customer ?? $updated->reservation?->customer, 'payment.refunded', 'Payment refunded', 'Payment '.$updated->reference_number.' has been refunded.', ['payment_id' => $updated->id, 'reference' => $updated->reference_number, 'amount' => $updated->amount]);
        return $updated;
    }

    public function cancel(Payment $payment, User $actor): Payment
    {
        if ($payment->status !== 'pending') return $payment;
        if ($payment->provider === 'paymongo' && $payment->checkout_session_id) {
            $session = $this->gateway->expire($payment->checkout_session_id);
            if (($session['attributes']['status'] ?? null) !== 'expired') throw ValidationException::withMessages(['payment' => 'The provider has not confirmed cancellation; this payment remains pending.']);
        }
        $updated = DB::transaction(function () use ($payment, $actor): Payment {
            $locked = Payment::whereKey($payment->id)->lockForUpdate()->firstOrFail();
            if ($locked->status === 'pending') {
                $locked->update(['status' => 'cancelled']);
                $locked->transactions()->create(['transaction_type' => 'cancellation', 'status' => 'cancelled', 'amount' => $locked->amount]);
                $this->releaseDepositReservation($locked, 'Deposit checkout cancelled.');
            }
            return $locked;
        }, 3);
        $this->audit->record($actor, 'payment.cancelled', $updated, [], request());
        return $updated;
    }

    public function expirePending(): int
    {
        $count = 0;
        Payment::where('status', 'pending')->whereNotNull('expires_at')->where('expires_at', '<=', now())->orderBy('id')->chunkById(50, function ($payments) use (&$count): void {
            foreach ($payments as $payment) {
                try {
                    if ($payment->provider === 'paymongo' && $payment->checkout_session_id) {
                        $session = $this->gateway->expire($payment->checkout_session_id);
                        if (($session['attributes']['status'] ?? null) !== 'expired') continue;
                    }
                    DB::transaction(function () use ($payment, &$count): void {
                        $locked = Payment::whereKey($payment->id)->lockForUpdate()->first();
                        if (! $locked || $locked->status !== 'pending') return;
                        $locked->update(['status' => 'cancelled']);
                        $locked->transactions()->create(['transaction_type' => 'timeout', 'status' => 'cancelled', 'amount' => $locked->amount]);
                        $this->releaseDepositReservation($locked, 'Reservation deposit checkout expired.');
                        $count++;
                    }, 3);
                } catch (\Throwable $exception) { report($exception); }
            }
        });
        return $count;
    }

    public function handleWebhook(array $event): string
    {
        $outer = $event['data'] ?? [];
        $attributes = $outer['attributes'] ?? [];
        $eventId = $outer['id'] ?? null;
        $type = $attributes['type'] ?? '';
        $resource = $attributes['data'] ?? [];
        $resourceId = $resource['id'] ?? null;
        if (! $eventId) return 'ignored';
        try {
            return DB::transaction(function () use ($eventId, $type, $resource, $resourceId, $attributes): string {
                $webhook = PaymentWebhookEvent::firstOrCreate(['provider_event_id' => $eventId], ['provider' => 'paymongo', 'event_type' => $type, 'resource_id' => $resourceId, 'outcome' => 'received']);
                if (! $webhook->wasRecentlyCreated) return 'duplicate';
                $outcome = 'ignored';
                if ($type === 'checkout_session.payment.paid') {
                    $sessionAttributes = $resource['attributes'] ?? [];
                    $payment = Payment::where('checkout_session_id', $resourceId)->orWhere('reference_number', $sessionAttributes['reference_number'] ?? '')->lockForUpdate()->first();
                    if ($payment) {
                        $paid = collect($sessionAttributes['payments'] ?? [])->first(fn ($row) => ($row['attributes']['status'] ?? null) === 'paid');
                        if ($paid) $outcome = $this->applyPaid($payment, $resourceId, $paid, $eventId, (bool) ($attributes['livemode'] ?? false));
                    }
                } elseif ($type === 'payment.paid') {
                    $payment = Payment::where('provider_payment_id', $resourceId)->first();
                    if ($payment) $outcome = $this->applyPaid($payment, $payment->checkout_session_id, $resource, $eventId, (bool) ($attributes['livemode'] ?? false));
                } elseif ($type === 'payment.failed') {
                    $attrs = $resource['attributes'] ?? [];
                    $reference = last(explode(' ', (string) ($attrs['description'] ?? '')));
                    $payment = Payment::where('provider_payment_id', $resourceId)->orWhere('reference_number', $reference)->first();
                    if ($payment) {
                        $payment->transactions()->firstOrCreate(['provider_event_id' => $eventId], ['transaction_type' => 'payment_attempt', 'status' => 'failed', 'amount' => $payment->amount, 'provider_transaction_id' => $resourceId, 'response_payload' => ['status' => 'failed']]);
                        $payment->loadMissing(['order.customer', 'reservation.customer']);
                        app(RestaurantNotificationService::class)->send($payment->order?->customer ?? $payment->reservation?->customer, 'payment.failed', 'Payment attempt failed', 'The payment provider reported an unsuccessful payment attempt. You can try checkout again.', ['payment_id' => $payment->id, 'reference' => $payment->reference_number]);
                        $outcome = 'failed_attempt';
                    }
                } elseif (in_array($type, ['refund.succeeded', 'payment.refunded'], true)) {
                    $attrs = $resource['attributes'] ?? [];
                    $payment = Payment::where('provider_payment_id', $attrs['payment_id'] ?? null)->lockForUpdate()->first();
                    if ($payment && (int) ($attrs['amount'] ?? 0) >= $this->cents($payment->amount)) {
                        $payment->update(['status' => 'refunded', 'refunded_at' => now()]);
                        $payment->transactions()->firstOrCreate(['provider_event_id' => $eventId], ['transaction_type' => 'refund', 'status' => 'succeeded', 'amount' => $payment->amount, 'provider_transaction_id' => $resourceId, 'response_payload' => ['status' => 'succeeded']]);
                        $outcome = 'refunded';
                    }
                }
                $webhook->update(['payment_id' => isset($payment) ? $payment->id : null, 'outcome' => $outcome, 'processed_at' => now()]);
                return $outcome;
            }, 3);
        } catch (QueryException $exception) {
            if (str_contains($exception->getMessage(), 'payment_webhook_events_provider_event_id_unique')) return 'duplicate';
            throw $exception;
        }
    }

    public function receipt(Payment $payment): array
    {
        $payment->loadMissing(['order', 'reservation', 'diningSession.table', 'receivedBy:id,name', 'transactions']);
        return ['reference' => $payment->reference_number, 'status' => $payment->status, 'purpose' => $payment->purpose, 'method' => $payment->method, 'amount' => $payment->amount, 'currency' => $payment->currency, 'paid_at' => $payment->paid_at?->toIso8601String(), 'provider_reference' => $payment->provider_payment_id ?? $payment->provider_reference, 'order_number' => $payment->order?->order_number, 'reservation_reference' => $payment->reservation?->reference, 'table' => $payment->diningSession?->table?->table_number, 'received_by' => $payment->receivedBy?->name, 'transactions' => $payment->transactions->map(fn ($tx) => ['type' => $tx->transaction_type, 'status' => $tx->status, 'amount' => $tx->amount, 'reference' => $tx->provider_transaction_id, 'created_at' => $tx->created_at?->toIso8601String()])];
    }

    public function publicPayment(Payment $payment): array
    {
        return ['id' => $payment->id, 'status' => $payment->status, 'amount' => $payment->amount, 'currency' => $payment->currency, 'method' => $payment->method, 'purpose' => $payment->purpose, 'checkout_url' => $payment->status === 'pending' ? $payment->checkout_url : null, 'expires_at' => $payment->expires_at?->toIso8601String(), 'reference_number' => $payment->reference_number];
    }

    public function orderSummary(Order $order): array
    {
        $directPaid = $order->payments->where('status', 'paid')->sum(fn ($payment) => $this->cents($payment->amount));
        $allocatedPaid = $order->paymentAllocations->filter(fn ($allocation) => $allocation->payment?->status === 'paid')->sum(fn ($allocation) => $this->cents($allocation->amount));
        $pending = $order->payments->where('status', 'pending')->sum(fn ($payment) => $this->cents($payment->amount));
        $paid = $directPaid + $allocatedPaid;
        return ['paid' => $this->money($paid), 'balance_due' => $this->money(max(0, $this->cents($order->total) - $paid)), 'pending' => $this->money($pending)];
    }

    public function all(): array
    {
        return Payment::with(['order:id,order_number,customer_id,customer_name_snapshot', 'reservation:id,reference,customer_id', 'diningSession:id,table_id', 'receivedBy:id,name'])->latest()->paginate(30)->toArray();
    }

    public function openBills(): array
    {
        return DiningSession::with(['table:id,table_number', 'orders:id,dining_session_id,order_number,status,total', 'payments:id,dining_session_id,status,amount'])
            ->where('status', 'open')->latest('opened_at')->limit(100)->get()->map(function (DiningSession $session): array {
                $due = $session->orders->where('status', '!=', 'cancelled')->sum(fn (Order $order) => $this->orderDueCents($order));
                return ['id' => $session->id, 'table_number' => $session->table?->table_number, 'opened_at' => $session->opened_at?->toIso8601String(), 'orders' => $session->orders->map(fn ($order) => ['order_number' => $order->order_number, 'status' => $order->status, 'total' => $order->total]), 'balance_due' => $this->money($due), 'payment_pending' => $session->payments->contains(fn ($payment) => $payment->status === 'pending')];
            })->values()->all();
    }

    public function cashierQueue(): array
    {
        $orders = Order::with(['payments:id,order_id,status,amount'])->where('status', '!=', 'cancelled')->latest()->limit(100)->get()->map(function (Order $order): ?array {
            $due = $this->orderDueCents($order);
            return $due > 0 ? ['id' => $order->id, 'order_number' => $order->order_number, 'customer_name' => $order->customer_name_snapshot, 'order_type' => $order->order_type, 'status' => $order->status, 'balance_due' => $this->money($due), 'payment_pending' => $order->payments->contains(fn ($payment) => $payment->status === 'pending')] : null;
        })->filter()->values()->all();
        $policy = app(ReservationService::class)->policy();
        $deposits = [];
        if ($policy['deposit_required'] ?? false) {
            $deposits = Reservation::with('payments:id,reservation_id,status')->whereIn('status', ['pending', 'confirmed'])->latest('starts_at')->limit(100)->get()
                ->filter(fn ($reservation) => ! $reservation->payments->contains(fn ($payment) => $payment->status === 'paid'))
                ->map(fn ($reservation) => ['id' => $reservation->id, 'reference' => $reservation->reference, 'guest_name' => $reservation->guest_name, 'starts_at' => $reservation->starts_at?->toIso8601String(), 'deposit_amount' => (float) $policy['deposit_amount'], 'payment_pending' => $reservation->payments->contains(fn ($payment) => $payment->status === 'pending')])->values()->all();
        }
        return ['orders' => $orders, 'reservation_deposits' => $deposits];
    }

    private function createPending(array $target, int $amount, string $currency, string $label, User $actor, ?string $email = null): array
    {
        if ($currency !== 'PHP') throw ValidationException::withMessages(['currency' => 'PayMongo hosted checkout currently supports PHP for this configuration.']);
        $policy = $this->policy();
        $payment = Payment::create($target + ['method' => 'online', 'status' => 'pending', 'amount' => $this->money($amount), 'currency' => 'PHP', 'provider' => 'paymongo', 'reference_number' => $this->reference(), 'idempotency_key' => (string) str()->uuid(), 'expires_at' => now()->addMinutes(30)]);
        $payment->transactions()->create(['transaction_type' => 'checkout', 'status' => 'pending', 'amount' => $payment->amount]);
        return ['payment' => $payment, 'label' => $label, 'email' => $email, 'methods' => $policy['payment_method_types'] ?? ['card', 'gcash', 'qrph'], 'actor' => $actor];
    }

    private function openCheckout(array $plan): array
    {
        $payment = $plan['payment'];
        if (($plan['existing'] ?? false) && ! $payment->checkout_url) throw ValidationException::withMessages(['payment' => 'Checkout is being prepared. Refresh and try again in a few seconds.']);
        if (($plan['existing'] ?? false) && $payment->checkout_url) return $this->publicPayment($payment);
        try {
            $url = rtrim(config('app.frontend_url', 'http://localhost:5173'), '/');
            $session = $this->gateway->checkout([
                'line_items' => [['name' => mb_substr($plan['label'], 0, 100), 'amount' => $this->cents($payment->amount), 'currency' => 'PHP', 'quantity' => 1]],
                'payment_method_types' => $plan['methods'],
                'success_url' => $url.'/payment-return?payment_id='.$payment->id.'&result=success',
                'cancel_url' => $url.'/payment-return?payment_id='.$payment->id.'&result=cancelled',
                'reference_number' => $payment->reference_number,
                'description' => 'DineFlow '.$payment->reference_number,
                'send_email_receipt' => false,
                'metadata' => ['dineflow_payment_id' => (string) $payment->id, 'dineflow_purpose' => $payment->purpose],
            ], $payment->idempotency_key);
            $attributes = $session['attributes'] ?? [];
            if (empty($session['id']) || empty($attributes['checkout_url'])) throw new RuntimeException('PayMongo returned an incomplete checkout response.');
            $payment->update(['checkout_session_id' => $session['id'], 'checkout_url' => $attributes['checkout_url']]);
            $payment->transactions()->latest()->first()?->update(['provider_transaction_id' => $session['id'], 'response_payload' => ['checkout_session_id' => $session['id'], 'livemode' => (bool) ($attributes['livemode'] ?? false)]]);
            $this->audit->record($plan['actor'], 'payment.checkout_created', $payment, ['purpose' => $payment->purpose, 'amount' => $payment->amount], request());
            return $this->publicPayment($payment->fresh());
        } catch (\Throwable $exception) {
            $payment->update(['status' => 'failed', 'failure_reason' => mb_substr($exception->getMessage(), 0, 500)]);
            $payment->transactions()->latest()->first()?->update(['status' => 'failed', 'notes' => 'Checkout session could not be created.']);
            report($exception);
            throw ValidationException::withMessages(['payment' => 'Online checkout could not be started. Check gateway setup and enabled payment methods, then try again.']);
        }
    }

    private function applyPaid(Payment $payment, ?string $sessionId, array $providerPayment, string $eventId, bool $liveMode): string
    {
        $payment = Payment::whereKey($payment->id)->lockForUpdate()->firstOrFail();
        $attributes = $providerPayment['attributes'] ?? [];
        $expectedLive = str_starts_with((string) config('services.paymongo.secret'), 'sk_live_');
        if ($liveMode !== $expectedLive || ($attributes['currency'] ?? '') !== $payment->currency || (int) ($attributes['amount'] ?? 0) !== $this->cents($payment->amount)) return 'amount_or_mode_mismatch';
        if ($payment->status === 'paid') return 'already_paid';
        if ($payment->status !== 'pending') return 'not_payable';
        $payment->update(['status' => 'paid', 'paid_at' => now(), 'provider_payment_id' => $providerPayment['id'] ?? null, 'checkout_session_id' => $sessionId ?: $payment->checkout_session_id]);
        $safeSource = $attributes['source']['type'] ?? null;
        $payment->transactions()->firstOrCreate(['provider_event_id' => $eventId], ['transaction_type' => 'payment', 'status' => 'paid', 'amount' => $payment->amount, 'provider_transaction_id' => $providerPayment['id'] ?? null, 'response_payload' => ['status' => 'paid', 'currency' => $attributes['currency'] ?? null, 'source_type' => $safeSource]]);
        if ($payment->order_id) $this->applyToOrder($payment->order, $this->cents($payment->amount), $payment, null);
        elseif ($payment->dining_session_id) $this->allocateSession($payment, null);
        elseif ($payment->reservation_id) $this->confirmDepositReservation($payment->reservation);
        $customer = $payment->order?->customer ?? $payment->reservation?->customer;
        if ($customer) {
            app(RestaurantNotificationService::class)->send($customer, 'payment.paid', 'Payment received', 'Payment '.$payment->reference_number.' was verified successfully.', ['payment_id' => $payment->id, 'reference' => $payment->reference_number, 'amount' => $payment->amount]);
        } elseif ($payment->dining_session_id) {
            foreach (Order::where('dining_session_id', $payment->dining_session_id)->with('customer')->get() as $billOrder) {
                app(RestaurantNotificationService::class)->send($billOrder->customer, 'payment.paid', 'Payment received', 'Payment for your dining bill was verified successfully.', ['payment_id' => $payment->id, 'order_id' => $billOrder->id, 'amount' => $payment->amount]);
            }
        }
        return 'paid';
    }

    private function applyToOrder(Order $order, int $amount, Payment $payment, ?User $actor): void
    {
        if ($this->orderDueCents($order) <= 0 && $order->status === 'pending') {
            $order->update(['status' => 'confirmed', 'confirmed_at' => now()]);
            $order->statusHistory()->create(['actor_id' => $actor?->id, 'from_status' => 'pending', 'to_status' => 'confirmed', 'note' => 'Confirmed after verified payment.']);
        }
    }

    private function allocateSession(Payment $payment, ?User $actor): void
    {
        $remaining = $this->cents($payment->amount);
        $orders = Order::where('dining_session_id', $payment->dining_session_id)->whereNotIn('status', ['cancelled'])->orderBy('created_at')->lockForUpdate()->get();
        foreach ($orders as $order) {
            $due = $this->orderDueCents($order);
            if ($due < 1) continue;
            $allocation = min($due, $remaining);
            PaymentAllocation::create(['payment_id' => $payment->id, 'order_id' => $order->id, 'amount' => $this->money($allocation)]);
            $remaining -= $allocation;
            if ($this->orderDueCents($order) <= 0 && $order->status === 'pending') {
                $order->update(['status' => 'confirmed', 'confirmed_at' => now()]);
                $order->statusHistory()->create(['actor_id' => $actor?->id, 'from_status' => 'pending', 'to_status' => 'confirmed', 'note' => 'Confirmed after verified dining-session payment.']);
            }
            if ($remaining <= 0) break;
        }
        if ($remaining !== 0) throw new RuntimeException('Dining-session payment allocation did not reconcile to the verified amount.');
    }

    private function orderDueCents(Order $order): int
    {
        $direct = Payment::where('order_id', $order->id)->where('status', 'paid')->get()->sum(fn (Payment $p) => $this->cents($p->amount));
        $allocated = PaymentAllocation::where('order_id', $order->id)->whereHas('payment', fn ($q) => $q->where('status', 'paid'))->get()->sum(fn ($a) => $this->cents($a->amount));
        return max(0, $this->cents($order->total) - $direct - $allocated);
    }

    private function assertNoPending(Order $order): void
    {
        if (Payment::where('order_id', $order->id)->where('status', 'pending')->exists() || ($order->dining_session_id && Payment::where('dining_session_id', $order->dining_session_id)->where('status', 'pending')->exists())) {
            throw ValidationException::withMessages(['payment' => 'A checkout is already open for this order or dining bill. Complete or cancel it before starting another.']);
        }
    }

    private function confirmDepositReservation(?Reservation $reservation): void
    {
        if (! $reservation || $reservation->status !== 'pending' || ! app(ReservationService::class)->policy()['automatic_confirmation']) return;
        $reservation->update(['status' => 'confirmed']);
        $reservation->history()->create(['actor_id' => null, 'from_status' => 'pending', 'to_status' => 'confirmed', 'note' => 'Confirmed after verified deposit payment.']);
    }

    private function releaseDepositReservation(Payment $payment, string $note): void
    {
        if (! $payment->reservation_id) return;
        $reservation = Reservation::whereKey($payment->reservation_id)->lockForUpdate()->first();
        if ($reservation && $reservation->status === 'pending' && ! $reservation->payments()->where('status', 'paid')->exists()) {
            $reservation->update(['status' => 'cancelled', 'cancelled_at' => now()]);
            $reservation->history()->create(['actor_id' => null, 'from_status' => 'pending', 'to_status' => 'cancelled', 'note' => $note]);
        }
    }

    private function cents(string|int|float $amount): int { return (int) round(((float) $amount) * 100); }
    private function money(int $cents): string { return number_format($cents / 100, 2, '.', ''); }
    private function reference(): string { return 'DFP'.now()->format('ymd').strtoupper(bin2hex(random_bytes(5))); }
}
