<?php

namespace App\Services;

use App\Models\Delivery;
use App\Models\DispatchOffer;
use App\Models\Order;
use App\Models\RiderProfile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class DispatchCandidates
{
    public function __construct(private MapProviderService $maps) {}

    public static function paid(Order $order): bool
    {
        $payments = DB::table('payments')->where('order_id', $order->id)->where('status', 'paid')->where('currency', $order->currency);

        return (clone $payments)->exists() && (int) round((float) $payments->sum('amount') * 100) >= (int) round((float) $order->total * 100);
    }

    public function radius(int $stage): float
    {
        $radii = config('dispatch.radii_km');

        return min((float) $radii[min($stage, count($radii) - 1)], (float) (app(DeliveryQuoteService::class)->policy()['radius_km'] ?? 8));
    }

    public function eligible(Delivery $delivery, RiderProfile $profile, ?int $ignoreOffer = null): bool
    {
        if (! $profile->is_online || ! $profile->located_at || $profile->located_at->lt(now()->subSeconds(config('dispatch.gps_fresh_seconds'))) || $profile->latitude === null || $profile->longitude === null || $profile->accuracy_meters > 500) {
            return false;
        }
        $user = $profile->user;
        if (! $user?->is_active || ! $user->hasRole('rider') || ! $user->hasPermission('deliveries.assigned')) {
            return false;
        }
        if (DispatchOffer::where('active_rider_user_id', $profile->user_id)->when($ignoreOffer, fn ($q) => $q->where('id', '!=', $ignoreOffer))->exists()) {
            return false;
        }
        if ($delivery->offers()->where('round', $delivery->dispatch_round)->where('rider_user_id', $profile->user_id)->whereIn('status', ['rejected', 'expired'])->exists()) {
            return false;
        }
        $point = DeliveryPoint::from($delivery);
        if (DispatchGeo::distance($point->lat, $point->lng, $profile->latitude, $profile->longitude) > $this->radius($delivery->dispatch_stage)) {
            return false;
        }
        $vehicle = strtolower(trim($profile->vehicle_type ?? ''));
        $capacity = config("dispatch.vehicle_capacity.{$vehicle}", 0);
        $required = config('dispatch.order_load.'.$delivery->order->delivery_vehicle_class, 2);
        $active = Delivery::with('order')->where('rider_user_id', $profile->user_id)->whereNotIn('status', Delivery::TERMINAL)->get();
        $vehicleRank = ['bicycle' => 1, 'motorcycle' => 2, 'car' => 3];
        if (($vehicleRank[$vehicle] ?? 0) < ($vehicleRank[$delivery->order->delivery_vehicle_class] ?? 2)) {
            return false;
        }
        if ($active->isEmpty()) {
            return $profile->is_available && $required <= $capacity;
        }
        if (! config('dispatch.batch.enabled') || $active->count() !== 1) {
            return false;
        }
        $other = $active->first();
        if (! in_array($other->status, ['accepted', 'arrived_at_restaurant'], true) || $other->batch_key || $other->pickup_latitude === null || ! $other->order->prep_ready_at || ! self::paid($other->order)) {
            return false;
        }
        if ($required + config('dispatch.order_load.'.$other->order->delivery_vehicle_class, 2) > $capacity) {
            return false;
        }
        if (abs($other->order->prep_ready_at->diffInMinutes($delivery->order->prep_ready_at, false)) > config('dispatch.batch.max_ready_gap_minutes')) {
            return false;
        }
        $a = DeliveryPoint::from($other);

        return DispatchGeo::distance($a->lat, $a->lng, $point->lat, $point->lng) <= config('dispatch.batch.max_pickup_km')
            && DispatchGeo::aligned($a, $point, config('dispatch.batch.max_heading_degrees'));
    }

    public function rank(Delivery $delivery): array
    {
        $p = DeliveryPoint::from($delivery);
        $profiles = RiderProfile::with('user.roles.permissions')->where('is_online', true)
            ->where('located_at', '>=', now()->subSeconds(config('dispatch.gps_fresh_seconds')))
            ->whereIn('geohash', DispatchGeo::cells($p->lat, $p->lng, $this->radius($delivery->dispatch_stage)))->get()
            ->filter(fn ($profile) => $this->eligible($delivery, $profile))
            ->sortBy(fn ($profile) => DispatchGeo::distance($p->lat, $p->lng, $profile->latitude, $profile->longitude))
            ->take(config('dispatch.shortlist'));
        $ranked = [];
        foreach ($profiles as $profile) {
            try {
                $eta = $this->travel($profile->latitude, $profile->longitude, $p->lat, $p->lng);
                $batch = Delivery::with('order')->where('rider_user_id', $profile->user_id)->whereNotIn('status', Delivery::TERMINAL)->first();
                $detour = 0;
                $sequence = [$delivery->id];
                if ($batch) {
                    $a = DeliveryPoint::from($batch);
                    $first = DispatchGeo::distance($p->lat, $p->lng, $p->dropLat, $p->dropLng) <= DispatchGeo::distance($p->lat, $p->lng, $a->dropLat, $a->dropLng);
                    $sequence = $first ? [$delivery->id, $batch->id] : [$batch->id, $delivery->id];
                    $firstDrop = $first ? [$p->dropLat, $p->dropLng] : [$a->dropLat, $a->dropLng];
                    $lastDrop = $first ? [$a->dropLat, $a->dropLng] : [$p->dropLat, $p->dropLng];
                    $pickup = $this->travel($profile->latitude, $profile->longitude, $a->lat, $a->lng);
                    $extraPickup = $this->travel($a->lat, $a->lng, $p->lat, $p->lng);
                    $eta = $pickup + $extraPickup;
                    $total = $eta + $this->travel($p->lat, $p->lng, ...$firstDrop) + $this->travel(...array_merge($firstDrop, $lastDrop));
                    $baseline = $pickup + $this->travel($a->lat, $a->lng, $a->dropLat, $a->dropLng);
                    $detour = max(0, $total - $baseline);
                    if ($detour > config('dispatch.batch.max_detour_minutes')) {
                        continue;
                    }
                }
                $outcomes = DispatchOffer::where('rider_user_id', $profile->user_id)->whereIn('status', ['accepted', 'rejected', 'expired'])->selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status');
                $acceptance = ($outcomes['accepted'] ?? 0) / max(1, $outcomes->sum());
                if ($outcomes->sum() === 0) {
                    $acceptance = 1;
                }
                $rating = (float) (DB::table('delivery_ratings')->where('rider_user_id', $profile->user_id)->avg('rating') ?? 3);
                $w = config('dispatch.weights');
                $score = -$w['eta'] * min(1, $eta / 30) + $w['rating'] * ($rating / 5) + $w['acceptance'] * $acceptance - $w['batch'] * min(1, $detour / 5);
                $ranked[] = ['rider_id' => $profile->user_id, 'eta_minutes' => $eta, 'score' => $score, 'rating' => $rating, 'acceptance_rate' => $acceptance,
                    'detour_minutes' => $detour, 'batch_delivery_id' => $batch?->id, 'drop_sequence' => $sequence,
                    'latitude' => (float) $profile->latitude, 'longitude' => (float) $profile->longitude];
            } catch (\Throwable $exception) {
                // No route means no offer, rather than an invented road ETA.
                report($exception);
            }
        }
        usort($ranked, fn ($a, $b) => ($b['score'] <=> $a['score']) ?: ($a['rider_id'] <=> $b['rider_id']));

        return $ranked;
    }

    public function travel(float $a, float $b, float $c, float $d): int
    {
        if (DispatchGeo::distance($a, $b, $c, $d) < 0.02) {
            return 0;
        }
        $key = 'dispatch-road:'.hash('sha256', json_encode([config('services.maps.provider'), round($a, 4), round($b, 4), round($c, 4), round($d, 4)]));

        return Cache::remember($key, 60, fn () => (int) $this->maps->route($a, $b, $c, $d)['duration_minutes']);
    }
}
