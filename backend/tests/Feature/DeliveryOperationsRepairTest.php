<?php

use App\Jobs\RefreshDeliveryEta;
use App\Models\Delivery;
use App\Models\Order;
use App\Models\RiderProfile;
use App\Models\Role;
use App\Models\User;
use App\Services\DeliveryService;
use App\Services\MapProviderService;
use Database\Seeders\AuthSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;

uses(RefreshDatabase::class);

function repairUser(string $role): User
{
    $user = User::create(['name' => 'Operations '.$role, 'email' => uniqid().'@example.test', 'password' => 'Operations-Password-123!', 'is_active' => true]);
    $user->roles()->attach(Role::where('slug', $role)->firstOrFail());

    return $user;
}

function repairDelivery(User $customer, User $rider, string $status = 'in_transit', ?string $number = null): Delivery
{
    $order = Order::create(['order_number' => $number ?? 'REPAIR'.uniqid(), 'customer_id' => $customer->id, 'customer_name_snapshot' => $customer->name, 'order_type' => 'delivery', 'status' => 'ready_to_serve', 'subtotal' => 100, 'total' => 100, 'currency' => 'PHP', 'delivery_address' => 'Sample address', 'delivery_latitude' => 14.62, 'delivery_longitude' => 120.98]);

    return Delivery::create(['order_id' => $order->id, 'rider_user_id' => $rider->id, 'status' => $status]);
}

beforeEach(function () {
    $this->seed(AuthSeeder::class);
    $this->manager = repairUser('manager');
    $this->rider = repairUser('rider');
    $this->customer = repairUser('customer');
    RiderProfile::create(['user_id' => $this->rider->id, 'vehicle_type' => 'motorcycle']);
});

it('resumes an unsuccessful delivery only with manager authorization and explicit same rider custody', function () {
    $delivery = repairDelivery($this->customer, $this->rider);
    app(DeliveryService::class)->transition($delivery, $this->rider, 'failed', 'Wrong address supplied');
    $url = '/api/v1/admin/deliveries/'.$delivery->id.'/recover';
    $data = ['reason' => 'Address clarified with rider and customer', 'custody_confirmed' => true];
    $this->actingAs($this->rider)->postJson($url, $data)->assertForbidden();
    $this->actingAs($this->manager)->postJson($url, ['reason' => 'Address clarified'])->assertUnprocessable();
    $this->getJson('/api/v1/admin/deliveries?queue=attention')->assertJsonPath('data.0.can_recover', true)->assertJsonPath('data.0.recovery_status', 'in_transit');
    $this->postJson($url, $data)->assertOk()->assertJsonPath('data.status', 'in_transit');
    expect($delivery->fresh()->rider_user_id)->toBe($this->rider->id);
    expect($delivery->statusHistory()->where('from_status', 'failed')->where('to_status', 'in_transit')->exists())->toBeTrue();
    expect($delivery->statusHistory()->where('to_status', 'failed')->exists())->toBeTrue();
    $this->postJson($url, $data)->assertUnprocessable();
});

it('rejects recovery after order completion or conflicting rider work', function () {
    $delivery = repairDelivery($this->customer, $this->rider);
    app(DeliveryService::class)->transition($delivery, $this->rider, 'failed', 'Address problem');
    $other = repairDelivery($this->customer, $this->rider, 'accepted');
    $url = '/api/v1/admin/deliveries/'.$delivery->id.'/recover';
    $data = ['reason' => 'Custody checked', 'custody_confirmed' => true];
    $this->actingAs($this->manager)->postJson($url, $data)->assertUnprocessable();
    $other->update(['status' => 'cancelled']);
    $delivery->order->update(['status' => 'completed']);
    $this->postJson($url, $data)->assertUnprocessable();
    expect($delivery->fresh()->status)->toBe('failed');
});

it('searches and paginates the entire dispatch queue with global counts', function () {
    for ($i = 0; $i < 205; $i++) {
        repairDelivery($this->customer, $this->rider, 'failed', 'BACKLOG-'.$i);
    }
    $active = repairDelivery($this->customer, $this->rider, 'in_transit', 'LIVE-ORDER');
    $this->actingAs($this->manager)->getJson('/api/v1/admin/deliveries?queue=road&q=live-order&per_page=10')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $active->id)->assertJsonPath('counts.attention', 205)->assertJsonPath('counts.road', 1)->assertJsonPath('meta.total', 1);
    $this->getJson('/api/v1/admin/deliveries?queue=attention&per_page=10&page=21')->assertOk()->assertJsonCount(5, 'data')->assertJsonPath('meta.total', 205)->assertJsonPath('meta.last_page', 21);
    $this->getJson('/api/v1/admin/deliveries?queue=road&q=operations%20rider')->assertJsonCount(1, 'data');
});

it('acknowledges GPS without a synchronous route request and calculates ETA in scheduled work', function () {
    config(['queue.default' => 'sync']);
    $delivery = repairDelivery($this->customer, $this->rider);
    $this->mock(MapProviderService::class, function ($mock) {
        $mock->shouldReceive('route')->once()->andReturn(['geometry' => [[120.98, 14.61], [120.98, 14.62]], 'duration_minutes' => 8, 'distance_km' => 1]);
    });
    $this->actingAs($this->rider)->postJson('/api/v1/rider/deliveries/'.$delivery->id.'/locations', ['latitude' => 14.61, 'longitude' => 120.98, 'accuracy_meters' => 10])->assertOk()->assertJsonPath('data.eta', null);
    expect($delivery->fresh()->last_routed_at)->toBeNull();
    $this->artisan('deliveries:refresh-etas')->assertSuccessful();
    expect($delivery->fresh()->last_routed_at)->not->toBeNull();
    $this->artisan('deliveries:refresh-etas')->assertSuccessful();
});

it('queues ETA work for asynchronous installations and ignores deliveries that finish before processing', function () {
    config(['queue.default' => 'database']);
    Queue::fake();
    $delivery = repairDelivery($this->customer, $this->rider);
    $this->actingAs($this->rider)->postJson('/api/v1/rider/deliveries/'.$delivery->id.'/locations', ['latitude' => 14.61, 'longitude' => 120.98, 'accuracy_meters' => 10])->assertOk();
    Queue::assertPushed(RefreshDeliveryEta::class);
    $delivery->update(['status' => 'cancelled']);
    $this->mock(MapProviderService::class, fn ($mock) => $mock->shouldNotReceive('route'));
    app(DeliveryService::class)->refreshEta($delivery->id);
    expect($delivery->fresh()->last_routed_at)->toBeNull();
});
