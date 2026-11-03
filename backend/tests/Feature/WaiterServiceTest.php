<?php

use App\Models\MenuCategory;
use App\Models\MenuItem;
use App\Models\RestaurantFloor;
use App\Models\RestaurantTable;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\AuthSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->seed(AuthSeeder::class);
    $this->waiter = waiterUser('waiter');
    $floor = RestaurantFloor::create(['name' => 'Main', 'slug' => 'main-'.uniqid(), 'is_active' => true]);
    $this->table = RestaurantTable::create(['floor_id' => $floor->id, 'table_number' => 'Table 6', 'qr_code' => (string) Str::uuid(), 'capacity' => 4, 'is_active' => true, 'operational_status' => 'available']);
    $category = MenuCategory::create(['name' => 'Mains', 'slug' => 'waiter-mains', 'is_active' => true]);
    $this->dish = MenuItem::create(['category_id' => $category->id, 'name' => 'Adobo', 'slug' => 'waiter-adobo', 'base_price' => '150.00', 'is_active' => true, 'is_available' => true, 'is_sold_out' => false]);
});

function waiterUser(string $role): User
{
    $user = User::create(['name' => ucfirst($role).' Demo', 'email' => $role.'-'.uniqid().'@example.test', 'password' => Hash::make('Strong-Passphrase-922!'), 'is_active' => true]);
    $user->roles()->attach(Role::where('slug', $role)->firstOrFail());

    return $user;
}

it('seats a table and sends the waiter’s order straight to the kitchen', function () {
    $this->actingAs($this->waiter)->postJson("/api/v1/service/tables/{$this->table->id}/sessions", ['guest_count' => 3])->assertCreated();
    $order = $this->postJson('/api/v1/orders', [
        'order_type' => 'dine_in', 'table_code' => $this->table->qr_code,
        'items' => [['menu_item_id' => $this->dish->id, 'quantity' => 2, 'special_instructions' => 'No onions']],
    ])->assertCreated();
    $order->assertJsonPath('data.status', 'confirmed')->assertJsonPath('data.customer_name_snapshot', 'Table 6');
    // The waiter is not sent "your order" notifications for a table's order.
    expect($this->waiter->notifications()->count())->toBe(0);
    $kitchen = waiterUser('kitchen_staff');
    $this->actingAs($kitchen)->getJson('/api/v1/kitchen/orders')->assertOk()->assertJsonPath('data.0.order_number', $order->json('data.order_number'));
    $this->patchJson('/api/v1/orders/'.$order->json('data.id').'/status', ['status' => 'preparing'])->assertOk();
    expect($this->waiter->notifications()->count())->toBe(0);
});

it('summarises each seated table and lists the orders on its bill', function () {
    $this->actingAs($this->waiter)->postJson("/api/v1/service/tables/{$this->table->id}/sessions", ['guest_count' => 2])->assertCreated();
    $this->postJson('/api/v1/orders', ['order_type' => 'dine_in', 'table_code' => $this->table->qr_code, 'items' => [['menu_item_id' => $this->dish->id, 'quantity' => 1]]])->assertCreated();
    $tables = $this->getJson('/api/v1/service/tables')->assertOk();
    $row = collect($tables->json('data'))->firstWhere('id', $this->table->id);
    expect($row['operational_status'])->toBe('occupied')
        ->and($row['current_session']['service']['orders'])->toBe(1)
        ->and($row['current_session']['service']['in_kitchen'])->toBe(1)
        ->and((float) $row['current_session']['service']['balance_due'])->toBeGreaterThan(0);
    $session = $row['current_session']['id'];
    $this->getJson("/api/v1/service/dining-sessions/{$session}/orders")->assertOk()
        ->assertJsonPath('data.0.items.0.name', 'Adobo')->assertJsonPath('data.0.status', 'confirmed');
    $this->actingAs(waiterUser('customer'))->getJson("/api/v1/service/dining-sessions/{$session}/orders")->assertForbidden();
});
