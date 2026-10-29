<?php

use App\Models\Delivery;
use App\Models\Order;
use App\Models\RestaurantSetting;
use App\Models\Role;
use App\Models\User;
use App\Services\MapProviderService;
use Database\Seeders\AuthSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

it('navigates directly from the rider to a collected customer while other pickups remain pending', function () {
    $pending = ($this->makeDelivery)();
    $collected = ($this->makeDelivery)('in_transit');
    $collected->order->update(['delivery_latitude' => 14.24, 'delivery_longitude' => 121.29]);
    $this->maps->shouldReceive('route')->andReturnUsing(fn ($a, $b, $c, $d) => ['distance_km' => 2, 'duration_minutes' => 5, 'geometry' => [[$b, $a], [$d, $c]]]);
    $this->actingAs($this->rider)->postJson('/api/v1/rider/route-plan', [
        'delivery_ids' => [$pending->id, $collected->id], 'navigation_delivery_id' => $collected->id,
        'origin' => ['latitude' => 14.17, 'longitude' => 121.22],
    ])->assertOk()->assertJsonPath('data.stops.0.kind', 'pickup')
        ->assertJsonPath('data.navigation.target.kind', 'dropoff')
        ->assertJsonPath('data.navigation.delivery_id', $collected->id)
        ->assertJsonPath('data.navigation.leg.geometry.0', [121.22, 14.17])
        ->assertJsonPath('data.navigation.leg.geometry.1', [121.29, 14.24]);
});

it('switches rider navigation from pickup to customer after collection and requires an actual origin', function () {
    $delivery = ($this->makeDelivery)();
    $this->maps->shouldReceive('route')->andReturnUsing(fn ($a, $b, $c, $d) => ['distance_km' => 2, 'duration_minutes' => 5, 'geometry' => [[$b, $a], [$d, $c]]]);
    $payload = ['delivery_ids' => [$delivery->id], 'navigation_delivery_id' => $delivery->id, 'origin' => ['latitude' => 14.17, 'longitude' => 121.22]];
    $this->actingAs($this->rider)->postJson('/api/v1/rider/route-plan', $payload)->assertOk()
        ->assertJsonPath('data.navigation.target.kind', 'pickup')->assertJsonPath('data.navigation.leg.geometry.1', [121.23, 14.18]);
    $delivery->update(['status' => 'picked_up']);
    $this->postJson('/api/v1/rider/route-plan', $payload)->assertOk()
        ->assertJsonPath('data.navigation.target.kind', 'dropoff')->assertJsonPath('data.navigation.leg.geometry.1', [121.25, 14.2]);
    unset($payload['origin']);
    $this->postJson('/api/v1/rider/route-plan', $payload)->assertOk()
        ->assertJsonPath('data.navigation.requires_location', true)->assertJsonPath('data.navigation.leg', null);
});

it('rejects navigation outside the owned requested assignments and preserves paired stop order', function () {
    $key = (string) Str::uuid();
    $first = ($this->makeDelivery)('in_transit', ['batch_key' => $key, 'batch_sequence' => 1]);
    $second = ($this->makeDelivery)('in_transit', ['batch_key' => $key, 'batch_sequence' => 2]);
    $this->actingAs($this->rider)->postJson('/api/v1/rider/route-plan', [
        'delivery_ids' => [$first->id], 'navigation_delivery_id' => $second->id,
    ])->assertNotFound();
    $this->maps->shouldReceive('route')->andReturn(['distance_km' => 2, 'duration_minutes' => 5, 'geometry' => []]);
    $payload = ['delivery_ids' => [$first->id, $second->id], 'navigation_delivery_id' => $second->id, 'origin' => ['latitude' => 14.17, 'longitude' => 121.22]];
    $this->postJson('/api/v1/rider/route-plan', $payload)->assertOk()
        ->assertJsonPath('data.navigation.batch_predecessor', true)->assertJsonPath('data.navigation.delivery_id', $first->id);
    $first->update(['status' => 'delivered']);
    $payload['delivery_ids'] = [$second->id];
    $this->postJson('/api/v1/rider/route-plan', $payload)->assertOk()
        ->assertJsonPath('data.navigation.batch_predecessor', false)->assertJsonPath('data.navigation.delivery_id', $second->id);
});

beforeEach(function () {
    $this->seed(AuthSeeder::class);
    Cache::flush();
    $this->rider = User::create(['name' => 'Route Rider', 'email' => 'route@example.test', 'password' => 'Test-Route-123!', 'is_active' => true]);
    $this->rider->roles()->attach(Role::where('slug', 'rider')->firstOrFail());
    $this->maps = Mockery::mock(MapProviderService::class);
    $this->maps->shouldReceive('supportsRouteSequence')->andReturn(false)->byDefault();
    $this->app->instance(MapProviderService::class, $this->maps);
    $this->makeDelivery = function ($status = 'accepted', $extra = []) {
        $order = Order::create(['order_number' => 'ROUTE'.uniqid(), 'customer_name_snapshot' => 'Recipient', 'order_type' => 'delivery', 'status' => 'preparing', 'total' => 100, 'subtotal' => 100, 'currency' => 'PHP', 'delivery_address' => 'Drop-off', 'delivery_latitude' => 14.2, 'delivery_longitude' => 121.25]);

        return Delivery::create($extra + ['order_id' => $order->id, 'rider_user_id' => $this->rider->id, 'status' => $status, 'pickup_latitude' => 14.18, 'pickup_longitude' => 121.23, 'pickup_address' => 'Restaurant']);
    };
});

it('builds pickup-first road legs with a live origin and caches repeated legs', function () {
    $this->travelTo(Carbon::parse('2026-10-24T04:00:00Z'));
    $first = ($this->makeDelivery)();
    $second = ($this->makeDelivery)();
    $second->order->update(['delivery_latitude' => 14.22]);
    $this->maps->shouldReceive('route')->times(3)->andReturn(['distance_km' => 2, 'duration_minutes' => 5, 'geometry' => [[121.23, 14.18], [121.25, 14.2]]]);
    $payload = ['delivery_ids' => [$second->id, $first->id], 'origin' => ['latitude' => 14.17, 'longitude' => 121.22]];
    $this->actingAs($this->rider)->postJson('/api/v1/rider/route-plan', $payload)->assertOk()
        ->assertJsonCount(3, 'data.stops')->assertJsonCount(3, 'data.legs')
        ->assertJsonPath('data.stops.0.kind', 'pickup')->assertJsonCount(2, 'data.stops.0.order_numbers')
        ->assertJsonPath('data.stops.1.delivery_id', $second->id)->assertJsonPath('data.distance_km', 6)
        ->assertJsonPath('data.duration_minutes', 15)->assertJsonPath('data.starts_at_live_location', true)
        ->assertJsonPath('data.stops.0.eta_at', now()->addMinutes(5)->toIso8601String())
        ->assertJsonPath('data.stops.2.eta_at', now()->addMinutes(15)->toIso8601String())
        ->assertJsonPath('data.traffic_available', false);
    $this->postJson('/api/v1/rider/route-plan', $payload)->assertOk();
});

it('rejects other riders deliveries, completed work, duplicate ids and invalid coordinates', function () {
    $delivery = ($this->makeDelivery)();
    $done = ($this->makeDelivery)('delivered');
    $other = User::create(['name' => 'Other', 'email' => 'other-route@example.test', 'password' => 'Test-Route-123!']);
    $foreign = ($this->makeDelivery)('accepted', ['rider_user_id' => $other->id]);
    $this->actingAs($this->rider)->postJson('/api/v1/rider/route-plan', ['delivery_ids' => [$foreign->id]])->assertNotFound();
    $this->postJson('/api/v1/rider/route-plan', ['delivery_ids' => [$done->id]])->assertNotFound();
    $this->postJson('/api/v1/rider/route-plan', ['delivery_ids' => [$delivery->id, $delivery->id]])->assertUnprocessable();
    $this->postJson('/api/v1/rider/route-plan', ['delivery_ids' => [$delivery->id], 'origin' => ['latitude' => 99, 'longitude' => 121]])->assertUnprocessable();
    $this->actingAs($other)->postJson('/api/v1/rider/route-plan', ['delivery_ids' => [$delivery->id]])->assertForbidden();
});

it('keeps paired drop-offs in sequence and skips pickups already collected', function () {
    $key = (string) Str::uuid();
    $first = ($this->makeDelivery)('in_transit', ['batch_key' => $key, 'batch_sequence' => 1]);
    $second = ($this->makeDelivery)('in_transit', ['batch_key' => $key, 'batch_sequence' => 2]);
    $second->order->update(['delivery_latitude' => 14.22]);
    $this->actingAs($this->rider)->postJson('/api/v1/rider/route-plan', ['delivery_ids' => [$second->id, $first->id]])->assertUnprocessable();
    $this->maps->shouldReceive('route')->once()->andReturn(['distance_km' => 1, 'duration_minutes' => 3, 'geometry' => []]);
    $this->postJson('/api/v1/rider/route-plan', ['delivery_ids' => [$first->id, $second->id]])->assertOk()->assertJsonCount(2, 'data.stops')->assertJsonPath('data.stops.0.kind', 'dropoff')->assertJsonPath('data.starts_at_live_location', false)->assertJsonPath('data.stops.1.eta_at', null)->assertJsonPath('data.stops.1.travel_minutes_from_start', 3);
});

it('keeps pins available without inventing a road route when routing fails or pins are missing', function () {
    $delivery = ($this->makeDelivery)();
    $this->maps->shouldReceive('route')->once()->andThrow(new RuntimeException('Provider unavailable'));
    $this->actingAs($this->rider)->postJson('/api/v1/rider/route-plan', ['delivery_ids' => [$delivery->id]])->assertOk()->assertJsonCount(2, 'data.stops')->assertJsonPath('data.route_unavailable', true)->assertJsonPath('data.distance_km', null);
    $delivery->order->update(['delivery_latitude' => null]);
    $this->postJson('/api/v1/rider/route-plan', ['delivery_ids' => [$delivery->id]])->assertOk()->assertJsonCount(1, 'data.stops')->assertJsonCount(1, 'data.missing_locations')->assertJsonPath('data.duration_minutes', null);
});

it('keeps the original store visible after pickup and appends an optional return leg', function () {
    $delivery = ($this->makeDelivery)('in_transit');
    $this->maps->shouldReceive('route')->twice()->andReturn(['distance_km' => 2, 'duration_minutes' => 5, 'geometry' => [[121.23, 14.18], [121.25, 14.2]]]);
    $this->actingAs($this->rider)->postJson('/api/v1/rider/route-plan', ['delivery_ids' => [$delivery->id], 'origin' => ['latitude' => 14.17, 'longitude' => 121.22], 'return_to_store' => true])->assertOk()
        ->assertJsonCount(1, 'data.stores')->assertJsonPath('data.stores.0.address', 'Restaurant')
        ->assertJsonPath('data.stops.0.kind', 'dropoff')->assertJsonPath('data.stops.1.kind', 'return')->assertJsonPath('data.return_to_store', true);
});

it('routes back to the riders original pickup store when all deliveries are finished', function () {
    ($this->makeDelivery)('delivered');
    $this->maps->shouldReceive('route')->once()->andReturn(['distance_km' => 2, 'duration_minutes' => 5, 'geometry' => []]);
    $this->actingAs($this->rider)->postJson('/api/v1/rider/route-plan', ['delivery_ids' => [], 'origin' => ['latitude' => 14.2, 'longitude' => 121.25], 'return_to_store' => true])->assertOk()
        ->assertJsonCount(1, 'data.stores')->assertJsonCount(1, 'data.stops')->assertJsonPath('data.stops.0.kind', 'return')->assertJsonPath('data.stops.0.latitude', 14.18)->assertJsonPath('data.duration_minutes', 5);
    $this->postJson('/api/v1/rider/route-plan', ['delivery_ids' => [], 'return_to_store' => true, 'return_store_key' => 'unrelated-store'])->assertUnprocessable();
});

it('links the saved outlet as the default return destination while preserving delivery pickup snapshots', function () {
    RestaurantSetting::create(['key' => 'restaurant_location', 'value' => ['name' => 'Current Bay outlet', 'address' => 'New pickup entrance', 'latitude' => 14.190892, 'longitude' => 121.2811701]]);
    $delivery = ($this->makeDelivery)();
    $this->maps->shouldReceive('route')->twice()->andReturn(['distance_km' => 2, 'duration_minutes' => 5, 'geometry' => []]);
    $response = $this->actingAs($this->rider)->postJson('/api/v1/rider/route-plan', ['delivery_ids' => [$delivery->id], 'return_to_store' => true])->assertOk();
    $response->assertJsonPath('data.stores.0.name', 'Current Bay outlet')
        ->assertJsonPath('data.stores.0.is_primary', true)
        ->assertJsonPath('data.stops.0.latitude', 14.18)
        ->assertJsonPath('data.stops.0.address', 'Restaurant')
        ->assertJsonPath('data.stops.2.kind', 'return')
        ->assertJsonPath('data.stops.2.latitude', 14.190892)
        ->assertJsonPath('data.stops.2.longitude', 121.2811701);
    expect((float) $delivery->fresh()->pickup_latitude)->toBe(14.18);
    expect($delivery->fresh()->pickup_address)->toBe('Restaurant');
});

it('keeps a single current outlet marker for matching pickup coordinates and uses it after deliveries finish', function () {
    RestaurantSetting::create(['key' => 'restaurant_location', 'value' => ['name' => 'Current outlet', 'address' => 'Current entrance', 'latitude' => 14.18, 'longitude' => 121.23]]);
    $delivery = ($this->makeDelivery)('in_transit');
    $this->actingAs($this->rider)->postJson('/api/v1/rider/route-plan', ['delivery_ids' => [$delivery->id]])->assertOk()
        ->assertJsonCount(1, 'data.stores')->assertJsonPath('data.stores.0.is_primary', true);
    $delivery->update(['status' => 'delivered']);
    $this->postJson('/api/v1/rider/route-plan', ['delivery_ids' => [], 'return_to_store' => true])->assertOk()
        ->assertJsonCount(1, 'data.stores')->assertJsonPath('data.stops.0.address', 'Current entrance');
});

it('preserves stop indexes and zero-minute pickup ETAs when the rider is already at the store', function () {
    $delivery = ($this->makeDelivery)();
    $this->maps->shouldReceive('supportsRouteSequence')->andReturn(true);
    $this->maps->shouldReceive('routeSequence')->once()->andReturn(['legs' => [
        ['distance_km' => 0, 'duration_minutes' => 0, 'geometry' => []],
        ['distance_km' => 1.5, 'duration_minutes' => 4, 'geometry' => [[121.23, 14.18], [121.24, 14.19], [121.25, 14.2]]],
    ]]);
    $this->maps->shouldNotReceive('route');
    $this->actingAs($this->rider)->postJson('/api/v1/rider/route-plan', [
        'delivery_ids' => [$delivery->id], 'origin' => ['latitude' => 14.18, 'longitude' => 121.23],
    ])->assertOk()->assertJsonPath('data.route_unavailable', false)
        ->assertJsonCount(2, 'data.legs')->assertJsonPath('data.legs.0.stop_index', 0)
        ->assertJsonPath('data.legs.0.duration_minutes', 0)->assertJsonPath('data.stops.0.travel_minutes_from_start', 0)
        ->assertJsonPath('data.legs.1.stop_index', 1)->assertJsonCount(3, 'data.legs.1.geometry')
        ->assertJsonPath('data.distance_km', 1.5)->assertJsonPath('data.duration_minutes', 4);
});
