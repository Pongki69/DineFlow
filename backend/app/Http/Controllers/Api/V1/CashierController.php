<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\CashShift;
use App\Models\DiningSession;
use App\Models\Order;
use App\Models\Payment;
use App\Models\PaymentAllocation;
use App\Models\User;
use App\Services\AuditLogService;
use App\Services\PaymentService;
use App\Services\RestaurantNotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** The cashier's counter: itemised bills, Senior/PWD discounts, cash drawer shifts and bill requests. */
class CashierController extends Controller
{
    /** Philippine VAT, included in menu prices when no separate tax is charged. */
    private const VAT_RATE = 0.12;

    /** Senior Citizen (RA 9994) and PWD (RA 10754) discount rate. */
    private const SPECIAL_DISCOUNT_RATE = 0.20;

    public function __construct(private PaymentService $payments) {}

    /** Everything on an order or a table's bill, with what is paid and what is due. */
    public function bill(Request $request): JsonResponse
    {
        [$orders, $session] = $this->target($request);

        return response()->json(['data' => $this->billPayload($orders, $session)]);
    }

    /**
     * Apply the Senior Citizen / PWD discount: 20% off the qualifying guests'
     * share, VAT-exempt. For a table it applies to every order on the bill.
     */
    public function applyDiscount(Request $request, AuditLogService $audit): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', 'in:senior,pwd'],
            'id_number' => ['required', 'string', 'max:40'],
            'name' => ['required', 'string', 'max:120'],
            'eligible_guests' => ['required', 'integer', 'min:1', 'max:50'],
            'total_guests' => ['required', 'integer', 'min:1', 'max:50', 'gte:eligible_guests'],
        ]);
        [$orders, $session] = $this->target($request);
        $ratio = $data['eligible_guests'] / $data['total_guests'];
        DB::transaction(function () use ($orders, $data, $ratio): void {
            foreach ($orders as $order) {
                $locked = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
                $this->assertUnpaid($locked);
                $base = (float) $locked->total + (float) $locked->special_discount_amount;
                $food = max(0, (float) $locked->subtotal - (float) $locked->item_discount_total);
                $share = $food * $ratio;
                if ((float) $locked->tax > 0) {
                    // Prices exclude VAT: drop the share's VAT, then 20% off the share.
                    $reduction = (float) $locked->tax * $ratio + $share * self::SPECIAL_DISCOUNT_RATE;
                } else {
                    // Prices include VAT: remove it, then 20% off the VAT-exclusive amount.
                    $vatExclusive = $share / (1 + self::VAT_RATE);
                    $reduction = ($share - $vatExclusive) + $vatExclusive * self::SPECIAL_DISCOUNT_RATE;
                }
                $reduction = round(min($reduction, $base), 2);
                $locked->forceFill([
                    'special_discount_type' => $data['type'],
                    'special_discount_id_number' => $data['id_number'],
                    'special_discount_name' => $data['name'],
                    'special_discount_amount' => $reduction,
                    'total' => round($base - $reduction, 2),
                ])->save();
            }
        });
        $audit->record($request->user(), 'payment.special_discount_applied', $session ?? $orders->first(), [
            'type' => $data['type'], 'id_number' => $data['id_number'], 'orders' => $orders->pluck('order_number')->all(),
        ], $request);

        return response()->json(['data' => $this->billPayload($this->reload($orders), $session)]);
    }

    public function removeDiscount(Request $request, AuditLogService $audit): JsonResponse
    {
        [$orders, $session] = $this->target($request);
        DB::transaction(function () use ($orders): void {
            foreach ($orders as $order) {
                $locked = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
                if (! $locked->special_discount_type) {
                    continue;
                }
                $this->assertUnpaid($locked);
                $locked->forceFill([
                    'total' => round((float) $locked->total + (float) $locked->special_discount_amount, 2),
                    'special_discount_type' => null, 'special_discount_id_number' => null,
                    'special_discount_name' => null, 'special_discount_amount' => 0,
                ])->save();
            }
        });
        $audit->record($request->user(), 'payment.special_discount_removed', $session ?? $orders->first(), ['orders' => $orders->pluck('order_number')->all()], $request);

        return response()->json(['data' => $this->billPayload($this->reload($orders), $session)]);
    }

    /** The signed-in cashier's open drawer, with the cash it should hold now. */
    public function shift(Request $request): JsonResponse
    {
        $shift = CashShift::where('user_id', $request->user()->id)->whereNull('closed_at')->latest('opened_at')->first();
        $last = $shift ? null : CashShift::where('user_id', $request->user()->id)->whereNotNull('closed_at')->latest('closed_at')->first();

        return response()->json(['data' => ['current' => $shift ? $this->shiftPayload($shift) : null, 'last' => $last ? $this->shiftPayload($last) : null]]);
    }

    public function openShift(Request $request, AuditLogService $audit): JsonResponse
    {
        $data = $request->validate(['opening_float' => ['required', 'numeric', 'min:0', 'max:1000000']]);
        $shift = DB::transaction(function () use ($request, $data): CashShift {
            $user = User::whereKey($request->user()->id)->lockForUpdate()->firstOrFail();
            if (CashShift::where('user_id', $user->id)->whereNull('closed_at')->exists()) {
                throw ValidationException::withMessages(['shift' => 'Close your current shift before starting a new one.']);
            }

            return CashShift::create(['user_id' => $user->id, 'opened_at' => now(), 'opening_float' => $data['opening_float']]);
        });
        $audit->record($request->user(), 'cashier.shift_opened', $shift, ['opening_float' => $shift->opening_float], $request);

        return response()->json(['data' => $this->shiftPayload($shift)], 201);
    }

    public function closeShift(Request $request, AuditLogService $audit): JsonResponse
    {
        $data = $request->validate(['counted_cash' => ['required', 'numeric', 'min:0', 'max:1000000'], 'notes' => ['nullable', 'string', 'max:500']]);
        $shift = CashShift::where('user_id', $request->user()->id)->whereNull('closed_at')->latest('opened_at')->first();
        if (! $shift) {
            throw ValidationException::withMessages(['shift' => 'There is no open shift to close.']);
        }
        $expected = $this->expectedCash($shift);
        $shift->forceFill(['closed_at' => now(), 'expected_cash' => $expected, 'counted_cash' => $data['counted_cash'], 'notes' => $data['notes'] ?? null])->save();
        $audit->record($request->user(), 'cashier.shift_closed', $shift, ['expected_cash' => $expected, 'counted_cash' => $shift->counted_cash], $request);

        return response()->json(['data' => $this->shiftPayload($shift)]);
    }

    /** A waiter (or the cashier) flags that a table wants to pay. */
    public function requestBill(Request $request, DiningSession $session): JsonResponse
    {
        abort_unless($request->user()->hasPermission('service.tables.view') || $request->user()->hasPermission('payments.manage'), 403);
        if ($session->status !== 'open') {
            throw ValidationException::withMessages(['dining_session' => 'This table no longer has an open bill.']);
        }
        $session->forceFill(['bill_requested_at' => now()])->save();
        app(AuditLogService::class)->record($request->user(), 'bill.requested', $session, [], $request);
        $session->loadMissing('table:id,table_number');
        $orders = Order::where('dining_session_id', $session->id)->where('status', '!=', 'cancelled')->get();
        $due = $orders->sum(fn (Order $order) => $this->payments->dueCents($order)) / 100;
        $table = $session->table?->table_number;
        $label = $table ? (preg_match('/^table\s/i', $table) ? $table : 'Table '.$table) : 'A table';
        User::where('is_active', true)->whereHas('roles', fn ($role) => $role->where('slug', 'cashier'))->get()
            ->each(fn (User $cashier) => app(RestaurantNotificationService::class)->send($cashier, 'bill.requested', 'Bill requested', $label.' asked for the bill (₱'.number_format($due, 2).').', ['dining_session_id' => $session->id, 'table' => $table]));

        return response()->json(['data' => ['id' => $session->id, 'bill_requested_at' => $session->bill_requested_at?->toIso8601String()]]);
    }

    /** @return array{0: Collection<int, Order>, 1: ?DiningSession} */
    private function target(Request $request): array
    {
        $data = $request->validate([
            'order_id' => ['required_without:session_id', 'nullable', 'integer'],
            'session_id' => ['required_without:order_id', 'nullable', 'integer'],
        ]);
        if (! empty($data['session_id'])) {
            $session = DiningSession::with('table:id,table_number')->findOrFail($data['session_id']);
            $orders = Order::with('items.addons')->where('dining_session_id', $session->id)->where('status', '!=', 'cancelled')->orderBy('created_at')->get();

            return [$orders, $session];
        }

        return [collect([Order::with('items.addons')->findOrFail($data['order_id'])]), null];
    }

    private function reload(Collection $orders): Collection
    {
        return Order::with('items.addons')->whereIn('id', $orders->pluck('id'))->orderBy('created_at')->get();
    }

    private function assertUnpaid(Order $order): void
    {
        $paid = Payment::where('order_id', $order->id)->where('status', 'paid')->exists()
            || PaymentAllocation::where('order_id', $order->id)->whereHas('payment', fn ($query) => $query->where('status', 'paid'))->exists();
        if ($paid || $order->status === 'cancelled') {
            throw ValidationException::withMessages(['discount' => 'Discounts can only change on a bill that has not been paid yet.']);
        }
    }

    private function billPayload(Collection $orders, ?DiningSession $session): array
    {
        $sum = fn (string $field) => round($orders->sum(fn (Order $order) => (float) $order->{$field}), 2);
        $due = round($orders->sum(fn (Order $order) => $this->payments->dueCents($order)) / 100, 2);
        $discounted = $orders->first(fn (Order $order) => $order->special_discount_type);

        return [
            'kind' => $session ? 'dining_session' : 'order',
            'id' => $session?->id ?? $orders->first()?->id,
            'table_number' => $session?->table?->table_number ?? $orders->first()?->table_number_snapshot,
            'guest_count' => $session?->guest_count,
            'orders' => $orders->map(fn (Order $order) => [
                'id' => $order->id,
                'order_number' => $order->order_number,
                'order_type' => $order->order_type,
                'status' => $order->status,
                'customer_name' => $order->customer_name_snapshot,
                'items' => $order->items->map(fn ($item) => [
                    'name' => $item->item_name_snapshot,
                    'variant' => $item->variant_name_snapshot,
                    'addons' => $item->addons->pluck('addon_name_snapshot')->filter()->values(),
                    'quantity' => $item->quantity,
                    'line_total' => $item->line_total,
                ])->values(),
            ])->values(),
            'subtotal' => $sum('subtotal'),
            'item_discounts' => $sum('item_discount_total'),
            'service_charge' => $sum('service_charge'),
            'delivery_fee' => $sum('delivery_fee'),
            'tax' => $sum('tax'),
            'special_discount' => $sum('special_discount_amount'),
            'total' => $sum('total'),
            'paid' => round($sum('total') - $due, 2),
            'balance_due' => $due,
            'discount' => $discounted ? ['type' => $discounted->special_discount_type, 'name' => $discounted->special_discount_name, 'id_number' => $discounted->special_discount_id_number] : null,
            'can_discount' => $orders->every(fn (Order $order) => $this->payments->dueCents($order) >= (int) round((float) $order->total * 100)),
        ];
    }

    private function expectedCash(CashShift $shift): float
    {
        $received = Payment::where('method', 'cash')->where('status', 'paid')->where('received_by', $shift->user_id)
            ->where('paid_at', '>=', $shift->opened_at)->when($shift->closed_at, fn ($query) => $query->where('paid_at', '<=', $shift->closed_at))
            ->sum('amount');

        return round((float) $shift->opening_float + (float) $received, 2);
    }

    private function shiftPayload(CashShift $shift): array
    {
        $paid = Payment::where('status', 'paid')->where('received_by', $shift->user_id)->where('paid_at', '>=', $shift->opened_at)
            ->when($shift->closed_at, fn ($query) => $query->where('paid_at', '<=', $shift->closed_at));
        $expected = $shift->closed_at ? (float) $shift->expected_cash : $this->expectedCash($shift);

        return [
            'id' => $shift->id,
            'opened_at' => $shift->opened_at?->toIso8601String(),
            'closed_at' => $shift->closed_at?->toIso8601String(),
            'opening_float' => (float) $shift->opening_float,
            'cash_received' => round($expected - (float) $shift->opening_float, 2),
            'expected_cash' => $expected,
            'counted_cash' => $shift->counted_cash !== null ? (float) $shift->counted_cash : null,
            'difference' => $shift->counted_cash !== null ? round((float) $shift->counted_cash - $expected, 2) : null,
            'payments' => (clone $paid)->count(),
            'notes' => $shift->notes,
        ];
    }
}
