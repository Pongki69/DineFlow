<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use RuntimeException;

class MapProviderService
{
    public function reverse(float $latitude, float $longitude): array
    {
        if (config('services.maps.provider') === 'geoapify') {
            $response = $this->providerRequest('https://api.geoapify.com/v1/geocode/reverse', [
                'apiKey' => $this->geoapifyKey(), 'lat' => $latitude, 'lon' => $longitude, 'format' => 'json',
            ]);
            $label = $response->json('results.0.formatted');
        } else {
            $this->assertMapbox();
            $token = config('services.maps.token');
            if (! $token) {
                throw new RuntimeException('Automatic address lookup is not configured. Enter the address manually.');
            }
            $response = $this->providerRequest('https://api.mapbox.com/geocoding/v5/mapbox.places/'.$longitude.','.$latitude.'.json', [
                'access_token' => $token,
            ]);
            $label = $response->json('features.0.place_name');
        }
        if (! $response->successful()) {
            throw new RuntimeException('Automatic address lookup is temporarily unavailable. You can enter the address manually.');
        }
        if (! is_string($label) || trim($label) === '') {
            throw new RuntimeException('No address was found for this pin. Enter the address manually.');
        }

        return ['label' => $label, 'latitude' => $latitude, 'longitude' => $longitude];
    }

    public function search(string $query): array
    {
        if (config('services.maps.provider') === 'geoapify') {
            return $this->searchGeoapify($query);
        }
        $this->assertMapbox();
        $token = config('services.maps.token');
        if (! $token) {
            throw new RuntimeException('Address search is not configured. Please enter the address manually or contact the restaurant.');
        }
        $response = $this->providerRequest('https://api.mapbox.com/geocoding/v5/mapbox.places/'.rawurlencode($query).'.json', ['access_token' => $token, 'limit' => 5, 'country' => config('services.maps.country', 'ph')]);
        if (! $response->successful()) {
            throw new RuntimeException('Address search is temporarily unavailable. Please try again or enter the address manually.');
        }

        return collect($response->json('features', []))->map(fn ($feature) => ['label' => $feature['place_name'] ?? '', 'longitude' => $feature['center'][0] ?? null, 'latitude' => $feature['center'][1] ?? null])->filter(fn ($row) => $row['label'] && is_numeric($row['latitude']) && is_numeric($row['longitude']))->values()->all();
    }

    public function route(float $originLat, float $originLng, float $destLat, float $destLng, bool $includeGeometry = false, bool $withTraffic = false): array
    {
        if (config('services.maps.provider') === 'geoapify') {
            if (! config('services.maps.geoapify_key') && app()->environment('local') && config('services.maps.local_osrm_fallback')) {
                return $this->routeLocalOsrm($originLat, $originLng, $destLat, $destLng, $includeGeometry);
            }

            return $this->routeGeoapify($originLat, $originLng, $destLat, $destLng, $includeGeometry);
        }
        $this->assertMapbox();
        $token = config('services.maps.token');
        if (! $token) {
            throw new RuntimeException('Delivery routing is not configured. Please contact the restaurant before placing a delivery order.');
        }
        $traffic = $withTraffic && $includeGeometry && config('services.maps.traffic_enabled', false);
        $base = $traffic ? 'https://api.mapbox.com/directions/v5/mapbox/driving-traffic' : config('services.maps.routing_url', 'https://api.mapbox.com/directions/v5/mapbox/driving');
        $url = rtrim($base, '/').'/'.$originLng.','.$originLat.';'.$destLng.','.$destLat;
        $params = ['access_token' => $token, 'overview' => $includeGeometry ? 'full' : 'false', 'geometries' => 'geojson', 'alternatives' => 'false'];
        if ($traffic) {
            $params['annotations'] = 'congestion';
        }
        $response = $this->providerRequest($url, $params);
        if ($traffic && ! $response->successful()) {
            return $this->route($originLat, $originLng, $destLat, $destLng, $includeGeometry, false);
        }
        $route = $response->json('routes.0');
        if (! $response->successful() || ! is_array($route) || ! isset($route['distance'], $route['duration']) || $route['distance'] <= 0) {
            throw ValidationException::withMessages(['delivery_address' => 'No drivable route is available for this destination. Please choose another delivery address.']);
        }
        $result = ['distance_km' => round($route['distance'] / 1000, 2), 'duration_minutes' => max(1, (int) ceil($route['duration'] / 60)), 'geometry' => $includeGeometry ? ($route['geometry']['coordinates'] ?? null) : null];
        if ($traffic) {
            $coordinates = $result['geometry'] ?? [];
            $levels = collect($route['legs'] ?? [])->flatMap(fn ($leg) => $leg['annotation']['congestion'] ?? [])->values()->all();
            $segments = [];
            if (count($coordinates) === count($levels) + 1) {
                foreach ($levels as $index => $level) {
                    $level = in_array($level, ['low', 'moderate', 'heavy', 'severe'], true) ? $level : 'unknown';
                    $last = count($segments) - 1;
                    if ($last >= 0 && $segments[$last]['congestion'] === $level) {
                        $segments[$last]['geometry'][] = $coordinates[$index + 1];
                    } else {
                        $segments[] = ['congestion' => $level, 'geometry' => [$coordinates[$index], $coordinates[$index + 1]]];
                    }
                }
            }
            $result += ['traffic_segments' => $segments, 'traffic_available' => collect($segments)->contains(fn ($segment) => $segment['congestion'] !== 'unknown'), 'traffic_checked_at' => now()->toIso8601String()];
        }

        return $result;
    }

    public function supportsRouteSequence(): bool
    {
        return app()->environment('local')
            && config('services.maps.provider') === 'geoapify'
            && ! config('services.maps.geoapify_key')
            && config('services.maps.local_osrm_fallback');
    }

    /** Route all preview stops against the local OSRM fallback in one request. */
    public function routeSequence(array $points): array
    {
        if (! $this->supportsRouteSequence()) {
            throw new RuntimeException('Multi-stop local routing is not enabled.');
        }
        if (count($points) < 2 || count($points) > 52) {
            throw new RuntimeException('The local route must contain between 2 and 52 points.');
        }

        $coordinates = collect($points)->map(function ($point) {
            if (! isset($point['latitude'], $point['longitude'])
                || ! is_numeric($point['latitude'])
                || ! is_numeric($point['longitude'])
                || ! is_finite((float) $point['latitude'])
                || ! is_finite((float) $point['longitude'])
                || abs((float) $point['latitude']) > 90
                || abs((float) $point['longitude']) > 180) {
                throw new RuntimeException('A route point has invalid coordinates.');
            }

            return (float) $point['longitude'].','.(float) $point['latitude'];
        })->implode(';');
        $url = rtrim((string) config('services.maps.local_osrm_url'), '/').'/'.$coordinates;
        $params = ['overview' => 'full', 'geometries' => 'geojson', 'steps' => 'true'];
        $response = Cache::lock('local-osrm-demo-request', 10)->block(10, function () use ($url, $params) {
            $lastRequestAt = (float) Cache::get('local-osrm-demo-last-request-at', 0);
            $waitSeconds = 1.1 - (microtime(true) - $lastRequestAt);
            if ($waitSeconds > 0) {
                usleep((int) ceil($waitSeconds * 1_000_000));
            }

            try {
                return $this->providerRequest($url, $params, 20);
            } finally {
                Cache::put('local-osrm-demo-last-request-at', microtime(true), now()->addSeconds(30));
            }
        });

        $route = $response->json('routes.0');
        $routeLegs = data_get($route, 'legs');
        if (! $response->successful()
            || $response->json('code') !== 'Ok'
            || ! is_array($routeLegs)
            || count($routeLegs) !== count($points) - 1) {
            throw new RuntimeException('Local road routing is temporarily unavailable. Straight-line estimates are shown instead.');
        }

        $legs = [];
        foreach ($routeLegs as $leg) {
            if (! is_array($leg) || ! is_numeric($leg['distance'] ?? null) || ! is_numeric($leg['duration'] ?? null)
                || ! is_finite((float) $leg['distance']) || ! is_finite((float) $leg['duration'])
                || $leg['distance'] < 0 || $leg['duration'] < 0) {
                throw new RuntimeException('The road router returned invalid travel information.');
            }
            // Coincident waypoints are valid: OSRM repeats the same coordinate
            // for departure/arrival and reports zero travel. Keep that stop's
            // index without rejecting the remaining road legs or inventing a minute.
            $stationary = (float) $leg['distance'] === 0.0 && (float) $leg['duration'] === 0.0;
            $geometry = [];
            foreach ($leg['steps'] ?? [] as $step) {
                foreach (data_get($step, 'geometry.coordinates', []) as $coordinate) {
                    if (! is_array($coordinate) || count($coordinate) < 2
                        || ! is_numeric($coordinate[0]) || ! is_numeric($coordinate[1])
                        || ! is_finite((float) $coordinate[0]) || ! is_finite((float) $coordinate[1])
                        || abs((float) $coordinate[0]) > 180 || abs((float) $coordinate[1]) > 90) {
                        throw new RuntimeException('The road router returned invalid route geometry.');
                    }
                    $last = $geometry[count($geometry) - 1] ?? null;
                    if ($last !== $coordinate) {
                        $geometry[] = $coordinate;
                    }
                }
            }
            if (! $stationary && count($geometry) < 2) {
                throw new RuntimeException('The road router returned incomplete route geometry.');
            }
            $legs[] = [
                'distance_km' => round(((float) $leg['distance']) / 1000, 2),
                'duration_minutes' => $stationary ? 0 : max(1, (int) ceil(((float) $leg['duration']) / 60)),
                'geometry' => $stationary ? [] : $geometry,
                'traffic_available' => false,
                'provider' => 'osrm-local-fallback',
            ];
        }

        return ['legs' => $legs, 'provider' => 'osrm-local-fallback'];
    }

    private function routeLocalOsrm(float $originLat, float $originLng, float $destLat, float $destLng, bool $includeGeometry): array
    {
        $base = rtrim((string) config('services.maps.local_osrm_url'), '/');
        $url = $base.'/'.$originLng.','.$originLat.';'.$destLng.','.$destLat;
        $params = [
            'overview' => $includeGeometry ? 'full' : 'false',
            'geometries' => 'geojson',
            'steps' => 'false',
        ];

        // The public OSRM demo asks clients to stay at or below one request per
        // second. Serialize local fallback calls so multi-stop previews comply.
        $response = Cache::lock('local-osrm-demo-request', 10)->block(10, function () use ($url, $params) {
            $lastRequestAt = (float) Cache::get('local-osrm-demo-last-request-at', 0);
            $waitSeconds = 1.1 - (microtime(true) - $lastRequestAt);
            if ($waitSeconds > 0) {
                usleep((int) ceil($waitSeconds * 1_000_000));
            }

            try {
                return $this->providerRequest($url, $params, 8);
            } finally {
                Cache::put('local-osrm-demo-last-request-at', microtime(true), now()->addSeconds(30));
            }
        });

        $route = $response->json('routes.0');
        if (! $response->successful() || $response->json('code') !== 'Ok' || ! is_array($route) || ! isset($route['distance'], $route['duration'])) {
            throw new RuntimeException('Local road routing is temporarily unavailable. Straight-line estimates are shown instead.');
        }

        return [
            'distance_km' => round(((float) $route['distance']) / 1000, 2),
            'duration_minutes' => max(1, (int) ceil(((float) $route['duration']) / 60)),
            'geometry' => $includeGeometry ? ($route['geometry']['coordinates'] ?? null) : null,
            'traffic_available' => false,
            'provider' => 'osrm-local-fallback',
        ];
    }

    private function providerRequest(string $url, array $params, int $timeout = 8): Response
    {
        $options = [];
        // Windows PHP/OpenSSL may have no PEM bundle configured. Use the OS
        // trust store while retaining certificate and hostname verification.
        if (PHP_OS_FAMILY === 'Windows' && defined('CURLOPT_SSL_OPTIONS') && defined('CURLSSLOPT_NATIVE_CA')) {
            $options['curl'] = [
                CURLOPT_SSL_OPTIONS => CURLSSLOPT_NATIVE_CA,
                CURLOPT_FORBID_REUSE => true,
            ];
        }

        try {
            return Http::timeout($timeout)
                ->withOptions($options)
                ->get($url, $params);
        } catch (ConnectionException|RequestException) {
            // Provider URLs contain credentials. Never return the transport
            // exception, URL, or previous exception to an API response.
            throw new RuntimeException('The map service could not connect securely. Please try again, or enter the address manually.');
        }
    }

    private function searchGeoapify(string $query): array
    {
        $response = $this->providerRequest('https://api.geoapify.com/v1/geocode/search', [
            'apiKey' => $this->geoapifyKey(), 'text' => $query, 'format' => 'json', 'limit' => 5,
            'filter' => 'countrycode:'.strtolower(config('services.maps.country', 'ph')),
        ]);
        if (! $response->successful()) {
            throw new RuntimeException('Address search is temporarily unavailable or its free quota has been reached. Try again later or place a pin on the map.');
        }

        return collect($response->json('results', []))
            ->map(fn ($place) => ['label' => $place['formatted'] ?? '', 'longitude' => $place['lon'] ?? null, 'latitude' => $place['lat'] ?? null])
            ->filter(fn ($place) => $place['label'] && is_numeric($place['latitude']) && is_numeric($place['longitude']))
            ->values()->all();
    }

    private function routeGeoapify(float $originLat, float $originLng, float $destLat, float $destLng, bool $includeGeometry): array
    {
        $response = $this->providerRequest('https://api.geoapify.com/v1/routing', [
            'apiKey' => $this->geoapifyKey(), 'waypoints' => $originLat.','.$originLng.'|'.$destLat.','.$destLng,
            'mode' => 'drive', 'units' => 'metric',
        ]);
        if (! $response->successful()) {
            throw new RuntimeException('Delivery routing is temporarily unavailable or its free quota has been reached. Please try again later.');
        }
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
        if (! $key) {
            throw new RuntimeException('Address search and delivery routing need a free Geoapify key. Add GEOAPIFY_API_KEY to the backend environment.');
        }

        return $key;
    }

    private function assertMapbox(): void
    {
        if (config('services.maps.provider') !== 'mapbox') {
            throw new RuntimeException('Unsupported map provider. Choose geoapify or mapbox.');
        }
    }
}
