<?php

use App\Models\Delivery;
use App\Models\DispatchOffer;
use App\Models\Order;
use App\Models\Payment;
use App\Models\RiderProfile;
use App\Models\Role;
use App\Models\User;
use App\Services\DeliveryService;
use App\Services\DispatchCandidates;
use App\Services\DispatchGeo;
use App\Services\DispatchService;
use App\Services\MapProviderService;
use Database\Seeders\AuthSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

uses(RefreshDatabase::class);

function dispatchUser(string $role = 'rider'): User
{
    $user = User::create(['name' => 'Dispatch '.$role, 'email' => uniqid().'@example.test', 'password' => 'Dispatch-Test-Password-123!', 'is_active' => true]);
    $user->roles()->attach(Role::where('slug', $role)->firstOrFail());

    return $user;
}

function dispatchRider(array $changes = []): RiderProfile
{
    $user = dispatchUser();

    return RiderProfile::create(array_replace(['user_id' => $user->id, 'vehicle_type' => 'motorcycle', 'is_available' => true, 'is_online' => true,
        'latitude' => 14.601, 'longitude' => 120.98, 'accuracy_meters' => 10, 'located_at' => now(), 'geohash' => DispatchGeo::hash(14.601, 120.98)], $changes));
}

function dispatchDelivery(array $changes = [], bool $paid = true): Delivery
{
    $user = dispatchUser('customer');
    $order = Order::create(array_replace(['order_number' => 'AUTO'.uniqid(), 'customer_id' => $user->id, 'customer_name_snapshot' => $user->name,
        'order_type' => 'delivery', 'status' => 'confirmed', 'delivery_address' => 'Destination', 'delivery_latitude' => 14.62, 'delivery_longitude' => 120.98,
        'subtotal' => 100, 'total' => 100, 'currency' => 'PHP', 'prep_minutes' => 2, 'prep_ready_at' => now()->addMinutes(2), 'delivery_vehicle_class' => 'motorcycle'], $changes));
    if ($paid) {
        Payment::create(['order_id' => $order->id, 'purpose' => 'order', 'method' => 'cash', 'status' => 'paid', 'amount' => 100, 'currency' => 'PHP', 'paid_at' => now()]);
    }

    return Delivery::create(['order_id' => $order->id, 'status' => 'pending_assignment', 'pickup_latitude' => 14.6, 'pickup_longitude' => 120.98, 'pickup_address' => 'Restaurant']);
}

beforeEach(function () {
    $this->seed(AuthSeeder::class);
    Cache::flush();
    $this->mock(MapProviderService::class)->shouldReceive('route')->andReturn(['duration_minutes' => 4, 'distance_km' => 1, 'geometry' => [[120.98, 14.6], [120.98, 14.62]]]);
});

it('waits for both verified full payment and merchant preparation timing', function () {
    dispatchRider();
    $unpaid = dispatchDelivery([], false);
    $unaccepted = dispatchDelivery(['status' => 'pending', 'prep_ready_at' => null]);
    app(DispatchService::class)->tick();
    expect(DispatchOffer::count())->toBe(0);
    expect($unpaid->fresh()->dispatch_status)->toBe('waiting_payment');
    expect($unaccepted->fresh()->dispatch_status)->toBe('waiting_merchant');
});

it('targets rider arrival near the prep ready time and avoids immediate early offers', function () {
    $profile = dispatchRider();
    $delivery = dispatchDelivery(['prep_ready_at' => now()->addMinutes(20)]);
    app(DispatchService::class)->tick();
    expect(DispatchOffer::count())->toBe(0)->and($delivery->fresh()->dispatch_status)->toBe('scheduled');
    $this->travel(16)->minutes();
    $profile->update(['located_at' => now()]);
    app(DispatchService::class)->tick();
    expect(DispatchOffer::count())->toBe(1);
});

it('filters stale offline inaccurate and incompatible riders', function () {
    dispatchRider(['is_online' => false]);
    dispatchRider(['located_at' => now()->subMinutes(3)]);
    dispatchRider(['accuracy_meters' => 501]);
    dispatchRider(['vehicle_type' => 'bicycle']);
    $eligible = dispatchRider();
    $delivery = dispatchDelivery();
    app(DispatchService::class)->step($delivery->id);
    expect(DispatchOffer::sole()->rider_user_id)->toBe($eligible->user_id);
});

it('reserves only one active offer per delivery and per rider across repeated ticks', function () {
    dispatchRider();
    $a = dispatchDelivery();
    $b = dispatchDelivery();
    app(DispatchService::class)->tick();
    app(DispatchService::class)->tick();
    expect(DispatchOffer::where('status', 'offered')->count())->toBe(1);
    expect(Delivery::whereNotNull('rider_user_id')->count())->toBe(0);
    $offer = DispatchOffer::sole();
    $this->actingAs($offer->rider)->postJson('/api/v1/rider/offers/'.$offer->id.'/respond', ['response' => 'accept'])->assertOk();
    $this->postJson('/api/v1/rider/offers/'.$offer->id.'/respond', ['response' => 'accept'])->assertOk();
    expect($offer->fresh()->delivery->assignments()->count())->toBe(1);
});

it('expires an offer and advances to another rider without accepting stale requests', function () {
    $first = dispatchRider();
    $second = dispatchRider();
    $delivery = dispatchDelivery();
    app(DispatchService::class)->step($delivery->id);
    $old = DispatchOffer::sole();
    $this->travel(26)->seconds();
    app(DispatchService::class)->tick();
    expect($old->fresh()->status)->toBe('expired');
    expect(DispatchOffer::where('status', 'offered')->sole()->rider_user_id)->toBe($second->user_id);
    $this->actingAs($first->user)->postJson('/api/v1/rider/offers/'.$old->id.'/respond', ['response' => 'accept'])->assertUnprocessable();
    expect($delivery->fresh()->rider_user_id)->toBeNull();
});

it('rejects unauthorized offers and immediately tries the next candidate after a rejection', function () {
    $first = dispatchRider();
    $second = dispatchRider();
    $delivery = dispatchDelivery();
    app(DispatchService::class)->step($delivery->id);
    $offer = DispatchOffer::sole();
    $this->actingAs($second->user)->postJson('/api/v1/rider/offers/'.$offer->id.'/respond', ['response' => 'accept'])->assertForbidden();
    $this->actingAs($first->user)->postJson('/api/v1/rider/offers/'.$offer->id.'/respond', ['response' => 'reject'])->assertOk();
    expect(DispatchOffer::where('status', 'offered')->sole()->rider_user_id)->toBe($second->user_id);
});

it('expands the radius on bounded search timeouts and eventually flags manual attention', function () {
    config(['dispatch.seconds_per_radius' => 10]);
    $delivery = dispatchDelivery(['prep_ready_at' => now()]);
    app(DispatchService::class)->tick();
    for ($i = 0; $i < 3; $i++) {
        $this->travel(11)->seconds();
        app(DispatchService::class)->tick();
    }
    expect($delivery->fresh()->dispatch_stage)->toBe(2)->and($delivery->fresh()->dispatch_status)->toBe('exhausted');
    expect($delivery->order->fresh()->delivery_fee)->toBe('0.00');
});

it('withdraws stale offers when a manager manually assigns a rider', function () {
    $first = dispatchRider();
    $second = dispatchRider();
    $delivery = dispatchDelivery();
    app(DispatchService::class)->step($delivery->id);
    $offer = DispatchOffer::sole();
    app(DeliveryService::class)->assign($delivery, dispatchUser('manager'), $second->user_id);
    expect($offer->fresh()->status)->toBe('cancelled');
    $this->actingAs($first->user)->postJson('/api/v1/rider/offers/'.$offer->id.'/respond', ['response' => 'accept'])->assertUnprocessable();
    expect($delivery->fresh()->rider_user_id)->toBe($second->user_id);
});

it('rechecks payment when accepting an offer', function () {
    $profile = dispatchRider();
    $delivery = dispatchDelivery();
    app(DispatchService::class)->step($delivery->id);
    $offer = DispatchOffer::sole();
    Payment::where('order_id', $delivery->order_id)->update(['status' => 'refunded']);
    $this->actingAs($profile->user)->postJson('/api/v1/rider/offers/'.$offer->id.'/respond', ['response' => 'accept'])->assertUnprocessable();
    expect($offer->fresh()->status)->toBe('cancelled')->and($delivery->fresh()->rider_user_id)->toBeNull();
});

it('batches two aligned nearby pickups only within capacity and blocks a third order', function () {
    $profile = dispatchRider();
    $a = dispatchDelivery();
    app(DispatchService::class)->step($a->id);
    app(DispatchService::class)->respond(DispatchOffer::sole(), $profile->user, 'accept');
    $b = dispatchDelivery(['delivery_latitude' => 14.621]);
    app(DispatchService::class)->step($b->id);
    $offer = DispatchOffer::where('status', 'offered')->sole();
    expect($offer->ranking['batch_delivery_id'])->toBe($a->id);
    app(DispatchService::class)->respond($offer, $profile->user, 'accept');
    expect($b->fresh()->batch_key)->not->toBeNull()->and($b->fresh()->batch_key)->toBe($a->fresh()->batch_key);
    $c = dispatchDelivery();
    app(DispatchService::class)->step($c->id);
    expect(DispatchOffer::where('status', 'offered')->count())->toBe(0);
    expect(fn () => app(DeliveryService::class)->transition($b->fresh(), $profile->user, 'in_transit'))->toThrow(ValidationException::class);
});

it('rejects opposite headings distant pickups and food already in transit for batching', function () {
    $profile = dispatchRider();
    $a = dispatchDelivery();
    $a->update(['rider_user_id' => $profile->user_id, 'status' => 'accepted']);
    $opposite = dispatchDelivery(['delivery_latitude' => 14.58]);
    expect(app(DispatchCandidates::class)->eligible($opposite, $profile))->toBeFalse();
    $near = dispatchDelivery();
    $near->update(['pickup_latitude' => 14.62]);
    expect(app(DispatchCandidates::class)->eligible($near, $profile))->toBeFalse();
    $a->update(['status' => 'in_transit']);
    $near->update(['pickup_latitude' => 14.6]);
    expect(app(DispatchCandidates::class)->eligible($near, $profile))->toBeFalse();
});

it('requires explicit online presence and fresh accurate coordinates', function () {
    $profile = dispatchRider(['is_online' => false]);
    $this->actingAs($profile->user)->putJson('/api/v1/rider/presence', ['is_online' => true])->assertUnprocessable();
    $token = $this->putJson('/api/v1/rider/presence', ['is_online' => true, 'start' => true, 'latitude' => 14.6, 'longitude' => 120.98, 'accuracy_meters' => 10])->assertOk()->assertJsonPath('data.is_online', true)->json('presence_token');
    $this->putJson('/api/v1/rider/presence', ['is_online' => false])->assertOk()->assertJsonPath('data.latitude', null);
    $this->putJson('/api/v1/rider/presence', ['is_online' => true, 'presence_token' => $token, 'latitude' => 14.6, 'longitude' => 120.98, 'accuracy_meters' => 10])->assertUnprocessable();
});

it('normalizes legacy vehicle spellings and saves only supported vehicle types', function () {
    $profile = dispatchRider();
    DB::table('rider_profiles')->where('id', $profile->id)->update(['vehicle_type' => 'Motorcyle']);
    $this->actingAs($profile->user)->getJson('/api/v1/rider/profile')->assertOk()->assertJsonPath('data.vehicle_type', 'motorcycle');
    $this->putJson('/api/v1/rider/presence', ['is_online' => true, 'start' => true, 'latitude' => 14.6, 'longitude' => 120.98, 'accuracy_meters' => 10])->assertOk();
    $this->putJson('/api/v1/rider/profile', ['vehicle_type' => ' Motorcycle '])->assertOk()->assertJsonPath('data.vehicle_type', 'motorcycle');
    $this->assertDatabaseHas('rider_profiles', ['id' => $profile->id, 'vehicle_type' => 'motorcycle']);
    $this->putJson('/api/v1/rider/profile', ['vehicle_type' => 'spaceship'])->assertUnprocessable();
    $this->putJson('/api/v1/rider/profile', ['vehicle_type' => ['motorcycle']])->assertUnprocessable();
});

it('accepts one real customer rating per completed delivery', function () {
    $profile = dispatchRider();
    $delivery = dispatchDelivery();
    $delivery->update(['status' => 'delivered', 'rider_user_id' => $profile->user_id]);
    $this->actingAs(dispatchUser('customer'))->postJson('/api/v1/my/deliveries/'.$delivery->id.'/rating', ['rating' => 5])->assertNotFound();
    $this->actingAs($delivery->order->customer)->postJson('/api/v1/my/deliveries/'.$delivery->id.'/rating', ['rating' => 5])->assertOk();
    $this->postJson('/api/v1/my/deliveries/'.$delivery->id.'/rating', ['rating' => 1])->assertUnprocessable();
});

it('indexes radius boundary neighbors with geohash and wraps the date line', function () {
    expect(DispatchGeo::cells(14.6, 120.98, 5))->toContain(DispatchGeo::hash(14.601, 120.98));
    expect(DispatchGeo::cells(0, 179.99, 5))->toContain(DispatchGeo::hash(0, -179.99));
});

it('ranks a shorter road ETA higher even if the rider is farther in straight-line distance', function () {
    $slow = dispatchRider();
    $fast = dispatchRider(['latitude' => 14.602]);
    $delivery = dispatchDelivery();
    app()->instance(MapProviderService::class, new class extends MapProviderService
    {
        public function route(float $fromLat, float $fromLng, float $toLat, float $toLng, bool $includeGeometry = false): array
        {
            return ['duration_minutes' => $fromLat < 14.6015 ? 12 : 3, 'distance_km' => 2, 'geometry' => []];
        }
    });
    $ranked = app(DispatchCandidates::class)->rank($delivery);
    expect($ranked[0]['rider_id'])->toBe($fast->user_id)->and($ranked[0]['score'])->toBeGreaterThan($ranked[1]['score']);
});

it('rejects an aligned batch whose road detour exceeds the limit', function () {
    $profile = dispatchRider();
    $a = dispatchDelivery();
    $a->update(['rider_user_id' => $profile->user_id, 'status' => 'accepted']);
    $b = dispatchDelivery(['delivery_latitude' => 14.621]);
    app()->instance(MapProviderService::class, new class extends MapProviderService
    {
        public function route(float $fromLat, float $fromLng, float $toLat, float $toLng, bool $includeGeometry = false): array
        {
            return ['duration_minutes' => 20, 'distance_km' => 2, 'geometry' => []];
        }
    });
    expect(app(DispatchCandidates::class)->eligible($b, $profile))->toBeTrue();
    expect(app(DispatchCandidates::class)->rank($b))->toBe([]);
});

it('keeps a batched rider busy until both ordered dropoffs finish', function () {
    $profile = dispatchRider();
    $a = dispatchDelivery();
    app(DispatchService::class)->step($a->id);
    app(DispatchService::class)->respond(DispatchOffer::sole(), $profile->user, 'accept');
    $b = dispatchDelivery(['delivery_latitude' => 14.621]);
    app(DispatchService::class)->step($b->id);
    app(DispatchService::class)->respond(DispatchOffer::where('status', 'offered')->sole(), $profile->user, 'accept');
    Delivery::whereIn('id', [$a->id, $b->id])->update(['status' => 'in_transit']);
    Order::whereIn('id', [$a->order_id, $b->order_id])->update(['status' => 'ready_to_serve']);
    foreach ([$a, $b] as $delivery) {
        app(\App\Services\DeliveryProofService::class)->upload($delivery->fresh(), $profile->user, \Tests\Support\DeliveryPhoto::file());
    }
    expect(fn () => app(DeliveryService::class)->transition($b->fresh(), $profile->user, 'delivered'))->toThrow(ValidationException::class);
    app(DeliveryService::class)->transition($a->fresh(), $profile->user, 'delivered');
    expect($profile->fresh()->is_available)->toBeFalse();
    app(DeliveryService::class)->transition($b->fresh(), $profile->user, 'delivered');
    expect($profile->fresh()->is_available)->toBeTrue();
});
