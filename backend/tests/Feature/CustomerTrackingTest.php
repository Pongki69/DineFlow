<?php

use App\Events\DeliveryTrackingUpdated;
use App\Models\Delivery;
use App\Models\Order;
use App\Models\RiderProfile;
use App\Models\Role;
use App\Models\User;
use App\Services\DeliveryService;
use App\Services\MapProviderService;
use Database\Seeders\AuthSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

function trackingUser(string $role): User
{
    $user = User::create(['name' => 'Tracking '.$role, 'email' => uniqid().'@example.test', 'password' => 'Tracking-Test-Password-123!', 'is_active' => true]);
    $user->roles()->attach(Role::where('slug', $role)->firstOrFail());

    return $user;
}

beforeEach(function () {
    $this->seed(AuthSeeder::class);
    $this->owner = trackingUser('customer');
    $this->rider = trackingUser('rider');
    $this->order = Order::create(['order_number' => 'TRACK'.uniqid(), 'customer_id' => $this->owner->id, 'customer_name_snapshot' => $this->owner->name, 'order_type' => 'delivery', 'status' => 'pending', 'total' => 100, 'subtotal' => 100, 'currency' => 'PHP', 'delivery_address' => 'Customer entrance', 'delivery_latitude' => 14.62, 'delivery_longitude' => 120.98]);
    $this->order->statusHistory()->create(['to_status' => 'pending']);
    $this->delivery = Delivery::create(['order_id' => $this->order->id, 'status' => 'pending_assignment', 'pickup_latitude' => 14.6, 'pickup_longitude' => 120.98, 'pickup_address' => 'Restaurant entrance']);
    $this->delivery->statusHistory()->create(['to_status' => 'pending_assignment']);
});

it('shows kitchen preparation independently from rider arrival and pickup', function () {
    $manager = trackingUser('manager');
    $kitchen = trackingUser('kitchen_staff');
    $this->actingAs($manager)->patchJson('/api/v1/orders/'.$this->order->id.'/status', ['status' => 'confirmed', 'prep_minutes' => 15])->assertOk();
    $this->actingAs($kitchen)->patchJson('/api/v1/orders/'.$this->order->id.'/status', ['status' => 'preparing'])->assertOk();
    $this->delivery->update(['rider_user_id' => $this->rider->id, 'status' => 'accepted']);
    app(DeliveryService::class)->transition($this->delivery->fresh(), $this->rider, 'arrived_at_restaurant');
    $this->actingAs($this->owner)->getJson('/api/v1/my/deliveries/'.$this->delivery->id)->assertOk()->assertJsonPath('data.order_status', 'preparing')->assertJsonPath('data.status', 'arrived_at_restaurant')->assertJsonPath('data.order_history.2.status', 'preparing')->assertJsonPath('data.pickup.address', 'Restaurant entrance');
    $this->actingAs($kitchen)->patchJson('/api/v1/orders/'.$this->order->id.'/status', ['status' => 'ready_to_serve'])->assertOk();
    $this->actingAs($this->owner)->getJson('/api/v1/my/deliveries/'.$this->delivery->id)->assertJsonPath('data.order_status', 'ready_to_serve')->assertJsonPath('data.status', 'arrived_at_restaurant');
    app(DeliveryService::class)->transition($this->delivery->fresh(), $this->rider, 'picked_up');
    $this->getJson('/api/v1/my/deliveries/'.$this->delivery->id)->assertJsonPath('data.status', 'picked_up');
    expect((new DeliveryTrackingUpdated($this->delivery->fresh()))->broadcastWith()['order_status'])->toBe('ready_to_serve');
});

it('shares only the accepted rider location and never exposes presence credentials', function () {
    RiderProfile::create(['user_id' => $this->rider->id, 'is_online' => true, 'latitude' => 14.601, 'longitude' => 120.98, 'accuracy_meters' => 10, 'located_at' => now(), 'presence_token' => '23bac443-77d3-49ba-9658-fd236ad0ed5b']);
    $this->delivery->update(['rider_user_id' => $this->rider->id, 'status' => 'assigned']);
    $this->rider->riderProfile()->update(['vehicle_type' => 'car']);
    $this->actingAs($this->owner)->getJson('/api/v1/my/deliveries/'.$this->delivery->id)->assertJsonPath('data.location', null)->assertJsonPath('data.rider.vehicle_type', 'car')->assertJsonMissingPath('data.rider.phone')->assertJsonMissingPath('data.rider.vehicle_plate');
    $this->delivery->update(['status' => 'accepted']);
    $this->getJson('/api/v1/my/deliveries/'.$this->delivery->id)->assertOk()->assertJsonPath('data.location.latitude', 14.601)->assertJsonPath('data.location_source', 'dispatch_presence')->assertJsonPath('data.tracking_stale', false)->assertJsonMissingPath('data.presence_token')->assertJsonMissingPath('data.rider.presence_token');
    $this->actingAs(trackingUser('customer'))->getJson('/api/v1/my/deliveries/'.$this->delivery->id)->assertNotFound();
    $this->delivery->update(['status' => 'delivered']);
    $this->actingAs($this->owner)->getJson('/api/v1/my/deliveries/'.$this->delivery->id)->assertJsonPath('data.location', null);
});

it('does not present stale or offline dispatch presence as live rider tracking', function () {
    $profile = RiderProfile::create(['user_id' => $this->rider->id, 'is_online' => true, 'latitude' => 14.601, 'longitude' => 120.98, 'accuracy_meters' => 10, 'located_at' => now()->subMinutes(5)]);
    $this->delivery->update(['rider_user_id' => $this->rider->id, 'status' => 'accepted']);
    $this->actingAs($this->owner)->getJson('/api/v1/my/deliveries/'.$this->delivery->id)->assertJsonPath('data.location', null)->assertJsonPath('data.tracking_stale', true);
    $profile->update(['is_online' => false, 'located_at' => now()]);
    $this->getJson('/api/v1/my/deliveries/'.$this->delivery->id)->assertJsonPath('data.location', null);
});

it('does not mark food ready when the estimated preparation time has passed', function () {
    $this->order->update(['status' => 'preparing', 'prep_ready_at' => now()->subMinutes(5)]);
    $this->actingAs($this->owner)->getJson('/api/v1/my/deliveries/'.$this->delivery->id)->assertOk()->assertJsonPath('data.order_status', 'preparing');
});

it('returns recorded arrival times and only this riders delivery GPS trail in chronological order', function () {
    $arrived = now()->subMinutes(8)->startOfSecond();
    $pickup = now()->subMinutes(5)->startOfSecond();
    $delivered = now()->subMinute()->startOfSecond();
    $this->delivery->update(['rider_user_id' => $this->rider->id, 'status' => 'delivered', 'picked_up_at' => $pickup, 'delivered_at' => $delivered]);
    $arrival = $this->delivery->statusHistory()->create(['actor_id' => $this->rider->id, 'to_status' => 'arrived_at_restaurant']);
    $arrival->forceFill(['created_at' => $arrived])->save();
    foreach ([[$this->rider->id, $pickup->copy()->addSeconds(20), 10], [$this->rider->id, $pickup, 10], [$this->rider->id, $pickup->copy()->subMinute(), 10], [$this->rider->id, $delivered->copy()->addMinute(), 10], [$this->owner->id, $pickup, 10], [$this->rider->id, $pickup, 900]] as [$riderId, $at, $accuracy]) {
        $this->delivery->locationUpdates()->create(['rider_user_id' => $riderId, 'latitude' => 14.61, 'longitude' => 120.98, 'accuracy_meters' => $accuracy, 'recorded_at' => $at]);
    }
    $this->actingAs($this->owner)->getJson('/api/v1/my/deliveries/'.$this->delivery->id)->assertOk()
        ->assertJsonPath('data.arrival_times.restaurant', $arrived->toIso8601String())
        ->assertJsonPath('data.arrival_times.picked_up', $pickup->toIso8601String())
        ->assertJsonPath('data.arrival_times.delivered', $delivered->toIso8601String())
        ->assertJsonCount(2, 'data.recorded_path')
        ->assertJsonPath('data.recorded_path.0.recorded_at', $pickup->toIso8601String())
        ->assertJsonPath('data.location', null);
});

it('provides a private cached suggested route without claiming it is the actual journey', function () {
    config(['cache.default' => 'array']);
    $this->mock(MapProviderService::class, function ($mock) {
        $mock->shouldReceive('route')->once()->with(14.6, 120.98, 14.62, 120.98, true)->andReturn(['geometry' => [[120.98, 14.6], [120.98, 14.62]], 'duration_minutes' => 8]);
    });
    $url = '/api/v1/my/deliveries/'.$this->delivery->id.'/route';
    $this->actingAs($this->owner)->getJson($url)->assertOk()->assertJsonPath('data.kind', 'suggested_route')->assertJsonCount(2, 'data.geometry');
    $this->getJson($url)->assertOk();
    $this->actingAs(trackingUser('customer'))->getJson($url)->assertNotFound();
});

it('keeps tracking available when the route provider fails', function () {
    config(['cache.default' => 'array']);
    $this->mock(MapProviderService::class, function ($mock) {
        $mock->shouldReceive('route')->once()->andThrow(new RuntimeException('Provider unavailable'));
    });
    $this->actingAs($this->owner)->getJson('/api/v1/my/deliveries/'.$this->delivery->id.'/route')->assertStatus(503);
    $this->getJson('/api/v1/my/deliveries/'.$this->delivery->id)->assertOk()->assertJsonPath('data.arrival_times.delivered', null);
});

it('records online GPS only during the assigned delivery and deduplicates overlapping location feeds', function () {
    RiderProfile::create(['user_id' => $this->rider->id, 'vehicle_type' => 'motorcycle']);
    $this->mock(MapProviderService::class, function ($mock) {
        $mock->shouldReceive('route')->andReturn(['geometry' => [], 'duration_minutes' => 5, 'distance_km' => 1]);
    });
    $this->delivery->update(['rider_user_id' => $this->rider->id, 'status' => 'in_transit', 'picked_up_at' => now()->subMinute()]);
    $presence = ['is_online' => true, 'start' => true, 'latitude' => 14.61, 'longitude' => 120.98, 'accuracy_meters' => 10];
    $this->actingAs($this->rider)->putJson('/api/v1/rider/presence', $presence)->assertOk();
    $this->postJson('/api/v1/rider/deliveries/'.$this->delivery->id.'/locations', ['latitude' => 14.61, 'longitude' => 120.98, 'accuracy_meters' => 10])->assertOk();
    expect($this->delivery->locationUpdates()->count())->toBe(1);
    $this->travel(6)->seconds();
    $this->putJson('/api/v1/rider/presence', $presence)->assertOk();
    expect($this->delivery->locationUpdates()->count())->toBe(2);
    $this->delivery->update(['status' => 'delivered', 'delivered_at' => now()]);
    $this->travel(6)->seconds();
    $this->putJson('/api/v1/rider/presence', $presence)->assertOk();
    expect($this->delivery->locationUpdates()->count())->toBe(2);
});

it('does not display an outdated route estimate even when the latest GPS is fresh', function () {
    $this->delivery->update(['rider_user_id' => $this->rider->id, 'status' => 'in_transit', 'last_routed_at' => now()->subMinutes(5), 'estimated_arrival_at' => now()->addMinute(), 'route_geometry' => [[120.98, 14.6], [120.98, 14.62]]]);
    RiderProfile::create(['user_id' => $this->rider->id, 'is_online' => true, 'latitude' => 14.61, 'longitude' => 120.98, 'accuracy_meters' => 10, 'located_at' => now()]);
    $this->actingAs($this->owner)->getJson('/api/v1/my/deliveries/'.$this->delivery->id)->assertOk()->assertJsonPath('data.tracking_stale', false)->assertJsonPath('data.eta', null)->assertJsonPath('data.route', null);
    $this->delivery->update(['last_routed_at' => now()]);
    $this->getJson('/api/v1/my/deliveries/'.$this->delivery->id)->assertJsonCount(2, 'data.route');
});
