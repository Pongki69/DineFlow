<?php

use App\Models\Delivery;
use App\Models\Order;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\AuthSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);
beforeEach(function () {
    $this->seed(AuthSeeder::class);
    $this->rider = User::create(['name' => 'Work Rider', 'email' => 'work@example.test', 'password' => 'Test-Route-123!', 'is_active' => true]);
    $this->rider->roles()->attach(Role::where('slug', 'rider')->firstOrFail());
    $this->make = function ($status = 'in_transit', $extra = []) {
        $order = Order::create(['order_number' => 'WORK'.uniqid(), 'customer_name_snapshot' => 'Recipient', 'order_type' => 'delivery', 'status' => 'preparing', 'total' => 100, 'subtotal' => 100, 'currency' => 'PHP']);

        return Delivery::create($extra + ['order_id' => $order->id, 'rider_user_id' => $this->rider->id, 'status' => $status, 'assigned_at' => now()]);
    };
});
it('persists route order and uses it for the dashboard and assignments', function () {
    $one = ($this->make)();
    $two = ($this->make)();
    $this->actingAs($this->rider)->putJson('/api/v1/rider/route-order', ['delivery_ids' => [$two->id, $one->id]])->assertOk();
    $this->getJson('/api/v1/rider/summary')->assertOk()->assertJsonPath('data.next_delivery.id', $two->id);
    $this->getJson('/api/v1/rider/assignments?scope=active')->assertOk()->assertJsonPath('delivery_order.0', $two->id)->assertJsonPath('next_delivery_id', $two->id);
    $two->update(['status' => 'delivered']);
    $this->getJson('/api/v1/rider/summary')->assertJsonPath('data.next_delivery.id', $one->id);
});
it('keeps outstanding pickups ahead of dropoffs and enforces paired order', function () {
    $road = ($this->make)();
    $pickup = ($this->make)('accepted');
    $this->actingAs($this->rider)->putJson('/api/v1/rider/route-order', ['delivery_ids' => [$road->id, $pickup->id]])->assertOk();
    $this->getJson('/api/v1/rider/summary')->assertJsonPath('data.next_delivery.id', $pickup->id);
    $a = ($this->make)('in_transit', ['batch_key' => 'work-pair', 'batch_sequence' => 1]);
    $b = ($this->make)('in_transit', ['batch_key' => 'work-pair', 'batch_sequence' => 2]);
    $this->putJson('/api/v1/rider/route-order', ['delivery_ids' => [$b->id, $a->id]])->assertUnprocessable();
});
it('rejects foreign, terminal and duplicate deliveries', function () {
    $own = ($this->make)();
    $done = ($this->make)('delivered');
    $other = User::create(['name' => 'Other', 'email' => 'other-work@example.test', 'password' => 'Test-Route-123!']);
    $foreign = ($this->make)('accepted', ['rider_user_id' => $other->id]);
    $this->actingAs($this->rider)->putJson('/api/v1/rider/route-order', ['delivery_ids' => [$foreign->id]])->assertNotFound();
    $this->putJson('/api/v1/rider/route-order', ['delivery_ids' => [$done->id]])->assertNotFound();
    $this->putJson('/api/v1/rider/route-order', ['delivery_ids' => [$own->id, $own->id]])->assertUnprocessable();
});
