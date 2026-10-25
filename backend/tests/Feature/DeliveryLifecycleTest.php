<?php

use App\Models\Delivery;
use App\Models\DeliveryAssignment;
use App\Models\Order;
use App\Models\RiderProfile;
use Database\Seeders\AuthSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;

uses(RefreshDatabase::class);
beforeEach(function () {
    $this->seed(AuthSeeder::class);
    Http::preventStrayRequests();
});

it('isolates customer tracking and rider actions and stops GPS after completion', function () {
    $owner = orderingUser('customer');
    $stranger = orderingUser('customer');
    $rider = orderingUser('rider');
    $otherRider = orderingUser('rider');
    $item = orderableItem();
    $orderId = $this->actingAs($owner)->postJson('/api/v1/orders', ['order_type' => 'pickup', 'items' => [['menu_item_id' => $item->id, 'quantity' => 1]]])->assertCreated()->json('data.id');
    Order::whereKey($orderId)->update(['order_type' => 'delivery', 'status' => 'ready_to_serve']);
    $delivery = Delivery::create(['order_id' => $orderId, 'rider_user_id' => $rider->id, 'status' => 'assigned']);
    DeliveryAssignment::create(['delivery_id' => $delivery->id, 'rider_user_id' => $rider->id, 'assigned_by' => $rider->id, 'status' => 'assigned']);
    RiderProfile::firstOrCreate(['user_id' => $rider->id]);
    $this->actingAs($stranger)->getJson('/api/v1/my/deliveries/'.$delivery->id)->assertNotFound();
    $this->actingAs($owner)->getJson('/api/v1/my/deliveries/'.$delivery->id)->assertOk();
    $this->actingAs($otherRider)->postJson('/api/v1/rider/deliveries/'.$delivery->id.'/accept')->assertForbidden();
    $this->actingAs($rider)->postJson('/api/v1/rider/deliveries/'.$delivery->id.'/accept')->assertOk();
    $this->postJson('/api/v1/rider/deliveries/'.$delivery->id.'/locations', ['latitude' => 14.6, 'longitude' => 120.98])->assertForbidden();
    foreach (['arrived_at_restaurant', 'picked_up', 'in_transit', 'delivered'] as $status) {
        if ($status === 'delivered') {
            $this->postJson('/api/v1/rider/deliveries/'.$delivery->id.'/proof', ['photo' => \Tests\Support\DeliveryPhoto::file()])->assertOk();
        }
        $this->patchJson('/api/v1/rider/deliveries/'.$delivery->id.'/status', ['status' => $status])->assertOk();
    }
    $this->postJson('/api/v1/rider/deliveries/'.$delivery->id.'/locations', ['latitude' => 14.6, 'longitude' => 120.98])->assertForbidden();
    expect($delivery->fresh()->order->status)->toBe('completed');
    expect($delivery->fresh()->statusHistory()->count())->toBe(5);
});
