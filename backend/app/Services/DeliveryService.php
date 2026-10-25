<?php

namespace App\Services;

use App\Events\DeliveryTrackingUpdated;
use App\Jobs\RefreshDeliveryEta;
use App\Models\Delivery;
use App\Models\DeliveryAssignment;
use App\Models\DispatchOffer;
use App\Models\Order;
use App\Models\RestaurantSetting;
use App\Models\RiderProfile;
use App\Models\User;
use App\Notifications\DeliveryProgressNotification;
use Carbon\Carbon;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\ValidationException;

class DeliveryService
{
    public function __construct(private MapProviderService $maps) {}

    public function riderDeliveries(User $rider)
    {
        $this->assertRider($rider);

        return $this->withProof(Delivery::with(['order.items.addons', 'statusHistory']))->where('rider_user_id', $rider->id)->latest()->limit(50)->get()->map(fn (Delivery $d) => $this->riderPayload($d));
    }

    public function riderPage(User $rider, string $scope, ?string $status = null, ?string $search = null, int $perPage = 20)
    {
        $this->assertRider($rider);

        return $this->withProof(Delivery::with(['order.items.addons', 'statusHistory']))->where('rider_user_id', $rider->id)
            ->when($scope === 'active', fn ($query) => $query->whereNotIn('status', Delivery::TERMINAL), fn ($query) => $query->whereIn('status', Delivery::TERMINAL))
            ->when($status, fn ($query) => $query->where('status', $status))
            ->when($scope === 'history' && trim($search ?? '') !== '', function ($query) use ($search) {
                $pattern = '%'.mb_strtolower(trim($search)).'%';
                $query->whereHas('order', fn ($order) => $order->where(function ($match) use ($pattern) {
                    $match->whereRaw('LOWER(order_number) LIKE ?', [$pattern])
                        ->orWhereRaw('LOWER(delivery_address) LIKE ?', [$pattern])
                        ->orWhereRaw('LOWER(delivery_recipient_name) LIKE ?', [$pattern]);
                }));
            })
            ->latest()->orderByDesc('id')->paginate($perPage)->through(fn (Delivery $delivery) => $this->riderPayload($delivery));
    }

    public function riderSummary(User $rider): array
    {
        $this->assertRider($rider);
        $query = Delivery::where('rider_user_id', $rider->id);
        $next = app(RiderWorkOrder::class)->next($rider);
        $ratings = DB::table('delivery_ratings')->where('rider_user_id', $rider->id);
        $timezone = config('restaurant.timezone', 'Asia/Manila');

        return [
            'active_count' => (clone $query)->whereNotIn('status', Delivery::TERMINAL)->count(),
            'completed_today' => (clone $query)->where('status', 'delivered')->whereBetween('delivered_at', [now($timezone)->startOfDay()->utc(), now($timezone)->endOfDay()->utc()])->count(),
            'delivered_total' => (clone $query)->where('status', 'delivered')->count(),
            'rating_average' => $ratings->avg('rating'), 'rating_count' => $ratings->count(),
            'next_delivery' => $next ? $this->riderPayload($next) : null,
        ];
    }

    public function managerPage(string $queue, ?string $search, int $perPage): array
    {
        $base = Delivery::query();
        $counts = [];
        foreach (['attention', 'waiting', 'pickup', 'road', 'finished'] as $key) {
            $counts[$key] = $this->inQueue(clone $base, $key)->count();
        }
        $query = $this->inQueue($base, $queue)->with(['order.items.addons', 'rider:id,name,is_active', 'statusHistory', 'locationUpdates' => fn ($q) => $q->latest('recorded_at')->limit(1)]);
        if (trim($search ?? '') !== '') {
            $pattern = '%'.mb_strtolower(trim($search)).'%';
            $query->where(fn ($match) => $match
                ->whereHas('order', fn ($order) => $order->where(fn ($fields) => $fields->whereRaw('LOWER(order_number) LIKE ?', [$pattern])->orWhereRaw('LOWER(delivery_address) LIKE ?', [$pattern])->orWhereRaw('LOWER(delivery_recipient_name) LIKE ?', [$pattern])))
                ->orWhereHas('rider', fn ($rider) => $rider->whereRaw('LOWER(name) LIKE ?', [$pattern])));
        }
        $page = $query->latest()->orderByDesc('id')->paginate($perPage);
        $page->getCollection()->each(function (Delivery $delivery) {
            $delivery->setAttribute('can_recover', $this->recoveryBlock($delivery) === null);
            $delivery->setAttribute('recovery_status', $this->recoveryStage($delivery));
            $delivery->setAttribute('recovery_blocked_reason', $this->recoveryBlock($delivery));
        });

        return ['page' => $page, 'counts' => $counts];
    }

    private function inQueue(Builder $query, string $queue): Builder
    {
        if ($queue === 'attention') {
            return $query->where(fn ($q) => $q->where('status', 'failed')->orWhere('dispatch_status', 'exhausted'));
        }
        $query->where('status', '!=', 'failed')->where(fn ($q) => $q->whereNull('dispatch_status')->orWhere('dispatch_status', '!=', 'exhausted'));

        return match ($queue) {
            'finished' => $query->whereIn('status', ['delivered', 'cancelled']),
            'road' => $query->whereIn('status', ['picked_up', 'in_transit']),
            'pickup' => $query->whereIn('status', ['assigned', 'accepted', 'arrived_at_restaurant']),
            default => $query->where('status', 'pending_assignment'),
        };
    }

    private function recoveryStage(Delivery $delivery): ?string
    {
        if ($delivery->status !== 'failed') {
            return null;
        }
        $event = $delivery->statusHistory->where('to_status', 'failed')->sortByDesc('id')->first();

        return in_array($event?->from_status, ['accepted', 'arrived_at_restaurant', 'picked_up', 'in_transit'], true) ? $event->from_status : null;
    }

    private function recoveryBlock(Delivery $delivery): ?string
    {
        if (! $this->recoveryStage($delivery)) {
            return 'Only an unsuccessful delivery with a recorded previous stage can be resumed.';
        }
        if (! $delivery->rider_user_id || ! $delivery->rider?->is_active) {
            return 'The original rider must still have an active account.';
        }
        if (in_array($delivery->order->status, ['completed', 'cancelled'], true)) {
            return 'A completed or cancelled order cannot be resumed.';
        }

        return null;
    }

    public function recover(Delivery $delivery, User $manager, string $reason): Delivery
    {
        abort_unless($manager->hasPermission('deliveries.manage'), 403);
        $result = DB::transaction(function () use ($delivery, $manager, $reason) {
            DispatchGuard::lock();
            $locked = Delivery::with(['order', 'rider', 'statusHistory'])->whereKey($delivery->id)->lockForUpdate()->firstOrFail();
            $locked->setRelation('order', Order::whereKey($locked->order_id)->lockForUpdate()->firstOrFail());
            if ($blocked = $this->recoveryBlock($locked)) {
                throw ValidationException::withMessages(['delivery' => $blocked]);
            }
            $rider = User::whereKey($locked->rider_user_id)->where('is_active', true)->lockForUpdate()->first();
            if (! $rider?->hasRole('rider') || ! $rider->hasPermission('deliveries.assigned')) {
                throw ValidationException::withMessages(['delivery' => 'The original rider must still have rider access.']);
            }
            $otherWork = Delivery::where('rider_user_id', $rider->id)->where('id', '!=', $locked->id)->whereNotIn('status', Delivery::TERMINAL);
            if ($locked->batch_key) {
                $otherWork->where(fn ($q) => $q->whereNull('batch_key')->orWhere('batch_key', '!=', $locked->batch_key));
            }
            if ($otherWork->exists()) {
                throw ValidationException::withMessages(['delivery' => 'The original rider has other active work. Resolve custody with that rider before resuming.']);
            }
            if ($locked->batch_key && Delivery::where('batch_key', $locked->batch_key)->where('id', '!=', $locked->id)->whereNotIn('status', Delivery::TERMINAL)->where('rider_user_id', '!=', $rider->id)->exists()) {
                throw ValidationException::withMessages(['delivery' => 'The paired deliveries no longer have the same rider. Resolve the batch before resuming.']);
            }
            if (DispatchOffer::where('active_rider_user_id', $rider->id)->exists()) {
                throw ValidationException::withMessages(['delivery' => 'The original rider has a live offer. End that offer before resuming this delivery.']);
            }
            $stage = $this->recoveryStage($locked);
            $locked->update(['status' => $stage, 'failure_reason' => null, 'dispatch_status' => 'manual_assigned', 'next_dispatch_at' => null, 'estimated_arrival_at' => null, 'route_geometry' => null, 'last_routed_at' => null]);
            $locked->assignments()->create(['rider_user_id' => $rider->id, 'assigned_by' => $manager->id, 'status' => 'accepted', 'reason' => 'Manager resumed with same rider and confirmed custody: '.$reason, 'accepted_at' => now()]);
            $locked->statusHistory()->create(['actor_id' => $manager->id, 'from_status' => 'failed', 'to_status' => $stage, 'reason' => 'Manager confirmed same-rider custody and resumed: '.$reason]);
            RiderProfile::where('user_id', $rider->id)->update(['is_available' => false]);

            return $locked->fresh(['order', 'rider']);
        }, 3);
        app(AuditLogService::class)->record($manager, 'delivery.recovered', $result, ['reason' => $reason, 'rider_id' => $result->rider_user_id], request());
        $this->notifyCustomer($result);
        $this->broadcast($result);

        return $result;
    }

    public function availableRiders()
    {
        return RiderProfile::with('user:id,name,email')->where('is_available', true)->whereHas('user', fn ($q) => $q->where('is_active', true)->whereHas('roles', fn ($r) => $r->where('slug', 'rider')))->orderBy('id')->get()->map(fn ($p) => ['id' => $p->user_id, 'name' => $p->user->name, 'email' => $p->user->email, 'phone' => $p->phone, 'vehicle_type' => $p->vehicle_type, 'vehicle_plate' => $p->vehicle_plate]);
    }

    public function assign(Delivery $delivery, User $manager, int $riderId, ?string $reason = null): Delivery
    {
        $result = DB::transaction(function () use ($delivery, $manager, $riderId, $reason): Delivery {
            DispatchGuard::lock();
            $locked = Delivery::whereKey($delivery->id)->lockForUpdate()->firstOrFail();
            if (in_array($locked->status, Delivery::TERMINAL, true) || in_array($locked->status, ['picked_up', 'in_transit'], true)) {
                throw ValidationException::withMessages(['delivery' => 'This delivery can no longer be assigned or reassigned.']);
            }
            $rider = User::whereKey($riderId)->where('is_active', true)->whereHas('roles', fn ($q) => $q->where('slug', 'rider'))->lockForUpdate()->first();
            $profile = $rider ? RiderProfile::where('user_id', $rider->id)->lockForUpdate()->first() : null;
            if (! $rider || ! $profile) {
                throw ValidationException::withMessages(['rider_id' => 'Select an active rider account.']);
            }
            if ($locked->rider_user_id === $rider->id && in_array($locked->status, ['assigned', 'accepted', 'arrived_at_restaurant'], true)) {
                throw ValidationException::withMessages(['rider_id' => 'This rider is already assigned to this delivery.']);
            }
            $busy = Delivery::where('rider_user_id', $rider->id)->whereNotIn('status', Delivery::TERMINAL)->where('id', '!=', $locked->id)->exists();
            if ($busy) {
                throw ValidationException::withMessages(['rider_id' => 'This rider already has an active delivery.']);
            }
            if (! $profile->is_available && $locked->rider_user_id !== $rider->id) {
                throw ValidationException::withMessages(['rider_id' => 'This rider is currently unavailable.']);
            }
            $from = $locked->status;
            if ($locked->batch_key) {
                throw ValidationException::withMessages(['delivery' => 'Cancel or finish the active batch before manually reassigning its rider.']);
            }
            app(DispatchService::class)->withdraw($locked->id);
            foreach (DispatchOffer::where('active_rider_user_id', $rider->id)->get() as $offer) {
                app(DispatchService::class)->withdraw($offer->delivery_id);
            }
            if ($locked->rider_user_id) {
                DeliveryAssignment::where('delivery_id', $locked->id)->where('rider_user_id', $locked->rider_user_id)->whereIn('status', ['assigned', 'accepted'])->latest()->first()?->update(['status' => 'reassigned', 'reason' => $reason, 'ended_at' => now()]);
                RiderProfile::where('user_id', $locked->rider_user_id)->update(['is_available' => true]);
            }
            $locked->update(['rider_user_id' => $rider->id, 'status' => 'assigned', 'assigned_at' => now(), 'accepted_at' => null, 'failure_reason' => null, 'dispatch_status' => 'manual_assigned', 'next_dispatch_at' => null]);
            $locked->assignments()->create(['rider_user_id' => $rider->id, 'assigned_by' => $manager->id, 'status' => 'assigned', 'reason' => $reason]);
            $locked->statusHistory()->create(['actor_id' => $manager->id, 'from_status' => $from, 'to_status' => 'assigned', 'reason' => $reason]);

            return $locked->fresh(['order', 'rider']);
        }, 3);
        app(AuditLogService::class)->record($manager, 'delivery.assigned', $result, ['rider_id' => $riderId, 'reason' => $reason], request());
        app(RestaurantNotificationService::class)->send($result->rider, 'delivery.assigned', 'Delivery assigned', 'A delivery has been assigned to you.', ['delivery_id' => $result->id, 'order_number' => $result->order?->order_number]);
        $this->notifyCustomer($result);
        $this->broadcast($result);

        return $result;
    }

    public function respond(Delivery $delivery, User $rider, string $response, ?string $reason = null): Delivery
    {
        $this->assertRider($rider);
        $result = DB::transaction(function () use ($delivery, $rider, $response, $reason): Delivery {
            DispatchGuard::lock();
            $locked = Delivery::whereKey($delivery->id)->lockForUpdate()->firstOrFail();
            if ($locked->rider_user_id !== $rider->id || $locked->status !== 'assigned') {
                throw new AuthorizationException('This assignment is no longer available to you.');
            }
            $assignment = $locked->assignments()->where('rider_user_id', $rider->id)->where('status', 'assigned')->latest()->lockForUpdate()->firstOrFail();
            $from = $locked->status;
            if ($response === 'accept') {
                $locked->update(['status' => 'accepted', 'accepted_at' => now()]);
                $assignment->update(['status' => 'accepted', 'accepted_at' => now()]);
                RiderProfile::where('user_id', $rider->id)->update(['is_available' => false]);
                $to = 'accepted';
            } else {
                $assignment->update(['status' => 'rejected', 'reason' => $reason, 'rejected_at' => now(), 'ended_at' => now()]);
                $locked->update(['status' => 'pending_assignment', 'rider_user_id' => null, 'assigned_at' => null]);
                $to = 'pending_assignment';
            }
            $locked->statusHistory()->create(['actor_id' => $rider->id, 'from_status' => $from, 'to_status' => $to, 'reason' => $reason]);

            return $locked->fresh(['order', 'rider']);
        }, 3);
        app(AuditLogService::class)->record($rider, 'delivery.assignment_'.$response, $result, ['reason' => $reason], request());
        if ($response === 'accept') {
            $this->notifyCustomer($result);
        }
        $this->broadcast($result);

        return $result;
    }

    public function transition(Delivery $delivery, User $actor, string $to, ?string $reason = null): Delivery
    {
        $isManager = $actor->hasPermission('deliveries.manage');
        if (! $isManager) {
            $this->assertRider($actor);
        }
        if ($to === 'cancelled' && ! $isManager) {
            throw new AuthorizationException('Only a manager can cancel a delivery.');
        }
        if (in_array($to, ['failed', 'cancelled'], true) && blank($reason)) {
            throw ValidationException::withMessages(['reason' => 'A reason is required.']);
        }
        $result = DB::transaction(function () use ($delivery, $actor, $to, $reason, $isManager): Delivery {
            DispatchGuard::lock();
            $locked = Delivery::whereKey($delivery->id)->lockForUpdate()->firstOrFail();
            if (! $isManager && $locked->rider_user_id !== $actor->id) {
                throw new AuthorizationException('This delivery is not assigned to your rider account.');
            }
            $allowed = [
                'pending_assignment' => ['cancelled'],
                'assigned' => ['cancelled'],
                'accepted' => ['arrived_at_restaurant', 'failed', 'cancelled'],
                'arrived_at_restaurant' => ['picked_up', 'failed', 'cancelled'],
                'picked_up' => ['in_transit', 'failed', 'cancelled'],
                'in_transit' => ['delivered', 'failed', 'cancelled'],
            ];
            if (! in_array($to, $allowed[$locked->status] ?? [], true)) {
                throw ValidationException::withMessages(['status' => "Delivery cannot move from {$locked->status} to {$to}."]);
            }
            if ($locked->batch_key && $to === 'in_transit' && Delivery::where('batch_key', $locked->batch_key)->where('id', '!=', $locked->id)->whereIn('status', ['accepted', 'arrived_at_restaurant'])->exists()) {
                throw ValidationException::withMessages(['status' => 'Pick up both batch orders before starting the delivery route.']);
            }
            if ($locked->batch_key && $to === 'delivered' && Delivery::where('batch_key', $locked->batch_key)->where('batch_sequence', '<', $locked->batch_sequence)->whereNotIn('status', Delivery::TERMINAL)->exists()) {
                throw ValidationException::withMessages(['status' => 'Complete the earlier drop-off in this batch first.']);
            }
            if ($to === 'picked_up' && $locked->order()->value('status') !== 'ready_to_serve') {
                throw ValidationException::withMessages(['status' => 'The kitchen must mark the order ready before pickup.']);
            }
            if ($to === 'delivered' && ! DB::table('delivery_proofs')->where('delivery_id', $locked->id)->where('rider_user_id', $locked->rider_user_id)->exists()) {
                throw ValidationException::withMessages(['photo' => 'Upload a delivery photo before marking this order delivered.']);
            }
            $from = $locked->status;
            $updates = ['status' => $to];
            if ($to === 'picked_up') {
                $updates['picked_up_at'] = now();
            }
            if ($to === 'delivered') {
                $updates['delivered_at'] = now();
                $updates['estimated_arrival_at'] = null;
                $updates['route_geometry'] = null;
            }
            if ($to === 'failed') {
                $updates['failure_reason'] = $reason;
                $updates['estimated_arrival_at'] = null;
                $updates['route_geometry'] = null;
            }
            if ($to === 'cancelled') {
                $updates['cancelled_at'] = now();
                $updates['failure_reason'] = $reason;
                $updates['estimated_arrival_at'] = null;
                $updates['route_geometry'] = null;
            }
            $locked->update($updates);
            if (in_array($to, Delivery::TERMINAL, true)) {
                app(DispatchService::class)->withdraw($locked->id);
                $locked->update(['dispatch_status' => $to, 'next_dispatch_at' => null]);
                DeliveryAssignment::where('delivery_id', $locked->id)->where('rider_user_id', $locked->rider_user_id)->whereIn('status', ['assigned', 'accepted'])->latest()->first()?->update(['status' => $to, 'reason' => $reason, 'ended_at' => now()]);
                if ($locked->rider_user_id && ! Delivery::where('rider_user_id', $locked->rider_user_id)->whereNotIn('status', Delivery::TERMINAL)->exists()) {
                    RiderProfile::where('user_id', $locked->rider_user_id)->update(['is_available' => true]);
                }
            }
            $locked->statusHistory()->create(['actor_id' => $actor->id, 'from_status' => $from, 'to_status' => $to, 'reason' => $reason]);
            if ($to === 'delivered') {
                $order = Order::whereKey($locked->order_id)->lockForUpdate()->firstOrFail();
                if ($order->status === 'ready_to_serve') {
                    $order->update(['status' => 'completed', 'completed_at' => now()]);
                    $order->statusHistory()->create(['actor_id' => $actor->id, 'from_status' => 'ready_to_serve', 'to_status' => 'completed', 'note' => 'Completed on delivery.']);
                }
            }

            return $locked->fresh(['order', 'rider']);
        }, 3);
        app(AuditLogService::class)->record($actor, 'delivery.status_changed', $result, ['status' => $to, 'reason' => $reason], request());
        $this->notifyCustomer($result);
        $this->broadcast($result);

        return $result;
    }

    public function location(Delivery $delivery, User $rider, array $data): array
    {
        $this->assertRider($rider);
        if (isset($data['accuracy_meters']) && $data['accuracy_meters'] > 500) {
            throw ValidationException::withMessages(['accuracy_meters' => 'GPS accuracy is too low to share a reliable position.']);
        }
        [$locked,$point] = DB::transaction(function () use ($delivery, $rider, $data) {
            // No cross-delivery decision: assignment/status changes use this same row lock.
            $locked = Delivery::whereKey($delivery->id)->lockForUpdate()->firstOrFail();
            if ($locked->rider_user_id !== $rider->id || ! in_array($locked->status, ['picked_up', 'in_transit'], true)) {
                throw new AuthorizationException('Location sharing is only available for your active picked-up delivery.');
            }
            $last = $locked->locationUpdates()->latest('recorded_at')->first();
            if ($last && $last->recorded_at->gt(now()->subSeconds(5))) {
                // Online presence and the delivery watcher may send the same GPS sample.
                return [$locked, $last];
            }
            $point = $locked->locationUpdates()->create(['rider_user_id' => $rider->id, 'latitude' => $data['latitude'], 'longitude' => $data['longitude'], 'accuracy_meters' => $data['accuracy_meters'] ?? null, 'speed_mps' => $data['speed_mps'] ?? null, 'recorded_at' => now()]);

            return [$locked, $point];
        }, 3);
        // Never wait on a map provider in a GPS request. Sync installations use the
        // scheduled ETA refresher; database workers process coalesced jobs promptly.
        if (config('queue.default') !== 'sync' && (! $locked->last_routed_at || $locked->last_routed_at->lt(now()->subSeconds(30)))) {
            try {
                RefreshDeliveryEta::dispatch($locked->id);
            } catch (\Throwable $exception) {
                report($exception);
            }
        }
        $locked = $locked->fresh();
        $payload = ['location' => ['latitude' => (float) $point->latitude, 'longitude' => (float) $point->longitude, 'recorded_at' => $point->recorded_at->toIso8601String(), 'accuracy_meters' => $point->accuracy_meters], 'eta' => $locked->estimated_arrival_at?->toIso8601String(), 'route' => $locked->route_geometry];
        try {
            broadcast(new DeliveryTrackingUpdated($locked, $payload));
        } catch (\Throwable $exception) {
            report($exception);
        }

        return $payload;
    }

    public function refreshEta(int $deliveryId): void
    {
        $lock = Cache::lock('delivery-eta:'.$deliveryId, 45);
        if (! $lock->get()) {
            return;
        }
        try {
            $delivery = Delivery::with('order')->find($deliveryId);
            if (! $delivery || ! in_array($delivery->status, ['picked_up', 'in_transit'], true) || ($delivery->last_routed_at && $delivery->last_routed_at->gt(now()->subSeconds(30)))) {
                return;
            }
            $point = $delivery->locationUpdates()->where('rider_user_id', $delivery->rider_user_id)->where('recorded_at', '>=', now()->subSeconds(90))->latest('recorded_at')->first();
            if (! $point || $delivery->order->delivery_latitude === null || $delivery->order->delivery_longitude === null) {
                return;
            }
            $route = $this->routeToDropoff($delivery, (float) $point->latitude, (float) $point->longitude);
            $updated = DB::transaction(function () use ($delivery, $route) {
                $current = Delivery::whereKey($delivery->id)->lockForUpdate()->firstOrFail();
                if ($current->rider_user_id !== $delivery->rider_user_id || ! in_array($current->status, ['picked_up', 'in_transit'], true)) {
                    return null;
                }
                $current->update(['estimated_arrival_at' => now()->addMinutes($route['duration_minutes']), 'last_routed_at' => now(), 'route_geometry' => $route['geometry']]);

                return $current;
            }, 3);
            if ($updated) {
                $this->broadcast($updated);
            }
        } finally {
            $lock->release();
        }
    }

    public function tracking(Delivery $delivery): array
    {
        $delivery->loadMissing('order.statusHistory', 'statusHistory', 'rider.riderProfile');
        $active = in_array($delivery->status, ['accepted', 'arrived_at_restaurant', 'picked_up', 'in_transit'], true);
        $last = $active ? $delivery->locationUpdates()->where('rider_user_id', $delivery->rider_user_id)->latest('recorded_at')->first() : null;
        $location = $last ? ['latitude' => (float) $last->latitude, 'longitude' => (float) $last->longitude, 'recorded_at' => $last->recorded_at->toIso8601String(), 'accuracy_meters' => $last->accuracy_meters] : null;
        $source = $location ? 'delivery_gps' : null;
        if ($active && $delivery->rider_user_id) {
            $presence = RiderProfile::where('user_id', $delivery->rider_user_id)->where('is_online', true)->where('located_at', '>=', now()->subSeconds(config('dispatch.gps_fresh_seconds', 90)))->first();
            if ($presence && $presence->latitude !== null && $presence->longitude !== null && $presence->accuracy_meters <= 500 && (! $last || $presence->located_at->gt($last->recorded_at))) {
                $location = ['latitude' => (float) $presence->latitude, 'longitude' => (float) $presence->longitude, 'recorded_at' => $presence->located_at->toIso8601String(), 'accuracy_meters' => $presence->accuracy_meters];
                $source = 'dispatch_presence';
            }
        }
        $order = $delivery->order;
        $pickup = $delivery->pickup_latitude !== null ? ['address' => $delivery->pickup_address, 'latitude' => $delivery->pickup_latitude, 'longitude' => $delivery->pickup_longitude] : app(DeliveryQuoteService::class)->location();
        $trail = $delivery->locationUpdates()->where('rider_user_id', $delivery->rider_user_id)
            ->when($delivery->picked_up_at, fn ($query) => $query->where('recorded_at', '>=', $delivery->picked_up_at))
            ->when($delivery->delivered_at, fn ($query) => $query->where('recorded_at', '<=', $delivery->delivered_at))
            ->where(fn ($query) => $query->whereNull('accuracy_meters')->orWhere('accuracy_meters', '<=', 500))
            ->orderByDesc('recorded_at')->orderByDesc('id')->limit(1000)->get()->reverse()->values()
            ->map(fn ($point) => ['latitude' => (float) $point->latitude, 'longitude' => (float) $point->longitude, 'recorded_at' => $point->recorded_at->toIso8601String()]);
        $arrivedAt = $delivery->statusHistory->where('to_status', 'arrived_at_restaurant')->sortBy('created_at')->first()?->created_at;
        $pickedUpAt = $delivery->picked_up_at ?? $delivery->statusHistory->where('to_status', 'picked_up')->sortBy('created_at')->first()?->created_at;
        $deliveredAt = $delivery->delivered_at ?? $delivery->statusHistory->where('to_status', 'delivered')->sortBy('created_at')->first()?->created_at;
        $freshRoute = in_array($delivery->status, ['picked_up', 'in_transit'], true) && $delivery->last_routed_at?->gte(now()->subSeconds(90));

        return [
            'delivery_id' => $delivery->id, 'order_number' => $order->order_number,
            'status' => $delivery->status, 'order_status' => $order->status, 'dispatch_status' => $delivery->dispatch_status,
            'prep_ready_at' => $order->prep_ready_at?->toIso8601String(), 'prep_minutes' => $order->prep_minutes,
            'rating' => DB::table('delivery_ratings')->where('delivery_id', $delivery->id)->value('rating'), 'failure_reason' => $delivery->failure_reason,
            'review' => app(RiderReviewService::class)->ownReview($delivery->id),
            'pickup' => $pickup,
            'arrival_times' => ['restaurant' => $arrivedAt?->toIso8601String(), 'picked_up' => $pickedUpAt?->toIso8601String(), 'delivered' => $deliveredAt?->toIso8601String()],
            'recorded_path' => $trail,
            'destination' => ['address' => $order->delivery_address, 'latitude' => $order->delivery_latitude, 'longitude' => $order->delivery_longitude, 'instructions' => $order->delivery_instructions],
            'rider' => $delivery->rider ? $delivery->rider->only('id', 'name') + ['vehicle_type' => $delivery->rider->riderProfile?->vehicle_type] : null, 'location' => $location, 'location_source' => $source,
            'last_location_at' => $location['recorded_at'] ?? null,
            'tracking_stale' => ! $location || now()->subSeconds(60)->gt(Carbon::parse($location['recorded_at'])),
            'map_provider' => config('services.maps.provider'),
            'proof_available' => $delivery->status === 'delivered' && DB::table('delivery_proofs')->where('delivery_id', $delivery->id)->where('rider_user_id', $delivery->rider_user_id)->exists(),
            'eta' => $freshRoute ? $delivery->estimated_arrival_at?->toIso8601String() : null,
            'route' => $freshRoute ? $delivery->route_geometry : null,
            'history' => $delivery->statusHistory->map(fn ($h) => ['id' => $h->id, 'status' => $h->to_status, 'at' => $h->created_at?->toIso8601String()])->values(),
            'order_history' => $order->statusHistory->map(fn ($h) => ['id' => $h->id, 'status' => $h->to_status, 'at' => $h->created_at?->toIso8601String()])->values(),
        ];
    }

    private function riderPayload(Delivery $delivery): array
    {
        $order = $delivery->order;
        if (! array_key_exists('proof_uploaded', $delivery->getAttributes())) {
            $delivery->setAttribute('proof_uploaded', DB::table('delivery_proofs')->where('delivery_id', $delivery->id)->where('rider_user_id', $delivery->rider_user_id)->exists());
        }

        return ['id' => $delivery->id, 'proof_uploaded' => (bool) $delivery->proof_uploaded, 'status' => $delivery->status, 'batch_key' => $delivery->batch_key, 'batch_sequence' => $delivery->batch_sequence, 'order' => ['id' => $order->id, 'order_number' => $order->order_number, 'status' => $order->status, 'total' => $order->total, 'items' => $order->items, 'pickup' => ($delivery->pickup_latitude !== null ? ['latitude' => $delivery->pickup_latitude, 'longitude' => $delivery->pickup_longitude, 'address' => $delivery->pickup_address] : app(DeliveryQuoteService::class)->location()), 'destination' => ['address' => $order->delivery_address, 'latitude' => $order->delivery_latitude, 'longitude' => $order->delivery_longitude, 'recipient_name' => $order->delivery_recipient_name, 'phone' => $order->delivery_phone, 'instructions' => $order->delivery_instructions]], 'history' => $delivery->statusHistory];
    }

    private function withProof(Builder $query): Builder
    {
        return $query->addSelect(['deliveries.*'])->selectSub(DB::table('delivery_proofs')->selectRaw('1')->whereColumn('delivery_id', 'deliveries.id')->whereColumn('rider_user_id', 'deliveries.rider_user_id')->limit(1), 'proof_uploaded');
    }

    private function routeToDropoff(Delivery $delivery, float $lat, float $lng): array
    {
        $stops = $delivery->batch_key ? Delivery::with('order')->where('batch_key', $delivery->batch_key)->where('batch_sequence', '<', $delivery->batch_sequence)->whereNotIn('status', Delivery::TERMINAL)->orderBy('batch_sequence')->get() : collect();
        $stops->push($delivery);
        $route = ['distance_km' => 0, 'duration_minutes' => 0, 'geometry' => []];
        foreach ($stops as $stop) {
            $toLat = (float) $stop->order->delivery_latitude;
            $toLng = (float) $stop->order->delivery_longitude;
            if (DispatchGeo::distance($lat, $lng, $toLat, $toLng) >= 0.02) {
                $leg = $this->maps->route($lat, $lng, $toLat, $toLng, true);
                $route['distance_km'] += $leg['distance_km'];
                $route['duration_minutes'] += $leg['duration_minutes'];
                $route['geometry'] = array_merge($route['geometry'], $leg['geometry'] ?? []);
            }
            $lat = $toLat;
            $lng = $toLng;
        }

        return $route;
    }

    private function assertRider(User $user): void
    {
        if (! $user->hasRole('rider') || ! $user->hasPermission('deliveries.assigned')) {
            throw new AuthorizationException('A delivery rider account is required.');
        }
    }

    private function notifyCustomer(Delivery $delivery): void
    {
        $business = RestaurantSetting::where('key', 'business_profile')->value('value') ?? [];
        if (($business['notifications_enabled'] ?? true) === false) {
            return;
        }
        $customer = $delivery->order()->with('customer')->first()?->customer;
        if ($customer) {
            try {
                Notification::send($customer, new DeliveryProgressNotification($delivery->loadMissing('order')));
            } catch (\Throwable $exception) {
                report($exception);
            }
        }
    }

    private function broadcast(Delivery $delivery): void
    {
        try {
            broadcast(new DeliveryTrackingUpdated($delivery));
        } catch (\Throwable $exception) {
            report($exception);
        }
    }
}
