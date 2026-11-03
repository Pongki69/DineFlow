<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Delivery;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderStatusHistory;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** The kitchen display: queue, recently ready tickets, recall and item tick-off. */
class KitchenController extends Controller
{
    /** Ready tickets stay on the board this long (the "Ready" column). */
    private const READY_WINDOW_MINUTES = 30;

    /** A ready ticket can be recalled to the kitchen within this window. */
    private const RECALL_WINDOW_MINUTES = 15;

    /** Delivery statuses where the food has not left the restaurant yet. */
    private const BEFORE_PICKUP = ['pending_assignment', 'assigned', 'accepted', 'arrived_at_restaurant'];

    public function index(): JsonResponse
    {
        $readySince = now()->subMinutes(self::READY_WINDOW_MINUTES);
        $orders = Order::with(['items.addons', 'delivery.rider.riderProfile'])
            ->where(fn ($query) => $query->whereIn('status', ['confirmed', 'preparing'])
                ->orWhere(fn ($ready) => $ready->where('status', 'ready_to_serve')->where('updated_at', '>=', $readySince)))
            ->oldest()->get();
        $readyAt = $this->readyTimes($orders->where('status', 'ready_to_serve')->pluck('id'));

        $data = $orders->map(function (Order $order) use ($readyAt, $readySince) {
            $ready = $readyAt[$order->id] ?? null;
            if ($order->status === 'ready_to_serve' && (! $ready || $ready->lt($readySince))) {
                return null;
            }
            $payload = $order->toArray();
            unset($payload['delivery']);
            $payload['ready_at'] = $ready?->toIso8601String();
            $payload['recallable'] = $order->status === 'ready_to_serve' && $this->canRecall($order, $ready);
            $payload['kitchen_delivery'] = $order->order_type === 'delivery' ? $this->deliverySummary($order->delivery) : null;

            return $payload;
        })->filter()->values();

        return response()->json(['data' => $data, 'meta' => ['today' => $this->today()]]);
    }

    /** Send a ticket that was marked ready by mistake back to preparation. */
    public function recall(Request $request, Order $order, AuditLogService $audit): JsonResponse
    {
        $order = DB::transaction(function () use ($request, $order): Order {
            $locked = Order::query()->whereKey($order->id)->lockForUpdate()->firstOrFail();
            $ready = $this->readyTimes(collect([$locked->id]))[$locked->id] ?? null;
            if ($locked->status !== 'ready_to_serve' || ! $this->canRecall($locked, $ready)) {
                throw ValidationException::withMessages(['status' => 'This ticket can no longer be recalled. It has been handed off or was ready too long ago.']);
            }
            $locked->status = 'preparing';
            if ($locked->order_type === 'delivery') {
                $locked->prep_ready_at = now()->addMinutes(5);
            }
            $locked->save();
            $locked->statusHistory()->create(['actor_id' => $request->user()->id, 'from_status' => 'ready_to_serve', 'to_status' => 'preparing', 'note' => 'Recalled by the kitchen.']);

            return $locked;
        });
        $audit->record($request->user(), 'order.recalled_to_kitchen', $order, ['order_number' => $order->order_number], $request);

        return response()->json(['data' => $order->load('items.addons')]);
    }

    /** Tick a dish off (or back on) while the ticket is being prepared. */
    public function prepared(Request $request, OrderItem $item): JsonResponse
    {
        $data = $request->validate(['prepared' => ['required', 'boolean']]);
        abort_unless(in_array($item->order?->status, ['confirmed', 'preparing'], true), 422, 'Only open tickets can be ticked off.');
        $item->forceFill(['prepared_at' => $data['prepared'] ? now() : null])->save();
        app(AuditLogService::class)->record($request->user(), $data['prepared'] ? 'kitchen.item_prepared' : 'kitchen.item_unprepared', $item->order, [
            'order_number' => $item->order?->order_number, 'dish' => $item->item_name_snapshot, 'quantity' => $item->quantity,
        ], $request);

        return response()->json(['data' => ['id' => $item->id, 'prepared_at' => $item->prepared_at?->toIso8601String()]]);
    }

    private function canRecall(Order $order, ?Carbon $ready): bool
    {
        if (! $ready || $ready->lt(now()->subMinutes(self::RECALL_WINDOW_MINUTES))) {
            return false;
        }
        if ($order->order_type === 'delivery') {
            $delivery = $order->relationLoaded('delivery') ? $order->delivery : $order->delivery()->first();

            return ! $delivery || in_array($delivery->status, self::BEFORE_PICKUP, true);
        }

        return true;
    }

    /** @return array<int, Carbon> order id => when it last became ready */
    private function readyTimes($orderIds): array
    {
        if ($orderIds->isEmpty()) {
            return [];
        }

        return OrderStatusHistory::whereIn('order_id', $orderIds)->where('to_status', 'ready_to_serve')
            ->selectRaw('order_id, max(created_at) as ready_at')->groupBy('order_id')->get()
            ->mapWithKeys(fn ($row) => [$row->order_id => Carbon::parse($row->ready_at)])->all();
    }

    /** Where the rider is, so the kitchen can time delivery orders. */
    private function deliverySummary(?Delivery $delivery): ?array
    {
        if (! $delivery) {
            return null;
        }
        $rider = $delivery->rider;
        $profile = $rider?->riderProfile;
        $eta = null;
        if ($delivery->status === 'arrived_at_restaurant') {
            $eta = 0;
        } elseif (in_array($delivery->status, ['assigned', 'accepted'], true) && $profile?->latitude !== null
            && $profile->located_at && $profile->located_at->gt(now()->subMinutes(5))
            && $delivery->pickup_latitude !== null) {
            // Straight-line distance at a city riding pace (~24 km/h).
            $km = $this->distanceKm((float) $profile->latitude, (float) $profile->longitude, (float) $delivery->pickup_latitude, (float) $delivery->pickup_longitude);
            $eta = max(1, (int) ceil($km / 0.4));
        }

        return ['status' => $delivery->status, 'rider_name' => $rider?->name, 'rider_eta_minutes' => $eta];
    }

    private function distanceKm(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $rad = M_PI / 180;
        $a = sin(($lat2 - $lat1) * $rad / 2) ** 2 + cos($lat1 * $rad) * cos($lat2 * $rad) * sin(($lng2 - $lng1) * $rad / 2) ** 2;

        return 6371 * 2 * atan2(sqrt($a), sqrt(1 - $a));
    }

    /** Tickets finished today and the average time from "preparing" to "ready". */
    private function today(): array
    {
        $ready = OrderStatusHistory::where('to_status', 'ready_to_serve')->where('created_at', '>=', today())
            ->get(['order_id', 'created_at']);
        $started = OrderStatusHistory::whereIn('order_id', $ready->pluck('order_id'))->where('to_status', 'preparing')
            ->get(['order_id', 'created_at'])->groupBy('order_id');
        $minutes = $ready->map(function ($row) use ($started) {
            $start = $started->get($row->order_id)?->filter(fn ($entry) => $entry->created_at->lte($row->created_at))->sortByDesc('created_at')->first();

            return $start ? $start->created_at->diffInSeconds($row->created_at) / 60 : null;
        })->filter(fn ($value) => $value !== null);

        return [
            'done' => $ready->pluck('order_id')->unique()->count(),
            'average_prep_minutes' => $minutes->isEmpty() ? null : (int) round($minutes->avg()),
        ];
    }
}
