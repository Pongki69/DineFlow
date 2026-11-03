<?php

use App\Models\MenuCategory;
use App\Models\MenuItem;
use App\Models\Order;
use Database\Seeders\AuthSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->seed(AuthSeeder::class);
    $this->category = MenuCategory::create(['name' => 'Mains', 'slug' => 'mains', 'is_active' => true]);
});

function popularDish(string $name): MenuItem
{
    return MenuItem::create(['category_id' => test()->category->id, 'name' => $name, 'slug' => str($name)->slug().'-'.uniqid(), 'base_price' => '100.00', 'is_active' => true, 'is_available' => true, 'is_sold_out' => false]);
}

function sellDish(MenuItem $item, int $quantity, string $status = 'completed', ?string $at = null): void
{
    $order = Order::create(['order_number' => 'P-'.uniqid(), 'customer_name_snapshot' => 'Guest', 'order_type' => 'pickup', 'status' => $status, 'subtotal' => 100 * $quantity, 'total' => 100 * $quantity]);
    if ($at) {
        $order->forceFill(['created_at' => $at])->save();
    }
    $order->items()->create(['menu_item_id' => $item->id, 'item_name_snapshot' => $item->name, 'category_name_snapshot' => 'Mains', 'base_unit_price' => 100, 'quantity' => $quantity, 'line_total' => 100 * $quantity]);
}

it('ranks the best-selling dishes of the last 30 days on the public menu', function () {
    $adobo = popularDish('Adobo');
    $sinigang = popularDish('Sinigang');
    $once = popularDish('Ordered once');
    $old = popularDish('Old favourite');
    $cancelled = popularDish('Cancelled a lot');

    sellDish($adobo, 6);
    sellDish($sinigang, 4);
    sellDish($once, 1);
    sellDish($old, 9, 'completed', now()->subDays(45)->toDateTimeString());
    sellDish($cancelled, 9, 'cancelled');

    $ranks = collect($this->getJson('/api/v1/menu/items?per_page=60')->assertOk()->json('data'))->pluck('popular_rank', 'name');

    expect($ranks['Adobo'])->toBe(1)
        ->and($ranks['Sinigang'])->toBe(2)
        ->and($ranks['Ordered once'])->toBeNull()
        ->and($ranks['Old favourite'])->toBeNull()
        ->and($ranks['Cancelled a lot'])->toBeNull();
});

it('shows no popular dishes before anything has sold', function () {
    popularDish('Adobo');

    expect($this->getJson('/api/v1/menu/items')->assertOk()->json('data.0.popular_rank'))->toBeNull();
});
