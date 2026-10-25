<?php

use App\Models\DeliveryAddress;
use App\Models\User;
use App\Services\MapProviderService;
use Database\Seeders\AuthSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->seed(AuthSeeder::class);
    $this->customer = User::create(['name' => 'Address Customer', 'email' => 'address@example.test', 'password' => 'Address-Test-Password-123!', 'is_active' => true]);
    $this->fields = ['label' => 'Home', 'recipient_name' => 'Address Customer', 'phone' => '09123456789', 'formatted_address' => '123 Entrance Street', 'latitude' => 14.6, 'longitude' => 121.0, 'delivery_instructions' => 'Blue gate', 'is_default' => true];
});

it('saves named delivery locations before any order exists', function () {
    $this->actingAs($this->customer)->postJson('/api/v1/addresses', $this->fields)->assertCreated()->assertJsonPath('data.label', 'Home')->assertJsonPath('data.is_default', true);
    $this->assertDatabaseCount('orders', 0);
    $this->getJson('/api/v1/addresses')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.delivery_instructions', 'Blue gate');
});

it('switches the default only within the signed-in customer account', function () {
    $other = User::create(['name' => 'Other Customer', 'email' => 'other@example.test', 'password' => 'Address-Test-Password-123!', 'is_active' => true]);
    $otherAddress = DeliveryAddress::create($this->fields + ['user_id' => $other->id]);
    $this->actingAs($this->customer);
    $home = $this->postJson('/api/v1/addresses', $this->fields)->assertCreated()->json('data.id');
    $workFields = array_replace($this->fields, ['label' => 'Work', 'is_default' => false]);
    $work = $this->postJson('/api/v1/addresses', $workFields)->assertCreated()->json('data.id');
    $this->putJson("/api/v1/addresses/{$work}", array_replace($workFields, ['is_default' => true]))->assertOk();
    expect(DeliveryAddress::find($home)->is_default)->toBeFalse();
    expect(DeliveryAddress::find($work)->is_default)->toBeTrue();
    expect($otherAddress->fresh()->is_default)->toBeTrue();
    $this->getJson('/api/v1/addresses')->assertJsonCount(2, 'data')->assertJsonPath('data.0.label', 'Work');
});

it('prevents reading editing or deleting another customer saved location', function () {
    $other = User::create(['name' => 'Other Customer', 'email' => 'other@example.test', 'password' => 'Address-Test-Password-123!', 'is_active' => true]);
    $address = DeliveryAddress::create($this->fields + ['user_id' => $other->id]);
    $this->actingAs($this->customer)->getJson('/api/v1/addresses')->assertOk()->assertJsonCount(0, 'data');
    $this->putJson("/api/v1/addresses/{$address->id}", $this->fields)->assertNotFound();
    $this->deleteJson("/api/v1/addresses/{$address->id}")->assertNotFound();
    $this->assertDatabaseHas('delivery_addresses', ['id' => $address->id, 'user_id' => $other->id]);
});

it('deletes a saved address without requiring an order', function () {
    $this->actingAs($this->customer);
    $id = $this->postJson('/api/v1/addresses', $this->fields)->assertCreated()->json('data.id');
    $this->deleteJson("/api/v1/addresses/{$id}")->assertNoContent();
    $this->getJson('/api/v1/addresses')->assertJsonCount(0, 'data');
});

it('keeps an existing default address selected after editing its details', function () {
    $this->actingAs($this->customer);
    $id = $this->postJson('/api/v1/addresses', $this->fields)->assertCreated()->json('data.id');
    $this->putJson("/api/v1/addresses/{$id}", array_replace($this->fields, ['delivery_instructions' => 'Call at the blue gate']))->assertOk()->assertJsonPath('data.is_default', true);
    $this->getJson('/api/v1/addresses')->assertJsonPath('data.0.is_default', true)->assertJsonPath('data.0.delivery_instructions', 'Call at the blue gate');
});

it('lets authenticated customers reverse-lookup their pin but requires authentication', function () {
    $this->getJson('/api/v1/maps/reverse?latitude=14.6&longitude=121')->assertUnauthorized();
    $this->mock(MapProviderService::class)->shouldReceive('reverse')->once()->with(14.6, 121.0)->andReturn(['label' => '123 Entrance Street', 'latitude' => 14.6, 'longitude' => 121]);
    $this->actingAs($this->customer)->getJson('/api/v1/maps/reverse?latitude=14.6&longitude=121')->assertOk()->assertJsonPath('data.label', '123 Entrance Street');
});
