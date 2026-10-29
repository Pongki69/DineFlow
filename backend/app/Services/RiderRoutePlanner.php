<?php

namespace App\Services;

use App\Models\Delivery;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Validation\ValidationException;

class RiderRoutePlanner
{
    public function __construct(private MapProviderService $maps) {}

    public function plan(User $rider, array $ids, ?array $origin, bool $returnToStore = false, ?string $returnStoreKey = null, ?int $navigationDeliveryId = null): array
    {
        $deliveries = Delivery::with('order')->where('rider_user_id', $rider->id)
            ->whereNotIn('status', Delivery::TERMINAL)->whereIn('id', $ids)->get()->keyBy('id');
        abort_unless($deliveries->count() === count($ids), 404);
        abort_if($navigationDeliveryId !== null && ! $deliveries->has($navigationDeliveryId), 404);
        $ordered = collect($ids)->map(fn ($id) => $deliveries[$id]);
        $location = app(DeliveryQuoteService::class)->location();
        $sources = $deliveries->sortKeys()->values();
        $hasCurrentOutlet = $this->point($location['latitude'] ?? null, $location['longitude'] ?? null);
        if ($sources->isEmpty() && ! $hasCurrentOutlet) {
            $last = Delivery::where('rider_user_id', $rider->id)->whereNotNull('pickup_latitude')->latest('assigned_at')->first();
            if ($last) {
                $sources = collect([$last]);
            }
        }
        $stores = [];
        if ($hasCurrentOutlet) {
            $key = $this->storeKey($location['latitude'], $location['longitude']);
            $stores[$key] = ['key' => $key, 'name' => $location['name'] ?? 'Restaurant', 'address' => $location['address'] ?? 'Restaurant', 'latitude' => (float) $location['latitude'], 'longitude' => (float) $location['longitude'], 'is_primary' => true];
        }
        foreach ($sources as $delivery) {
            if (! $this->point($delivery->pickup_latitude, $delivery->pickup_longitude)) {
                continue;
            }
            $key = $this->storeKey($delivery->pickup_latitude, $delivery->pickup_longitude);
            if (! isset($stores[$key])) {
                $stores[$key] = ['key' => $key, 'name' => 'Delivery pickup location', 'address' => $delivery->pickup_address, 'latitude' => (float) $delivery->pickup_latitude, 'longitude' => (float) $delivery->pickup_longitude, 'is_primary' => false];
            }
        }
        if ($returnStoreKey && ! isset($stores[$returnStoreKey])) {
            throw ValidationException::withMessages(['return_store_key' => 'Choose your current outlet or one of your delivery pickup locations.']);
        }
        foreach ($ordered->filter(fn ($d) => $d->batch_key)->groupBy('batch_key') as $batch) {
            $sequence = $batch->pluck('batch_sequence')->all();
            $sorted = $sequence;
            sort($sorted);
            if ($sequence !== $sorted) {
                throw ValidationException::withMessages(['delivery_ids' => 'Keep paired deliveries in their assigned drop-off sequence.']);
            }
        }
        $stops = [];
        $missing = [];
        $pickupKeys = [];
        // Collect all remaining pickups before starting the planned drop-offs.
        foreach ($ordered as $delivery) {
            if (in_array($delivery->status, ['picked_up', 'in_transit'], true)) {
                continue;
            }
            $pickup = $delivery->pickup_latitude !== null
                ? ['latitude' => $delivery->pickup_latitude, 'longitude' => $delivery->pickup_longitude, 'address' => $delivery->pickup_address]
                : app(DeliveryQuoteService::class)->location();
            if (! $this->point($pickup['latitude'] ?? null, $pickup['longitude'] ?? null)) {
                $missing[] = $delivery->order->order_number.' pickup';

                continue;
            }
            $key = $pickup['latitude'].','.$pickup['longitude'];
            if (isset($pickupKeys[$key])) {
                $stops[$pickupKeys[$key]]['order_numbers'][] = $delivery->order->order_number;

                continue;
            }
            $pickupKeys[$key] = count($stops);
            $stops[] = ['kind' => 'pickup', 'latitude' => (float) $pickup['latitude'], 'longitude' => (float) $pickup['longitude'], 'address' => $pickup['address'] ?? 'Restaurant pickup', 'order_numbers' => [$delivery->order->order_number]];
        }
        foreach ($ordered as $delivery) {
            $order = $delivery->order;
            if (! $this->point($order->delivery_latitude, $order->delivery_longitude)) {
                $missing[] = $order->order_number.' drop-off';

                continue;
            }
            $stops[] = ['kind' => 'dropoff', 'delivery_id' => $delivery->id, 'latitude' => (float) $order->delivery_latitude, 'longitude' => (float) $order->delivery_longitude, 'address' => $order->delivery_address, 'order_numbers' => [$order->order_number]];
        }
        $returnStore = $returnStoreKey ? ($stores[$returnStoreKey] ?? null) : (array_values($stores)[0] ?? null);
        if ($returnToStore && ! $returnStore) {
            $missing[] = 'Store location';
        }
        if ($returnToStore && $returnStore) {
            $stops[] = [...$returnStore, 'kind' => 'return', 'order_numbers' => []];
        }
        $legs = [];
        $previous = $origin;
        $distance = 0;
        $duration = 0;
        $unavailable = false;
        $etaValid = (bool) $origin && ! $missing;
        $departure = now();
        $sequenceRoute = null;
        $sequenceFailed = false;
        $useSequenceRoute = $this->maps->supportsRouteSequence() && count($stops) + (bool) $origin > 1;
        if ($useSequenceRoute) {
            $points = $origin ? [$origin, ...array_map(fn ($stop) => [
                'latitude' => $stop['latitude'],
                'longitude' => $stop['longitude'],
            ], $stops)] : array_map(fn ($stop) => [
                'latitude' => $stop['latitude'],
                'longitude' => $stop['longitude'],
            ], $stops);
            $sequenceKey = 'rider-plan-sequence-v2:'.hash('sha256', config('services.maps.local_osrm_url').json_encode($points));
            try {
                $sequenceRoute = Cache::remember($sequenceKey, 60, fn () => $this->maps->routeSequence($points));
            } catch (\Throwable $e) {
                report($e);
                $sequenceFailed = true;
            }
        }
        foreach ($stops as $index => $stop) {
            if ($sequenceFailed) {
                $unavailable = true;
                $etaValid = false;
            } elseif ($previous) {
                try {
                    $sequenceIndex = $origin ? $index : $index - 1;
                    if ($sequenceRoute && isset($sequenceRoute['legs'][$sequenceIndex])) {
                        $leg = $sequenceRoute['legs'][$sequenceIndex];
                    } elseif (abs($previous['latitude'] - $stop['latitude']) + abs($previous['longitude'] - $stop['longitude']) < 0.00001) {
                        $leg = ['distance_km' => 0, 'duration_minutes' => 0, 'geometry' => []];
                    } else {
                        $points = [(float) $previous['latitude'], (float) $previous['longitude'], $stop['latitude'], $stop['longitude']];
                        $key = 'rider-plan-v2:'.config('services.maps.provider').':'.(int) config('services.maps.traffic_enabled').':'.hash('sha256', json_encode($points));
                        $leg = Cache::remember($key, 60, fn () => $this->maps->route(...[...$points, true, true]));
                    }
                    $legs[] = [...$leg, 'stop_index' => $index];
                    $distance += $leg['distance_km'];
                    $duration += $leg['duration_minutes'];
                } catch (\Throwable $e) {
                    report($e);
                    $unavailable = true;
                    $etaValid = false;
                }
            }
            $stops[$index]['eta_at'] = $etaValid ? $departure->copy()->addMinutes($duration)->toIso8601String() : null;
            $stops[$index]['travel_minutes_from_start'] = ! $unavailable && ! $missing ? $duration : null;
            $previous = $stop;
        }

        $incomplete = $unavailable || $missing || (count($stops) < 2 && ! $origin);
        $trafficAvailable = count($legs) > 0 && collect($legs)->every(fn ($leg) => $leg['traffic_available'] ?? false);
        $hasCongestion = collect($legs)->contains(fn ($leg) => collect($leg['traffic_segments'] ?? [])->contains(fn ($segment) => in_array($segment['congestion'], ['moderate', 'heavy', 'severe'], true)));

        return ['navigation' => $navigationDeliveryId !== null ? $this->navigation($rider, $deliveries[$navigationDeliveryId], $origin) : null, 'stores' => array_values($stores), 'return_to_store' => $returnToStore && (bool) $returnStore, 'stops' => $stops, 'legs' => $legs, 'distance_km' => $incomplete ? null : round($distance, 2), 'duration_minutes' => $incomplete ? null : $duration, 'missing_locations' => $missing, 'route_unavailable' => $unavailable, 'starts_at_live_location' => (bool) $origin, 'calculated_at' => $departure->toIso8601String(), 'traffic_available' => $trafficAvailable, 'has_congestion' => $hasCongestion];
    }

    private function navigation(User $rider, Delivery $requested, ?array $origin): array
    {
        $delivery = $requested;
        // Navigation cannot skip an unfinished predecessor in a paired batch.
        if ($requested->batch_key) {
            $delivery = Delivery::with('order')->where('rider_user_id', $rider->id)
                ->where('batch_key', $requested->batch_key)->whereNotIn('status', Delivery::TERMINAL)
                ->where('batch_sequence', '<=', $requested->batch_sequence)->orderBy('batch_sequence')->first() ?? $requested;
        }
        $collected = in_array($delivery->status, ['picked_up', 'in_transit'], true);
        $location = app(DeliveryQuoteService::class)->location();
        $target = $collected
            ? ['kind' => 'dropoff', 'latitude' => $delivery->order->delivery_latitude, 'longitude' => $delivery->order->delivery_longitude, 'address' => $delivery->order->delivery_address]
            : ['kind' => 'pickup', 'latitude' => $delivery->pickup_latitude ?? ($location['latitude'] ?? null), 'longitude' => $delivery->pickup_longitude ?? ($location['longitude'] ?? null), 'address' => $delivery->pickup_address ?? ($location['address'] ?? null)];
        $target += ['delivery_id' => $delivery->id, 'order_numbers' => [$delivery->order->order_number]];
        $result = ['requested_delivery_id' => $requested->id, 'delivery_id' => $delivery->id, 'batch_predecessor' => $delivery->id !== $requested->id, 'target' => $target, 'leg' => null, 'requires_location' => ! $origin, 'route_unavailable' => false];
        if (! $this->point($target['latitude'], $target['longitude'])) {
            return [...$result, 'route_unavailable' => true];
        }
        if (! $origin) {
            return $result;
        }
        try {
            if (abs($origin['latitude'] - $target['latitude']) + abs($origin['longitude'] - $target['longitude']) < 0.00001) {
                $leg = ['distance_km' => 0, 'duration_minutes' => 0, 'geometry' => []];
            } else {
                $points = [(float) $origin['latitude'], (float) $origin['longitude'], (float) $target['latitude'], (float) $target['longitude']];
                $key = 'rider-plan-v2:'.config('services.maps.provider').':'.(int) config('services.maps.traffic_enabled').':'.hash('sha256', json_encode($points));
                $leg = Cache::remember($key, 60, fn () => $this->maps->route(...[...$points, true, true]));
            }
            $result['leg'] = [...$leg, 'stop_index' => 0];
        } catch (\Throwable $exception) {
            report($exception);
            $result['route_unavailable'] = true;
        }

        return $result;
    }

    private function point($lat, $lng): bool
    {
        return is_numeric($lat) && is_numeric($lng) && abs((float) $lat) <= 90 && abs((float) $lng) <= 180;
    }

    private function storeKey($latitude, $longitude): string
    {
        return hash('sha256', sprintf('%.7F,%.7F', (float) $latitude, (float) $longitude));
    }
}
