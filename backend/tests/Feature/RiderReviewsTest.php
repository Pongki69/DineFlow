<?php

use App\Models\Delivery;
use App\Models\Order;
use App\Models\RiderProfile;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\AuthSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

function reviewUser(string $role, ?string $name = null): User
{
    $user = User::create(['name' => $name ?? ucfirst($role), 'email' => uniqid().'@example.test', 'password' => 'Review-Test-123!', 'is_active' => true]);
    $user->roles()->attach(Role::where('slug', $role)->firstOrFail());

    return $user;
}

beforeEach(function () {
    $this->seed(AuthSeeder::class);
    $this->customer = reviewUser('customer', 'Alfonso Panisales');
    $this->rider = reviewUser('rider', 'Alex Delivery');
    RiderProfile::create(['user_id' => $this->rider->id, 'vehicle_type' => 'motorcycle', 'phone' => 'SECRET-PHONE', 'vehicle_plate' => 'SECRET-PLATE']);
    $this->order = Order::create(['order_number' => 'REVIEW'.uniqid(), 'customer_id' => $this->customer->id, 'customer_name_snapshot' => $this->customer->name, 'order_type' => 'delivery', 'status' => 'completed', 'subtotal' => 100, 'total' => 100, 'currency' => 'PHP', 'delivery_address' => 'PRIVATE-ADDRESS']);
    $this->delivery = Delivery::create(['order_id' => $this->order->id, 'rider_user_id' => $this->rider->id, 'status' => 'delivered', 'delivered_at' => now()]);
    $this->url = '/api/v1/my/deliveries/'.$this->delivery->id.'/rating';
    $this->profileUrl = '/api/v1/riders/'.$this->rider->id.'/profile';
});

it('accepts one verified review with feedback tags and masks the author on every shared view by default', function () {
    $payload = ['rating' => 5, 'comment' => 'Careful and on time.', 'categories' => ['delivery_time', 'handling']];
    $this->actingAs($this->customer)->postJson($this->url, $payload)->assertOk()->assertJsonPath('data.show_name', false);
    $this->postJson($this->url, $payload)->assertUnprocessable();
    $profile = $this->getJson($this->profileUrl)->assertOk()->assertJsonPath('data.summary.count', 1)->assertJsonPath('data.reviews.0.display_name', 'Al*****o')->assertJsonPath('data.reviews.0.comment', 'Careful and on time.')->assertJsonPath('data.rider.vehicle_type', 'motorcycle')->assertJsonMissingPath('data.reviews.0.customer_id')->assertJsonMissingPath('data.reviews.0.delivery_id')->assertJsonMissingPath('data.rider.phone')->assertJsonMissingPath('data.rider.vehicle_plate');
    expect($profile->getContent())->not->toContain('Alfonso Panisales', 'PRIVATE-ADDRESS', 'SECRET-PHONE', 'SECRET-PLATE', $this->customer->email);
    $this->actingAs($this->rider)->getJson('/api/v1/rider/reviews')->assertOk()->assertJsonPath('data.reviews.0.display_name', 'Al*****o')->assertJsonPath('data.reviews.0.name_hidden', true);
});

it('lets only the author edit feedback and change their name visibility without adding another rating', function () {
    $this->actingAs($this->customer)->postJson($this->url, ['rating' => 5])->assertOk();
    $this->patchJson($this->url, ['rating' => 4, 'comment' => 'Helpful rider.', 'show_name' => true, 'categories' => ['communication']])->assertOk();
    $this->getJson($this->profileUrl)->assertJsonPath('data.reviews.0.display_name', 'Alfonso Panisales')->assertJsonPath('data.reviews.0.name_hidden', false)->assertJsonPath('data.summary.count', 1)->assertJsonPath('data.summary.average', 4);
    $this->getJson('/api/v1/my/deliveries/'.$this->delivery->id)->assertJsonPath('data.review.show_name', true)->assertJsonPath('data.review.comment', 'Helpful rider.');
    $this->patchJson($this->url, ['rating' => 4, 'show_name' => false])->assertOk();
    $this->actingAs($this->rider)->getJson('/api/v1/rider/reviews')->assertJsonPath('data.reviews.0.display_name', 'Al*****o');
    $this->actingAs(reviewUser('customer'))->patchJson($this->url, ['rating' => 1, 'show_name' => true])->assertNotFound();
    expect(DB::table('delivery_ratings')->count())->toBe(1);
});

it('rejects unverified orders invalid categories scores and oversized comments', function () {
    $this->actingAs($this->customer);
    foreach ([['rating' => 6], ['rating' => 4.5], ['rating' => 5, 'categories' => ['unknown']], ['rating' => 5, 'categories' => ['handling', 'handling']], ['rating' => 5, 'comment' => str_repeat('x', 1001)]] as $payload) {
        $this->postJson($this->url, $payload)->assertUnprocessable();
    }
    $this->delivery->update(['status' => 'in_transit']);
    $this->postJson($this->url, ['rating' => 5])->assertNotFound();
    $this->actingAs(reviewUser('customer'))->postJson($this->url, ['rating' => 5])->assertNotFound();
    $this->assertDatabaseCount('delivery_ratings', 0);
});

it('keeps history order details exclusive to the assigned rider and profiles limited to authorized viewers', function () {
    $category = \App\Models\MenuCategory::create(['name' => 'Meals', 'slug' => 'review-meals']);
    $menuItem = \App\Models\MenuItem::create(['category_id' => $category->id, 'name' => 'Current dish name', 'slug' => 'review-dish', 'base_price' => 250, 'description' => 'Fresh noodles with vegetables.', 'image_source_url' => 'https://images.example.test/noodles.jpg']);
    $this->order->items()->create(['menu_item_id' => $menuItem->id, 'category_id' => $category->id, 'item_name_snapshot' => 'Original dish name', 'category_name_snapshot' => 'Meals', 'base_unit_price' => 100, 'quantity' => 1, 'line_total' => 100]);
    $menuItem->delete();
    $this->delivery->update(['pickup_latitude' => 14.6, 'pickup_longitude' => 120.98]);
    $this->order->update(['delivery_latitude' => 14.62, 'delivery_longitude' => 120.99]);
    $details = '/api/v1/rider/deliveries/'.$this->delivery->id;
    $result = $this->actingAs($this->rider)->getJson($details)->assertOk()->assertJsonPath('data.order.order_number', $this->order->order_number)->assertJsonPath('data.order.total', '100.00');
    expect((float) $result->json('data.pickup.latitude'))->toBe(14.6);
    expect((float) $result->json('data.destination.longitude'))->toBe(120.99);
    $result->assertJsonPath('data.items.0.item_name_snapshot', 'Original dish name')->assertJsonPath('data.items.0.line_total', '100.00')->assertJsonPath('data.items.0.description', 'Fresh noodles with vegetables.')->assertJsonPath('data.items.0.image_url', 'https://images.example.test/noodles.jpg');
    $this->mock(\App\Services\MapProviderService::class, function ($mock) {
        $mock->shouldReceive('route')->once()->with(14.6, 120.98, 14.62, 120.99, true)->andReturn(['geometry' => [[120.98, 14.6], [120.985, 14.61], [120.99, 14.62]], 'duration_minutes' => 7]);
    });
    $this->getJson($details.'/route')->assertOk()->assertJsonPath('data.kind', 'suggested_route')->assertJsonCount(3, 'data.geometry');
    $this->actingAs(reviewUser('rider'))->getJson($details)->assertNotFound();
    $this->getJson($details.'/route')->assertNotFound();
    $this->getJson($this->profileUrl)->assertNotFound();
    $this->actingAs($this->customer)->getJson($details)->assertForbidden();
    $this->getJson($details.'/route')->assertForbidden();
    $this->getJson('/api/v1/riders/'.$this->customer->id.'/profile')->assertNotFound();
    $this->actingAs(reviewUser('kitchen_staff'))->getJson($this->profileUrl)->assertNotFound();
});

it('paginates reviews and keeps legacy ratings masked with empty optional fields', function () {
    for ($index = 0; $index < 12; $index++) {
        $order = $this->order->replicate();
        $order->order_number = 'REVIEW'.uniqid();
        $order->save();
        $delivery = Delivery::create(['order_id' => $order->id, 'rider_user_id' => $this->rider->id, 'status' => 'delivered']);
        DB::table('delivery_ratings')->insert(['delivery_id' => $delivery->id, 'rider_user_id' => $this->rider->id, 'customer_id' => $this->customer->id, 'rating' => 5, 'created_at' => now(), 'updated_at' => now()]);
    }
    $this->actingAs($this->customer)->getJson($this->profileUrl)->assertOk()->assertJsonCount(10, 'data.reviews')->assertJsonPath('data.meta.last_page', 2)->assertJsonPath('data.summary.count', 12)->assertJsonPath('data.reviews.0.name_hidden', true)->assertJsonPath('data.reviews.0.categories', []);
    $this->getJson($this->profileUrl.'?page=2')->assertJsonCount(2, 'data.reviews');
});
