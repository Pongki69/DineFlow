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
