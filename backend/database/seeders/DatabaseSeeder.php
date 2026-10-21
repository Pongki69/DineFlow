<?php

namespace Database\Seeders;

use App\Models\RestaurantSetting;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call(AuthSeeder::class);
        foreach ([
            'service_charge_percent' => ['rate' => 0],
            'tax_percent' => ['rate' => 0],
            'delivery_fee' => ['amount' => 0],
        ] as $key => $value) RestaurantSetting::updateOrCreate(['key' => $key], ['value' => $value]);
    }
}
