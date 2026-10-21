<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DiningSession;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Reservation;
use App\Services\PaymentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

class PaymentController extends Controller
{
    public function orderCheckout(Request $request, Order $order, PaymentService $payments): JsonResponse
    {
        abort_unless($order->customer_id === $request->user()->id || $request->user()->hasPermission('payments.manage'), 404);
        return response()->json(['data' => $payments->checkoutOrder($order, $request->user())], 201);
    }

    public function sessionCheckout(Request $request, DiningSession $session, PaymentService $payments): JsonResponse
    {
        abort_unless($request->user()->hasPermission('payments.manage'), 403);
        return response()->json(['data' => $payments->checkoutSession($session, $request->user())], 201);
    }

    public function reservationCheckout(Request $request, Reservation $reservation, PaymentService $payments): JsonResponse
    {
        abort_unless($reservation->customer_id === $request->user()->id || $request->user()->hasPermission('payments.manage'), 404);
        return response()->json(['data' => $payments->checkoutReservation($reservation, $request->user())], 201);
    }

    public function cashOrder(Request $request, Order $order, PaymentService $payments): JsonResponse
    {
        abort_unless($request->user()->hasPermission('payments.manage'), 403);
        return response()->json(['data' => $payments->receipt($payments->recordCashOrder($order, $request->user()))], 201);
    }

    public function cashSession(Request $request, DiningSession $session, PaymentService $payments): JsonResponse
    {
        abort_unless($request->user()->hasPermission('payments.manage'), 403);
        return response()->json(['data' => $payments->receipt($payments->recordCashSession($session, $request->user()))], 201);
    }

    public function cashReservation(Request $request, Reservation $reservation, PaymentService $payments): JsonResponse
    {
        abort_unless($request->user()->hasPermission('payments.manage'), 403);
        return response()->json(['data' => $payments->receipt($payments->recordCashReservationDeposit($reservation, $request->user()))], 201);
    }

    public function show(Request $request, Payment $payment, PaymentService $payments): JsonResponse
    {
        abort_unless($this->canView($request, $payment), 404);
        return response()->json(['data' => $payments->publicPayment($payment)]);
    }

    public function receipt(Request $request, Payment $payment, PaymentService $payments): JsonResponse
    {
        abort_unless($this->canView($request, $payment), 404);
        return response()->json(['data' => $payments->receipt($payment)]);
    }

    public function cancel(Request $request, Payment $payment, PaymentService $payments): JsonResponse
    {
        abort_unless($this->owns($request, $payment), 404);
        return response()->json(['data' => $payments->publicPayment($payments->cancel($payment, $request->user()))]);
    }

    public function refund(Request $request, Payment $payment, PaymentService $payments): JsonResponse
    {
        abort_unless($request->user()->hasPermission('payments.refund'), 403);
        $data = $request->validate(['reason' => ['required', 'in:duplicate,fraudulent,requested_by_customer,others'], 'notes' => ['required', 'string', 'min:3', 'max:255']]);
        try {
            $refunded = $payments->refund($payment, $request->user(), $data['reason'], $data['notes']);
            return response()->json(['data' => $payments->publicPayment($refunded)]);
        } catch (RuntimeException $exception) {
            return response()->json(['message' => $exception->getMessage()], 502);
        }
    }

    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasPermission('payments.manage') || $request->user()->hasPermission('payments.refund'), 403);
        $page = Payment::with(['order:id,order_number,customer_id,customer_name_snapshot', 'reservation:id,reference,customer_id', 'diningSession:id,table_id', 'receivedBy:id,name'])->latest()->paginate(30);
        $page->getCollection()->transform(fn (Payment $p) => ['id' => $p->id, 'purpose' => $p->purpose, 'method' => $p->method, 'status' => $p->status, 'amount' => $p->amount, 'currency' => $p->currency, 'reference_number' => $p->reference_number, 'provider_reference' => $p->provider_payment_id ?? $p->provider_reference, 'paid_at' => $p->paid_at?->toIso8601String(), 'refunded_at' => $p->refunded_at?->toIso8601String(), 'order' => $p->order?->only('order_number', 'customer_name_snapshot'), 'reservation' => $p->reservation?->only('reference'), 'dining_session_id' => $p->dining_session_id, 'received_by' => $p->receivedBy?->only('name')]);
        return response()->json(['data' => $page]);
    }

    public function openBills(Request $request, PaymentService $payments): JsonResponse
    {
        abort_unless($request->user()->hasPermission('payments.manage'), 403);
        return response()->json(['data' => $payments->openBills()]);
    }

    public function cashierQueue(Request $request, PaymentService $payments): JsonResponse
    {
        abort_unless($request->user()->hasPermission('payments.manage'), 403);
        return response()->json(['data' => $payments->cashierQueue()]);
    }

    public function policy(Request $request, PaymentService $payments): JsonResponse
    {
        abort_unless($request->user()->hasPermission('settings.manage'), 403);
        if ($request->isMethod('get')) return response()->json(['data' => $payments->policy()]);
        $data = $request->validate(['cash_enabled' => ['required', 'boolean'], 'payment_method_types' => ['required', 'array', 'min:1', 'max:5'], 'payment_method_types.*' => ['required', 'distinct', 'in:card,gcash,qrph,maya,grabpay,shopeepay,atome,billease']]);
        return response()->json(['data' => $payments->savePolicy($data)]);
    }

    public function webhook(Request $request, PaymentService $payments): JsonResponse
    {
        $raw = $request->getContent();
        $event = json_decode($raw, true);
        $live = (bool) data_get($event, 'data.attributes.livemode', false);
        if (! is_array($event) || ! app(\App\Services\PayMongoGateway::class)->verifySignature($raw, $request->header('Paymongo-Signature'), $live)) {
            return response()->json(['message' => 'Invalid webhook signature.'], 401);
        }
        return response()->json(['received' => true, 'outcome' => $payments->handleWebhook($event)]);
    }

    private function canView(Request $request, Payment $payment): bool
    {
        return $request->user()->hasPermission('payments.manage') || $request->user()->hasPermission('payments.refund') || $this->owns($request, $payment);
    }

    private function owns(Request $request, Payment $payment): bool
    {
        return ($payment->order_id && $payment->order()->where('customer_id', $request->user()->id)->exists())
            || ($payment->reservation_id && $payment->reservation()->where('customer_id', $request->user()->id)->exists())
            || ($payment->dining_session_id && $payment->diningSession()->whereHas('orders', fn ($query) => $query->where('customer_id', $request->user()->id))->exists());
    }
}
