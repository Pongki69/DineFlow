<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use RuntimeException;

class MapProviderService
{
    public function search(string $query): array
    {
        if (config('services.maps.provider') === 'geoapify') return $this->searchGeoapify($query);
        $this->assertMapbox();
        $token = config('services.maps.token');
        if (! $token) throw new RuntimeException('Address search is not configured. Please enter the address manually or contact the restaurant.');
        $response = Http::timeout(8)->get('https://api.mapbox.com/geocoding/v5/mapbox.places/'.rawurlencode($query).'.json', ['access_token' => $token, 'limit' => 5, 'country' => config('services.maps.country', 'ph')]);
        if (! $response->successful()) throw new RuntimeException('Address search is temporarily unavailable. Please try again or enter the address manually.');
        return collect($response->json('features', []))->map(fn ($feature) => ['label' => $feature['place_name'] ?? '', 'longitude' => $feature['center'][0] ?? null, 'latitude' => $feature['center'][1] ?? null])->filter(fn ($row) => $row['label'] && is_numeric($row['latitude']) && is_numeric($row['longitude']))->values()->all();
    }

    public function route(float $originLat, float $originLng, float $destLat, float $destLng, bool $includeGeometry = false): array
    {
        if (config('services.maps.provider') === 'geoapify') return $this->routeGeoapify($originLat, $originLng, $destLat, $destLng, $includeGeometry);
        $this->assertMapbox();
        $token = config('services.maps.token');
        if (! $token) throw new RuntimeException('Delivery routing is not configured. Please contact the restaurant before placing a delivery order.');
        $url = rtrim(config('services.maps.routing_url', 'https://api.mapbox.com/directions/v5/mapbox/driving'), '/').'/'.$originLng.','.$originLat.';'.$destLng.','.$destLat;
        $response = Http::timeout(8)->get($url, ['access_token' => $token, 'overview' => $includeGeometry ? 'full' : 'false', 'geometries' => 'geojson', 'alternatives' => 'false']);
        $route = $response->json('routes.0');
        if (! $response->successful() || ! is_array($route) || ! isset($route['distance'], $route['duration']) || $route['distance'] <= 0) {
            throw ValidationException::withMessages(['delivery_address' => 'No drivable route is available for this destination. Please choose another delivery address.']);
        }
        return ['distance_km' => round($route['distance'] / 1000, 2), 'duration_minutes' => max(1, (int) ceil($route['duration'] / 60)), 'geometry' => $includeGeometry ? ($route['geometry']['coordinates'] ?? null) : null];
    }

    private function searchGeoapify(string $query): array
    {
        $response = Http::timeout(8)->get('https://api.geoapify.com/v1/geocode/search', [
            'apiKey' => $this->geoapifyKey(), 'text' => $query, 'format' => 'json', 'limit' => 5,
            'filter' => 'countrycode:'.strtolower(config('services.maps.country', 'ph')),
        ]);
        if (! $response->successful()) throw new RuntimeException('Address search is temporarily unavailable or its free quota has been reached. Try again later or place a pin on the map.');

        return collect($response->json('results', []))
            ->map(fn ($place) => ['label' => $place['formatted'] ?? '', 'longitude' => $place['lon'] ?? null, 'latitude' => $place['lat'] ?? null])
            ->filter(fn ($place) => $place['label'] && is_numeric($place['latitude']) && is_numeric($place['longitude']))
            ->values()->all();
    }

    private function routeGeoapify(float $originLat, float $originLng, float $destLat, float $destLng, bool $includeGeometry): array
    {
        $response = Http::timeout(8)->get('https://api.geoapify.com/v1/routing', [
            'apiKey' => $this->geoapifyKey(), 'waypoints' => $originLat.','.$originLng.'|'.$destLat.','.$destLng,
            'mode' => 'drive', 'units' => 'metric',
        ]);
        if (! $response->successful()) throw new RuntimeException('Delivery routing is temporarily unavailable or its free quota has been reached. Please try again later.');
        $feature = $response->json('features.0');
        $distance = data_get($feature, 'properties.distance');
        $seconds = data_get($feature, 'properties.time');
        if (! is_numeric($distance) || $distance <= 0 || ! is_numeric($seconds) || $seconds < 0) {
            throw ValidationException::withMessages(['delivery_address' => 'No drivable route is available for this destination. Please choose another delivery address.']);
        }

        $geometry = null;
        if ($includeGeometry) {
            $coordinates = data_get($feature, 'geometry.coordinates', []);
            $geometry = data_get($feature, 'geometry.type') === 'MultiLineString'
                ? collect($coordinates)->flatMap(fn ($line) => $line)->values()->all()
                : $coordinates;
        }

        return ['distance_km' => round($distance / 1000, 2), 'duration_minutes' => max(1, (int) ceil($seconds / 60)), 'geometry' => $geometry];
    }

    private function geoapifyKey(): string
    {
        $key = config('services.maps.geoapify_key');
        if (! $key) throw new RuntimeException('Address search and delivery routing need a free Geoapify key. Add GEOAPIFY_API_KEY to the backend environment.');
        return $key;
    }

    private function assertMapbox(): void
    {
        if (config('services.maps.provider') !== 'mapbox') throw new RuntimeException('Unsupported map provider. Choose geoapify or mapbox.');
    }
}
