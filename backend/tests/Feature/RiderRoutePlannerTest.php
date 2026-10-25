<?php

use App\Models\Delivery;
use App\Models\Order;
use App\Models\Role;
use App\Models\User;
use App\Services\MapProviderService;
use Database\Seeders\AuthSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->seed(AuthSeeder::class);
    Cache::flush();
    $this->rider = User::create(['name' => 'Route Rider', 'email' => 'route@example.test', 'password' => 'Test-Route-123!', 'is_active' => true]);
    $this->rider->roles()->attach(Role::where('slug', 'rider')->firstOrFail());
    $this->maps = Mockery::mock(MapProviderService::class);
    $this->app->instance(MapProviderService::class, $this->maps);
    $this->makeDelivery = function ($status = 'accepted', $extra = []) {
        $order = Order::create(['order_number' => 'ROUTE'.uniqid(), 'customer_name_snapshot' => 'Recipient', 'order_type' => 'delivery', 'status' => 'preparing', 'total' => 100, 'subtotal' => 100, 'currency' => 'PHP', 'delivery_address' => 'Drop-off', 'delivery_latitude' => 14.2, 'delivery_longitude' => 121.25]);
        return Delivery::create($extra + ['order_id' => $order->id, 'rider_user_id' => $this->rider->id, 'status' => $status, 'pickup_latitude' => 14.18, 'pickup_longitude' => 121.23, 'pickup_address' => 'Restaurant']);
    };
});

it('builds pickup-first road legs with a live origin and caches repeated legs', function () {
    $this->travelTo(\Illuminate\Support\Carbon::parse('2026-10-24T04:00:00Z'));
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
    $key = (string) Illuminate\Support\Str::uuid();
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
    $this->maps->shouldReceive('route')->twice()->andReturn(['distance_km'=>2,'duration_minutes'=>5,'geometry'=>[[121.23,14.18],[121.25,14.2]]]);
    $this->actingAs($this->rider)->postJson('/api/v1/rider/route-plan', ['delivery_ids'=>[$delivery->id], 'origin'=>['latitude'=>14.17,'longitude'=>121.22], 'return_to_store'=>true])->assertOk()
        ->assertJsonCount(1,'data.stores')->assertJsonPath('data.stores.0.address','Restaurant')
        ->assertJsonPath('data.stops.0.kind','dropoff')->assertJsonPath('data.stops.1.kind','return')->assertJsonPath('data.return_to_store',true);
});

it('routes back to the riders original pickup store when all deliveries are finished', function () {
    ($this->makeDelivery)('delivered');
    $this->maps->shouldReceive('route')->once()->andReturn(['distance_km'=>2,'duration_minutes'=>5,'geometry'=>[]]);
    $this->actingAs($this->rider)->postJson('/api/v1/rider/route-plan', ['delivery_ids'=>[], 'origin'=>['latitude'=>14.2,'longitude'=>121.25], 'return_to_store'=>true])->assertOk()
        ->assertJsonCount(1,'data.stores')->assertJsonCount(1,'data.stops')->assertJsonPath('data.stops.0.kind','return')->assertJsonPath('data.stops.0.latitude',14.18)->assertJsonPath('data.duration_minutes',5);
    $this->postJson('/api/v1/rider/route-plan', ['delivery_ids'=>[], 'return_to_store'=>true,'return_store_key'=>'unrelated-store'])->assertUnprocessable();
});
