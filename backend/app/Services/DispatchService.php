<?php

namespace App\Services;

use App\Events\DeliveryTrackingUpdated;
use App\Events\DispatchOfferUpdated;
use App\Models\Delivery;
use App\Models\DispatchOffer;
use App\Models\Order;
use App\Models\RiderProfile;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class DispatchService
{
    public function __construct(private DispatchCandidates $candidates) {}

    public function tick(?int $only = null): void
    {
        // Expirations still run if new automatic dispatch has been switched off.
        foreach (DispatchOffer::where('status', 'offered')->where('expires_at', '<=', now())->when($only, fn ($q) => $q->where('delivery_id', $only))->limit(100)->pluck('id') as $id) {
            DB::transaction(function () use ($id) {
                DispatchGuard::lock();
                $offer = DispatchOffer::lockForUpdate()->find($id);
                if ($offer?->status === 'offered' && $offer->expires_at->lte(now())) {
                    $this->finish($offer, 'expired');
                }
            }, 3);
        }
        if (! config('dispatch.enabled')) {
            return;
        }
        $ids = Delivery::where('status', 'pending_assignment')->where('dispatch_status', '!=', 'exhausted')
            ->where(fn ($q) => $q->whereNull('next_dispatch_at')->orWhere('next_dispatch_at', '<=', now()))
            ->when($only, fn ($q) => $q->whereKey($only))->orderByRaw('COALESCE(next_dispatch_at, created_at)')->orderBy('id')->limit(30)->pluck('id');
        foreach ($ids as $id) {
            try {
                $this->step($id);
            } catch (\Throwable $exception) {
                report($exception);
            }
        }
    }

    public function step(int $id): void
    {
        $snapshot = DB::transaction(function () use ($id) {
            DispatchGuard::lock();
            $delivery = Delivery::with('order')->lockForUpdate()->findOrFail($id);
            $delivery->setRelation('order', Order::whereKey($delivery->order_id)->lockForUpdate()->firstOrFail());
            if (! $this->ready($delivery)) {
                return null;
            }
            if (DispatchOffer::where('active_delivery_id', $id)->exists()) {
                return null;
            }
            if ($delivery->pickup_latitude === null || $delivery->pickup_longitude === null) {
                $location = app(DeliveryQuoteService::class)->location();
                if (! isset($location['latitude'], $location['longitude'])) {
                    $delivery->update(['dispatch_status' => 'missing_pickup', 'next_dispatch_at' => now()->addSeconds(30)]);

                    return null;
                }
                $delivery->update(['pickup_latitude' => $location['latitude'], 'pickup_longitude' => $location['longitude'], 'pickup_address' => $location['address'] ?? null]);
            }
            if ($delivery->search_stage_started_at && ($delivery->dispatch_attempts >= config('dispatch.attempts_per_radius') || $delivery->search_stage_started_at->lte(now()->subSeconds(config('dispatch.seconds_per_radius'))))) {
                if ($delivery->dispatch_stage >= count(config('dispatch.radii_km')) - 1) {
                    $delivery->update(['dispatch_status' => 'exhausted', 'next_dispatch_at' => null]);
                    $delivery->statusHistory()->create(['to_status' => 'pending_assignment', 'reason' => 'Automatic search exhausted; dispatcher attention required.']);
                    DB::afterCommit(function () use ($delivery) {
                        foreach (User::where('is_active', true)->whereHas('roles.permissions', fn ($q) => $q->where('slug', 'deliveries.manage'))->get() as $manager) {
                            app(RestaurantNotificationService::class)->send($manager, 'delivery.dispatch_exhausted', 'No rider accepted', 'Review delivery '.$delivery->order->order_number.' and assign a rider or restart the search.', ['delivery_id' => $delivery->id]);
                        }
                    });

                    return null;
                }
                $delivery->update(['dispatch_stage' => $delivery->dispatch_stage + 1, 'dispatch_attempts' => 0, 'search_stage_started_at' => now()]);
            }

            return $delivery;
        }, 3);
        if (! $snapshot) {
            return;
        }
        // Routing and scoring happen outside SQL locks; final reservation rechecks every hard filter.
        $ranked = $this->candidates->rank($snapshot);
        DB::transaction(function () use ($snapshot, $ranked) {
            DispatchGuard::lock();
            $delivery = Delivery::whereKey($snapshot->id)->lockForUpdate()->firstOrFail();
            $delivery->setRelation('order', Order::whereKey($delivery->order_id)->lockForUpdate()->firstOrFail());
            if (! $this->ready($delivery) || $delivery->dispatch_stage !== $snapshot->dispatch_stage || $delivery->dispatch_round !== $snapshot->dispatch_round || DispatchOffer::where('active_delivery_id', $delivery->id)->exists()) {
                return;
            }
            foreach ($ranked as $candidate) {
                $profile = RiderProfile::where('user_id', $candidate['rider_id'])->lockForUpdate()->first();
                if (! $profile || ! $this->candidates->eligible($delivery, $profile)) {
                    continue;
                }
                if (DispatchGeo::distance($profile->latitude, $profile->longitude, $candidate['latitude'], $candidate['longitude']) > 0.2) {
                    continue;
                }
                $activeId = Delivery::where('rider_user_id', $profile->user_id)->whereNotIn('status', Delivery::TERMINAL)->value('id');
                if ($activeId !== $candidate['batch_delivery_id']) {
                    continue;
                }
                $sendAt = $delivery->order->prep_ready_at->copy()->subMinutes($candidate['eta_minutes'] + config('dispatch.pickup_buffer_minutes'));
                if ($sendAt->gt(now())) {
                    $delivery->update(['dispatch_status' => 'scheduled', 'next_dispatch_at' => $sendAt]);

                    return;
                }
                $offer = DispatchOffer::create(['delivery_id' => $delivery->id, 'rider_user_id' => $profile->user_id,
                    'active_delivery_id' => $delivery->id, 'active_rider_user_id' => $profile->user_id, 'status' => 'offered',
                    'expires_at' => now()->addSeconds(config('dispatch.offer_seconds')), 'ranking' => $candidate, 'round' => $delivery->dispatch_round]);
                $delivery->update(['dispatch_status' => 'offered', 'dispatch_attempts' => $delivery->dispatch_attempts + 1,
                    'search_stage_started_at' => $delivery->search_stage_started_at ?? now(), 'next_dispatch_at' => $offer->expires_at]);
                $this->publish($offer, true);

                return;
            }
            $early = $delivery->order->prep_ready_at->gt(now()->addMinutes(5));
            $delivery->update(['dispatch_status' => $early ? 'scheduled' : 'searching',
                'search_stage_started_at' => $early ? null : ($delivery->search_stage_started_at ?? now()),
                'next_dispatch_at' => $early ? $delivery->order->prep_ready_at->copy()->subMinutes(5) : now()->addSeconds(5)]);
        }, 3);
    }

    private function ready(Delivery $delivery): bool
    {
        if ($delivery->status !== 'pending_assignment' || $delivery->rider_user_id || $delivery->dispatch_status === 'exhausted') {
            return false;
        }
        $order = $delivery->order;
        if (in_array($order->status, ['cancelled', 'completed'], true)) {
            $this->withdraw($delivery->id);
            $delivery->update(['status' => 'cancelled', 'dispatch_status' => 'cancelled', 'cancelled_at' => now(), 'next_dispatch_at' => null]);

            return false;
        }
        if (! $order->prep_ready_at || ! in_array($order->status, ['confirmed', 'preparing', 'ready_to_serve'], true)) {
            $delivery->update(['dispatch_status' => 'waiting_merchant', 'next_dispatch_at' => now()->addSeconds(5)]);

            return false;
        }
        if (! DispatchCandidates::paid($order)) {
            $this->withdraw($delivery->id);
            $delivery->update(['dispatch_status' => 'waiting_payment', 'next_dispatch_at' => now()->addSeconds(5)]);

            return false;
        }

        return true;
    }

    public function respond(DispatchOffer $given, User $rider, string $response): Delivery
    {
        abort_unless($given->rider_user_id === $rider->id && $rider->hasRole('rider') && $rider->hasPermission('deliveries.assigned'), 403);
        $result = DB::transaction(function () use ($given, $rider, $response) {
            DispatchGuard::lock();
            $offer = DispatchOffer::whereKey($given->id)->lockForUpdate()->firstOrFail();
            $delivery = Delivery::whereKey($offer->delivery_id)->lockForUpdate()->firstOrFail();
            $delivery->setRelation('order', Order::whereKey($delivery->order_id)->lockForUpdate()->firstOrFail());
            if ($offer->status === 'accepted' && $response === 'accept' && $delivery->rider_user_id === $rider->id) {
                return $delivery;
            }
            if ($offer->status !== 'offered') {
                return null;
            }
            if ($offer->expires_at->lte(now())) {
                $this->finish($offer, 'expired');

                return null;
            }
            if ($response === 'reject') {
                $this->finish($offer, 'rejected');

                return $delivery;
            }
            $profile = RiderProfile::where('user_id', $rider->id)->lockForUpdate()->firstOrFail();
            if (! $this->ready($delivery) || ! $this->candidates->eligible($delivery, $profile, $offer->id)) {
                $this->finish($offer, 'cancelled');

                return null;
            }
            $other = Delivery::where('rider_user_id', $rider->id)->whereNotIn('status', Delivery::TERMINAL)->first();
            if ($other?->id !== ($offer->ranking['batch_delivery_id'] ?? null)) {
                $this->finish($offer, 'cancelled');

                return null;
            }
            $this->finish($offer, 'accepted');
            $delivery->update(['rider_user_id' => $rider->id, 'status' => 'accepted', 'assigned_at' => now(), 'accepted_at' => now(), 'dispatch_status' => 'assigned', 'next_dispatch_at' => null]);
            $delivery->assignments()->create(['rider_user_id' => $rider->id, 'assigned_by' => null, 'status' => 'accepted', 'accepted_at' => now(), 'reason' => 'Accepted automatic offer '.$offer->id]);
            $delivery->statusHistory()->create(['actor_id' => $rider->id, 'from_status' => 'pending_assignment', 'to_status' => 'accepted', 'reason' => 'Automatic offer accepted.']);
            if ($other) {
                $key = (string) Str::uuid();
                foreach ($offer->ranking['drop_sequence'] as $index => $id) {
                    Delivery::whereKey($id)->update(['batch_key' => $key, 'batch_sequence' => $index + 1]);
                }
            }
            $profile->update(['is_available' => false]);
            DB::afterCommit(function () use ($delivery) {
                app(RestaurantNotificationService::class)->send($delivery->order->customer, 'delivery.accepted', 'Rider found', 'A rider accepted your delivery.', ['delivery_id' => $delivery->id]);
                try {
                    broadcast(new DeliveryTrackingUpdated($delivery->fresh()));
                } catch (\Throwable $e) {
                    report($e);
                }
            });

            return $delivery->fresh();
        }, 3);
        if ($response === 'reject' || ! $result) {
            $this->tick($given->delivery_id);
        }
        if (! $result) {
            throw ValidationException::withMessages(['offer' => 'This offer expired or is no longer available. Refresh your offers.']);
        }

        return $result;
    }

    public function withdraw(int $deliveryId): void
    {
        foreach (DispatchOffer::where('active_delivery_id', $deliveryId)->get() as $offer) {
            $this->finish($offer, 'cancelled');
        }
    }

    private function finish(DispatchOffer $offer, string $status): void
    {
        $offer->update(['status' => $status, 'active_delivery_id' => null, 'active_rider_user_id' => null, 'responded_at' => now()]);
        if ($status !== 'accepted') {
            Delivery::whereKey($offer->delivery_id)->where('status', 'pending_assignment')->update(['dispatch_status' => 'searching', 'next_dispatch_at' => now()]);
        }
        $this->publish($offer);
    }

    private function publish(DispatchOffer $offer, bool $notify = false): void
    {
        DB::afterCommit(function () use ($offer, $notify) {
            try {
                broadcast(new DispatchOfferUpdated($offer));
            } catch (\Throwable $e) {
                report($e);
            }
            if ($notify) {
                app(RestaurantNotificationService::class)->send($offer->rider, 'delivery.offer', 'New delivery offer', 'Accept or decline before the offer expires.', ['offer_id' => $offer->id, 'expires_at' => $offer->expires_at->toIso8601String()]);
            }
        });
    }

    public function retry(Delivery $given, User $manager): Delivery
    {
        abort_unless($manager->hasPermission('deliveries.manage'), 403);
        DB::transaction(function () use ($given, $manager) {
            DispatchGuard::lock();
            $delivery = Delivery::whereKey($given->id)->lockForUpdate()->firstOrFail();
            if ($delivery->status !== 'pending_assignment') {
                throw ValidationException::withMessages(['delivery' => 'Only an unassigned delivery can restart its automatic search.']);
            }
            $this->withdraw($delivery->id);
            $delivery->update(['dispatch_status' => 'searching', 'dispatch_stage' => 0, 'dispatch_attempts' => 0, 'dispatch_round' => $delivery->dispatch_round + 1, 'search_stage_started_at' => null, 'next_dispatch_at' => now()]);
            $delivery->statusHistory()->create(['actor_id' => $manager->id, 'to_status' => 'pending_assignment', 'reason' => 'Dispatcher restarted automatic search.']);
        }, 3);
        $this->tick($given->id);

        return $given->fresh();
    }
}
