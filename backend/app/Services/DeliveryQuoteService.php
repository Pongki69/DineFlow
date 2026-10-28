<?php

namespace App\Services;

use App\Models\RestaurantSetting;
use Illuminate\Validation\ValidationException;

class DeliveryQuoteService
{
    public function __construct(private MapProviderService $maps) {}

    public function location(): array
    {
        return RestaurantSetting::where('key', 'restaurant_location')->first()?->value ?? [];
    }

    public function policy(): array
    {
        return RestaurantSetting::where('key', 'delivery_policy')->first()?->value ?? ['radius_km' => 8, 'minimum_order' => 0, 'base_fee' => 40, 'per_km_fee' => 5, 'free_delivery_over' => null, 'operating_hours' => []];
    }

    public function quote(float $latitude, float $longitude, int $subtotalCents): array
    {
        $location = $this->location(); $policy = $this->policy();
        if (($location['is_active'] ?? true) === false) throw ValidationException::withMessages(['delivery_address' => 'This restaurant is currently offline for delivery. Please choose pickup or try again later.']);
        $this->assertOpen($location['opening_hours'] ?? []);
        if (! isset($location['latitude'], $location['longitude'])) throw ValidationException::withMessages(['delivery_address' => 'The restaurant delivery location has not been configured.']);
        $straightKm = $this->haversine((float) $location['latitude'], (float) $location['longitude'], $latitude, $longitude);
        if ($straightKm > (float) ($policy['radius_km'] ?? 8)) throw ValidationException::withMessages(['delivery_address' => 'This address is outside the restaurant delivery area.']);
        $this->assertOpen($policy['operating_hours'] ?? []);
        try { $route = $this->maps->route((float) $location['latitude'], (float) $location['longitude'], $latitude, $longitude); }
        catch (\RuntimeException $exception) { throw ValidationException::withMessages(['delivery_address' => $exception->getMessage()]); }
        return $this->priceRoute($route, $subtotalCents, $policy);
    }

    public function priceRoute(array $route, int $subtotalCents, ?array $policy = null): array
    {
        $policy ??= $this->policy();
        $minimum = (int) round(((float) ($policy['minimum_order'] ?? 0)) * 100);
        $base = (int) round(((float) ($policy['base_fee'] ?? 0)) * 100);
        $perKm = (int) round(((float) ($policy['per_km_fee'] ?? 0)) * 100);
        $freeOver = isset($policy['free_delivery_over']) && $policy['free_delivery_over'] !== '' ? (int) round(((float) $policy['free_delivery_over']) * 100) : null;
        $fee = $freeOver !== null && $subtotalCents >= $freeOver ? 0 : $base + (int) round($route['distance_km'] * $perKm);
        return $route + ['delivery_fee' => number_format($fee / 100, 2, '.', ''), 'minimum_order' => number_format($minimum / 100, 2, '.', ''), 'minimum_remaining' => number_format(max(0, $minimum - $subtotalCents) / 100, 2, '.', ''), 'meets_minimum' => $subtotalCents >= $minimum, 'within_coverage' => true, 'free_delivery_over' => $freeOver === null ? null : number_format($freeOver / 100, 2, '.', '')];
    }

    private function assertOpen(array $hours): void
    {
        $profile = RestaurantSetting::where('key', 'business_profile')->value('value') ?? [];
        $timezone = $profile['timezone'] ?? config('restaurant.timezone', 'Asia/Manila');
        $day = strtolower(now($timezone)->format('l'));
        $window = $hours[$day] ?? null;
        if (is_array($window) && ! empty($window['closed'])) throw ValidationException::withMessages(['delivery_address' => 'Delivery is closed today. Please choose pickup or try another day.']);
        if (! is_array($window) || empty($window['open']) || empty($window['close'])) return;
        $now = now($timezone)->format('H:i');
        $open = $window['open']; $close = $window['close'];
        $isOpen = $close <= $open ? ($now >= $open || $now <= $close) : ($now >= $open && $now <= $close);
        if (! $isOpen) throw ValidationException::withMessages(['delivery_address' => 'Delivery is currently outside operating hours. Please choose pickup or try during delivery hours.']);
    }

    private function haversine(float $a, float $b, float $c, float $d): float
    {
        $r = 6371; $lat = deg2rad($c - $a); $lng = deg2rad($d - $b);
        $x = sin($lat / 2) ** 2 + cos(deg2rad($a)) * cos(deg2rad($c)) * sin($lng / 2) ** 2;
        return $r * 2 * atan2(sqrt($x), sqrt(1 - $x));
    }
}
