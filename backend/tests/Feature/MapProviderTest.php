<?php

use App\Services\MapProviderService;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;

beforeEach(function () {
    config(['services.maps.provider' => 'geoapify', 'services.maps.geoapify_key' => 'test-key', 'services.maps.country' => 'ph']);
    Http::preventStrayRequests();
});

it('normalizes Geoapify addresses and filters invalid coordinates', function () {
    Http::fake(['api.geoapify.com/v1/geocode/search*' => Http::response(['results' => [
        ['formatted' => 'Manila, Philippines', 'lat' => 14.6, 'lon' => 120.98],
        ['formatted' => 'Incomplete place'],
    ]])]);

    expect(app(MapProviderService::class)->search('Manila'))->toBe([
        ['label' => 'Manila, Philippines', 'longitude' => 120.98, 'latitude' => 14.6],
    ]);
    Http::assertSent(fn ($request) => $request['filter'] === 'countrycode:ph' && $request['apiKey'] === 'test-key');
});

it('finds the address for a restaurant pin without changing the chosen coordinates', function () {
    Http::fake(['api.geoapify.com/v1/geocode/reverse*' => Http::response(['results' => [
        ['formatted' => 'Los Banos, Laguna, Philippines', 'lat' => 14.18, 'lon' => 121.23],
    ]])]);
    expect(app(MapProviderService::class)->reverse(14.187373, 121.232108))->toBe([
        'label' => 'Los Banos, Laguna, Philippines', 'latitude' => 14.187373, 'longitude' => 121.232108,
    ]);
    Http::assertSent(fn ($request) => $request['lat'] === 14.187373 && $request['lon'] === 121.232108 && $request['format'] === 'json');
});

it('supports reverse lookup with the selected Mapbox provider', function () {
    config(['services.maps.provider' => 'mapbox', 'services.maps.token' => 'test-token']);
    Http::fake(['api.mapbox.com/geocoding/*' => Http::response(['features' => [['place_name' => 'Manila, Philippines']]])]);
    expect(app(MapProviderService::class)->reverse(14.6, 120.98)['label'])->toBe('Manila, Philippines');
    Http::assertSent(fn ($request) => str_contains($request->url(), '/120.98,14.6.json'));
});

it('reports unavailable reverse lookup and empty results for manual address entry', function () {
    Http::fake(['api.geoapify.com/v1/geocode/reverse*' => Http::sequence()->push([], 429)->push(['results' => []])]);
    expect(fn () => app(MapProviderService::class)->reverse(14.6, 120.98))->toThrow(RuntimeException::class, 'temporarily unavailable');
    expect(fn () => app(MapProviderService::class)->reverse(14.6, 120.98))->toThrow(RuntimeException::class, 'No address');
});

it('converts road distance time and multiline geometry for delivery tracking', function () {
    $line = [[120.98, 14.6], [120.99, 14.61]];
    Http::fake(['api.geoapify.com/v1/routing*' => Http::response(['features' => [[
        'properties' => ['distance' => 3456, 'time' => 301],
        'geometry' => ['type' => 'MultiLineString', 'coordinates' => [$line]],
    ]]])]);

    $maps = app(MapProviderService::class);
    expect($maps->route(14.6, 120.98, 14.61, 120.99, true))->toBe([
        'distance_km' => 3.46, 'duration_minutes' => 6, 'geometry' => $line,
    ]);
    expect($maps->route(14.6, 120.98, 14.61, 120.99)['geometry'])->toBeNull();
    Http::assertSent(fn ($request) => $request['waypoints'] === '14.6,120.98|14.61,120.99' && $request['units'] === 'metric');
});

it('reports quota exhaustion without manufacturing a route', function () {
    Http::fake(['api.geoapify.com/v1/routing*' => Http::response([], 429)]);
    expect(fn () => app(MapProviderService::class)->route(14.6, 120.98, 14.61, 120.99))
        ->toThrow(RuntimeException::class, 'free quota');

});

it('rejects a successful response that contains no drivable route', function () {
    Http::fake(['api.geoapify.com/v1/routing*' => Http::response(['features' => []])]);
    expect(fn () => app(MapProviderService::class)->route(14.6, 120.98, 14.61, 120.99))
        ->toThrow(ValidationException::class);
});

it('makes no external request without a configured key', function () {
    Http::fake();
    config(['services.maps.geoapify_key' => null]);
    expect(fn () => app(MapProviderService::class)->search('Manila'))->toThrow(RuntimeException::class, 'GEOAPIFY_API_KEY');
    Http::assertNothingSent();
});

it('preserves the explicitly selected Mapbox provider', function () {
    config(['services.maps.provider' => 'mapbox', 'services.maps.token' => 'mapbox-test']);
    Http::fake(['api.mapbox.com/geocoding/*' => Http::response(['features' => [
        ['place_name' => 'Manila', 'center' => [120.98, 14.6]],
    ]])]);
    expect(app(MapProviderService::class)->search('Manila'))->toBe([
        ['label' => 'Manila', 'longitude' => 120.98, 'latitude' => 14.6],
    ]);
});

it('uses traffic annotations only when enabled and maps them to the correct road segments', function () {
    config(['services.maps.provider' => 'mapbox', 'services.maps.token' => 'test-token', 'services.maps.traffic_enabled' => true]);
    Http::fake(['api.mapbox.com/directions/*' => Http::response(['routes' => [[
        'distance' => 3000, 'duration' => 720,
        'geometry' => ['coordinates' => [[121.1,14.1],[121.2,14.2],[121.3,14.3],[121.4,14.4]]],
        'legs' => [['annotation' => ['congestion' => ['low','heavy','heavy']]]],
    ]]])]);
    $route = app(MapProviderService::class)->route(14.1,121.1,14.4,121.4,true,true);
    expect($route['traffic_available'])->toBeTrue();
    expect($route['traffic_segments'])->toHaveCount(2);
    expect($route['traffic_segments'][1])->toBe(['congestion' => 'heavy', 'geometry' => [[121.2,14.2],[121.3,14.3],[121.4,14.4]]]);
    Http::assertSent(fn ($request) => str_contains($request->url(), '/driving-traffic/') && $request['annotations'] === 'congestion');
});

it('does not invent congestion when the traffic annotation length does not match the route', function () {
    config(['services.maps.provider' => 'mapbox', 'services.maps.token' => 'test-token', 'services.maps.traffic_enabled' => true]);
    Http::fake(['api.mapbox.com/directions/*' => Http::response(['routes' => [[
        'distance' => 1000, 'duration' => 120, 'geometry' => ['coordinates' => [[121.1,14.1],[121.2,14.2]]],
        'legs' => [['annotation' => ['congestion' => ['heavy','heavy']]]],
    ]]])]);
    $route = app(MapProviderService::class)->route(14.1,121.1,14.2,121.2,true,true);
    expect($route['traffic_available'])->toBeFalse();
    expect($route['traffic_segments'])->toBe([]);
});

it('keeps a regular route when traffic routing is unavailable', function () {
    config(['services.maps.provider' => 'mapbox', 'services.maps.token' => 'test-token', 'services.maps.traffic_enabled' => true]);
    Http::fake([
        'api.mapbox.com/directions/v5/mapbox/driving-traffic/*' => Http::response([],403),
        'api.mapbox.com/directions/v5/mapbox/driving/*' => Http::response(['routes' => [['distance'=>1000,'duration'=>120,'geometry'=>['coordinates'=>[[121.1,14.1],[121.2,14.2]]]]]]),
    ]);
    $route = app(MapProviderService::class)->route(14.1,121.1,14.2,121.2,true,true);
    expect($route['duration_minutes'])->toBe(2);
    expect($route['traffic_available'] ?? false)->toBeFalse();
});
