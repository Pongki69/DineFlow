<?php

use App\Models\MenuCategory;
use App\Models\MenuItem;
use App\Models\MenuItemAddon;
use App\Models\RestaurantTable;
use App\Models\DiningSession;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->seed(\Database\Seeders\AuthSeeder::class);
});

function orderingUser(string $role): User
{
    $user = User::create(['name' => 'Order User', 'email' => $role.'-'.uniqid().'@example.test', 'password' => Hash::make('Strong-Passphrase-922!'), 'is_active' => true]);
    $user->roles()->attach(Role::where('slug', $role)->firstOrFail());
    return $user;
}

function orderableItem(array $overrides = []): MenuItem
{
    $category = MenuCategory::create(['name' => 'Mains', 'slug' => 'mains', 'is_active' => true]);
    return MenuItem::create($overrides + ['category_id' => $category->id, 'name' => 'Noodle Bowl', 'slug' => 'noodle-bowl', 'base_price' => '100.00', 'discount_percent' => '10.00', 'is_active' => true, 'is_available' => true, 'is_sold_out' => false]);
}

it('calculates prices on the server and preserves order item snapshots', function () {
    $customer = orderingUser('customer');
    $item = orderableItem();
    $addon = MenuItemAddon::create(['menu_item_id' => $item->id, 'name' => 'Egg', 'price' => '25.00', 'is_active' => true]);

    $response = $this->actingAs($customer)->postJson('/api/v1/orders', [
        'order_type' => 'pickup', 'items' => [['menu_item_id' => $item->id, 'addon_ids' => [$addon->id], 'quantity' => 2]],
    ]);
    $response->assertCreated()->assertJsonPath('data.subtotal', '250.00')->assertJsonPath('data.item_discount_total', '20.00')->assertJsonPath('data.total', '230.00');
    $order = \App\Models\Order::firstOrFail();
    $item->update(['name' => 'Renamed Dish', 'base_price' => '999.00']);
    expect($order->fresh()->items->first()->item_name_snapshot)->toBe('Noodle Bowl')
        ->and($order->fresh()->items->first()->base_unit_price)->toBe('100.00');
});

it('rejects unavailable menu items and prevents customers from reading other orders', function () {
    $customer = orderingUser('customer');
    $otherCustomer = orderingUser('customer');
    $item = orderableItem(['is_sold_out' => true]);
    $this->actingAs($customer)->postJson('/api/v1/orders', ['order_type' => 'pickup', 'items' => [['menu_item_id' => $item->id, 'quantity' => 1]]])->assertUnprocessable();

    $order = \App\Models\Order::create(['order_number' => 'DFTEST001', 'customer_id' => $otherCustomer->id, 'customer_name_snapshot' => $otherCustomer->name, 'order_type' => 'pickup', 'status' => 'pending', 'subtotal' => 100, 'item_discount_total' => 0, 'service_charge' => 0, 'delivery_fee' => 0, 'tax' => 0, 'total' => 100, 'currency' => 'PHP']);
    $this->actingAs($customer)->getJson('/api/v1/orders/'.$order->id)->assertNotFound();
});

it('supports multiple dine-in orders in one active dining session', function () {
    $customer = orderingUser('customer');
    $waiter = orderingUser('waiter');
    $item = orderableItem(['discount_percent' => 0]);
    $table = RestaurantTable::create(['table_number' => 'T-01', 'qr_code' => (string) \Illuminate\Support\Str::uuid(), 'capacity' => 4, 'is_active' => true]);
    $session = DiningSession::create(['table_id' => $table->id, 'opened_by' => $waiter->id, 'guest_count' => 2, 'status' => 'open', 'opened_at' => now()]);
    $payload = ['order_type' => 'dine_in', 'table_code' => $table->qr_code, 'items' => [['menu_item_id' => $item->id, 'quantity' => 1]]];

    $this->actingAs($customer)->postJson('/api/v1/orders', $payload)->assertCreated()->assertJsonPath('data.dining_session_id', $session->id);
    $this->actingAs($customer)->postJson('/api/v1/orders', $payload)->assertCreated()->assertJsonPath('data.dining_session_id', $session->id);
    expect($session->orders()->count())->toBe(2);
});

function orderingReservation(User $customer, RestaurantTable $table, string $status = 'checked_in'): \App\Models\Reservation
{
    return \App\Models\Reservation::create([
        'reference' => 'RSV'.strtoupper(uniqid()), 'customer_id' => $customer->id,
        'table_id' => $table->id, 'guest_name' => $customer->name, 'guest_count' => 2,
        'starts_at' => now(), 'ends_at' => now()->addMinutes(90), 'duration_minutes' => 90,
        'status' => $status,
    ]);
}

it('links a reservation reference to its dining session only after staff seats the party', function () {
    $customer = orderingUser('customer');
    $manager = orderingUser('manager');
    $item = orderableItem();
    $table = RestaurantTable::create(['table_number' => 'Booked-1', 'qr_code' => (string) \Illuminate\Support\Str::uuid(), 'capacity' => 4, 'is_active' => true]);
    $reservation = orderingReservation($customer, $table);
    $payload = ['order_type' => 'dine_in', 'table_code' => $reservation->reference, 'items' => [['menu_item_id' => $item->id, 'quantity' => 1]]];

    $this->actingAs($customer)->getJson('/api/v1/orders/dine-in-reservations')->assertOk()->assertJsonPath('data.0.ready', false);
    $this->postJson('/api/v1/orders', $payload)->assertUnprocessable()->assertJsonValidationErrors('table_code');
    $this->actingAs($manager)->patchJson('/api/v1/reservations/'.$reservation->id.'/status', ['status' => 'seated'])->assertOk();
    $session = DiningSession::where('reservation_id', $reservation->id)->firstOrFail();
    $this->actingAs($customer)->getJson('/api/v1/orders/dine-in-reservations')->assertOk()->assertJsonPath('data.0.ready', true);
    $this->postJson('/api/v1/orders', $payload)->assertCreated()->assertJsonPath('data.table_id', $table->id)->assertJsonPath('data.dining_session_id', $session->id);
});

it('keeps reservation ordering private and rejects inactive bookings or mismatched sessions', function () {
    $customer = orderingUser('customer');
    $other = orderingUser('customer');
    $item = orderableItem();
    $table = RestaurantTable::create(['table_number' => 'Booked-2', 'qr_code' => (string) \Illuminate\Support\Str::uuid(), 'capacity' => 4, 'is_active' => true]);
    $reservation = orderingReservation($customer, $table, 'seated');
    $payload = ['order_type' => 'dine_in', 'table_code' => $reservation->reference, 'items' => [['menu_item_id' => $item->id, 'quantity' => 1]]];
    $session = DiningSession::create(['table_id' => $table->id, 'opened_by' => $other->id, 'guest_count' => 2, 'status' => 'open', 'opened_at' => now()]);
    $this->actingAs($other)->getJson('/api/v1/orders/dine-in-reservations')->assertOk()->assertJsonCount(0, 'data');
    $this->postJson('/api/v1/orders', $payload)->assertUnprocessable();
    $this->actingAs($customer)->postJson('/api/v1/orders', $payload)->assertUnprocessable();
    $session->update(['reservation_id' => $reservation->id, 'status' => 'closed']);
    $this->postJson('/api/v1/orders', $payload)->assertUnprocessable();
    $session->update(['status' => 'open']);
    foreach (['pending', 'confirmed', 'checked_in', 'cancelled', 'completed', 'no_show'] as $status) {
        $reservation->update(['status' => $status]);
        $this->postJson('/api/v1/orders', $payload)->assertUnprocessable();
    }
    expect(\App\Models\Order::count())->toBe(0);
});

it('protects menu administration at the API boundary', function () {
    $customer = orderingUser('customer');
    $this->actingAs($customer)->postJson('/api/v1/menu/categories', ['name' => 'Hidden'])->assertForbidden();
    $manager = orderingUser('manager');
    $this->actingAs($manager)->postJson('/api/v1/menu/categories', ['name' => 'Beverages'])->assertCreated();
});

it('allows authenticated address lookup and validates coordinates', function () {
    \Illuminate\Support\Facades\Http::fake(['api.geoapify.com/v1/geocode/reverse*' => \Illuminate\Support\Facades\Http::response(['results' => [['formatted' => 'Restaurant address']]])]);
    config(['services.maps.provider' => 'geoapify', 'services.maps.geoapify_key' => 'test-key']);
    $this->actingAs(orderingUser('customer'))->getJson('/api/v1/maps/reverse?latitude=14.6&longitude=121')->assertOk();
    $this->actingAs(orderingUser('administrator'))->getJson('/api/v1/maps/reverse?latitude=91&longitude=121')->assertUnprocessable();
    $this->getJson('/api/v1/maps/reverse?latitude=14.6&longitude=121')->assertOk()->assertJsonPath('data.label', 'Restaurant address');
});

it('requires the reviewed dish list and restricts category deletion to menu managers', function () {
    $item = orderableItem();
    $customer = orderingUser('customer');
    $this->actingAs($customer)->deleteJson('/api/v1/menu/categories/'.$item->category_id)->assertForbidden();
    $manager = orderingUser('manager');
    $this->actingAs($manager)->getJson('/api/v1/menu/categories/'.$item->category_id.'/deletion-preview')
        ->assertOk()->assertJsonCount(1, 'data.dishes')->assertJsonPath('data.dishes.0.name', $item->name);
    $this->actingAs($manager)->deleteJson('/api/v1/menu/categories/'.$item->category_id)
        ->assertUnprocessable()->assertJsonValidationErrors('dish_ids');
    $item->update(['is_active' => false]);
    $this->deleteJson('/api/v1/menu/categories/'.$item->category_id, ['dish_ids' => []])->assertUnprocessable();
    expect(MenuCategory::find($item->category_id))->not->toBeNull();
    $this->deleteJson('/api/v1/menu/categories/'.$item->category_id, ['dish_ids' => [$item->id]])->assertNoContent();
    $this->assertSoftDeleted('menu_items', ['id' => $item->id]);
    $this->assertSoftDeleted('menu_categories', ['id' => $item->category_id]);
});

it('deletes categories after their dishes are removed while preserving historical references', function () {
    $manager = orderingUser('manager');
    $item = orderableItem();
    $categoryId = $item->category_id;
    $item->delete();
    $this->actingAs($manager)->deleteJson('/api/v1/menu/categories/'.$categoryId, ['dish_ids' => []])->assertNoContent();
    $this->assertSoftDeleted('menu_categories', ['id' => $categoryId]);
    $this->assertDatabaseHas('menu_items', ['id' => $item->id, 'category_id' => $categoryId]);
    $this->assertDatabaseHas('audit_logs', ['event' => 'menu.category_deleted', 'subject_id' => $categoryId]);
    $this->getJson('/api/v1/menu/categories')->assertOk()->assertJsonCount(0, 'data');
    $this->postJson('/api/v1/menu/items', ['name' => 'Invalid Category Dish', 'base_price' => 100, 'category_id' => $categoryId])
        ->assertUnprocessable()->assertJsonValidationErrors('category_id');
    $this->postJson('/api/v1/menu/categories', ['name' => 'Mains'])->assertCreated();
    expect(MenuCategory::count())->toBe(1);
});

it('preserves orders when a category and its dishes are deleted together', function () {
    $item = orderableItem();
    $customer = orderingUser('customer');
    $order = $this->actingAs($customer)->postJson('/api/v1/orders', ['order_type' => 'pickup', 'items' => [['menu_item_id' => $item->id, 'quantity' => 1]]]);
    $order->assertCreated();
    $manager = orderingUser('manager');
    $this->actingAs($manager)->deleteJson('/api/v1/menu/categories/'.$item->category_id, ['dish_ids' => [$item->id]])->assertNoContent();
    $this->actingAs($customer)->getJson('/api/v1/orders/'.$order->json('data.id'))->assertOk()->assertJsonPath('data.items.0.item_name_snapshot', 'Noodle Bowl');
});

it('saves optional dish piece and serving counts and allows clearing them', function () {
    $manager = orderingUser('manager');
    $item = orderableItem();
    $payload = ['category_id' => $item->category_id, 'name' => 'Party Platter', 'base_price' => 350];
    $response = $this->actingAs($manager)->postJson('/api/v1/menu/items', $payload + ['pieces' => 6, 'servings' => 2]);
    $response->assertCreated()->assertJsonPath('data.pieces', 6)->assertJsonPath('data.servings', 2);
    $id = $response->json('data.id');
    $this->putJson('/api/v1/menu/items/'.$id, $payload + ['pieces' => null, 'servings' => null])
        ->assertOk()->assertJsonPath('data.pieces', null)->assertJsonPath('data.servings', null);
    $this->postJson('/api/v1/menu/items', array_replace($payload, ['name' => 'Soup']))
        ->assertCreated()->assertJsonPath('data.pieces', null)->assertJsonPath('data.servings', null);
});

it('rejects invalid dish portion counts', function () {
    $manager = orderingUser('manager');
    $item = orderableItem();
    $payload = ['category_id' => $item->category_id, 'name' => 'Invalid Platter', 'base_price' => 100];
    $this->actingAs($manager)->postJson('/api/v1/menu/items', $payload + ['pieces' => 0, 'servings' => 1.5])
        ->assertUnprocessable()->assertJsonValidationErrors(['pieces', 'servings']);
    $this->postJson('/api/v1/menu/items', $payload + ['pieces' => 10000, 'servings' => -1])
        ->assertUnprocessable()->assertJsonValidationErrors(['pieces', 'servings']);
});

it('supports linked dish images and switching between links and uploaded photos', function () {
    \Illuminate\Support\Facades\Storage::fake('public');
    $manager = orderingUser('manager');
    $item = orderableItem();
    $payload = ['category_id' => $item->category_id, 'name' => 'Linked Dish', 'base_price' => 100];
    $url = 'https://images.example.test/dish.jpg';
    $this->actingAs($manager)->putJson('/api/v1/menu/items/'.$item->id, $payload + ['image_source_url' => $url])
        ->assertOk()->assertJsonPath('data.image_url', $url);
    $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFOsAAAAASUVORK5CYII=');
    $file = \Illuminate\Http\UploadedFile::fake()->createWithContent('dish.png', $png);
    $this->post('/api/v1/menu/items/'.$item->id, $payload + ['_method' => 'PUT', 'image' => $file], ['Accept' => 'application/json'])
        ->assertOk()->assertJsonPath('data.image_source_url', null);
    $path = $item->fresh()->image_path;
    \Illuminate\Support\Facades\Storage::disk('public')->assertExists($path);
    $this->putJson('/api/v1/menu/items/'.$item->id, $payload + ['image_source_url' => $url])
        ->assertOk()->assertJsonPath('data.image_path', null)->assertJsonPath('data.image_url', $url);
    \Illuminate\Support\Facades\Storage::disk('public')->assertMissing($path);
    $this->putJson('/api/v1/menu/items/'.$item->id, $payload + ['image_source_url' => 'javascript:alert(1)'])
        ->assertUnprocessable()->assertJsonValidationErrors('image_source_url');
    $this->putJson('/api/v1/menu/items/'.$item->id, $payload + ['image_source_url' => 'file:///tmp/dish.png'])
        ->assertUnprocessable()->assertJsonValidationErrors('image_source_url');
});

it('allows managers to delete dishes while preserving order history and blocking new orders', function () {
    $customer = orderingUser('customer');
    $manager = orderingUser('manager');
    $item = orderableItem();
    $this->actingAs($customer)->deleteJson('/api/v1/menu/items/'.$item->id)->assertForbidden();
    $order = $this->postJson('/api/v1/orders', ['order_type' => 'pickup', 'items' => [['menu_item_id' => $item->id, 'quantity' => 1]]]);
    $order->assertCreated();
    $this->actingAs($manager)->deleteJson('/api/v1/menu/items/'.$item->id)->assertNoContent();
    $this->assertSoftDeleted('menu_items', ['id' => $item->id]);
    $this->assertDatabaseHas('audit_logs', ['event' => 'menu.item_deleted', 'subject_id' => $item->id]);
    $this->getJson('/api/v1/menu/items')->assertOk()->assertJsonCount(0, 'data');
    $this->getJson('/api/v1/menu/items/'.$item->id)->assertNotFound();
    $this->actingAs($customer)->getJson('/api/v1/orders/'.$order->json('data.id'))
        ->assertOk()->assertJsonPath('data.items.0.item_name_snapshot', 'Noodle Bowl');
    $this->postJson('/api/v1/orders', ['order_type' => 'pickup', 'items' => [['menu_item_id' => $item->id, 'quantity' => 1]]])->assertUnprocessable();
});

