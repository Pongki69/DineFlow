<?php

use App\Models\MenuCategory;
use App\Models\MenuItem;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('imports all forty dishes with the supplied categories, prices, portions and drink sizes', function () {
    $this->seed(\Database\Seeders\FilipinoMenuSeeder::class);
    expect(MenuCategory::count())->toBe(9)->and(MenuItem::count())->toBe(40);
    expect(MenuItem::where('name', 'Bulalo Special')->firstOrFail()->base_price)->toBe('580.00');
    expect(MenuItem::where('name', 'Sinigang na Baboy')->firstOrFail()->description)->toContain('Good for 2–3 pax.');
    expect(MenuItem::where('name', 'Pork Barbecue Skewers')->firstOrFail()->pieces)->toBe(3);
    expect(MenuItem::where('name', 'Turon ala Mode')->firstOrFail()->pieces)->toBe(2);
    expect(MenuItem::where('name', 'Tapsilog')->firstOrFail()->servings)->toBe(1);
    expect(MenuItem::where('name', 'Tapsilog')->firstOrFail()->description)->toContain('garlic fried rice');
    $sago = MenuItem::where('name', 'Sago’t Gulaman')->firstOrFail();
    expect((float) $sago->base_price + (float) $sago->variants()->where('name', 'Pitcher')->firstOrFail()->price_adjustment)->toBe(220.0);
    $beer = MenuItem::where('name', 'Red Horse Beer')->firstOrFail();
    expect((float) $beer->base_price + (float) $beer->variants()->where('name', 'Bucket of 5')->firstOrFail()->price_adjustment)->toBe(550.0);
});

it('can repeat the import without duplicating dishes or removing existing photos', function () {
    $this->seed(\Database\Seeders\FilipinoMenuSeeder::class);
    $dish = MenuItem::where('name', 'Bulalo Special')->firstOrFail();
    $dish->update(['image_source_url' => 'https://example.test/bulalo.jpg']);
    $this->seed(\Database\Seeders\FilipinoMenuSeeder::class);
    expect(MenuItem::count())->toBe(40)->and(MenuCategory::count())->toBe(9);
    expect($dish->fresh()->image_source_url)->toBe('https://example.test/bulalo.jpg');
});
