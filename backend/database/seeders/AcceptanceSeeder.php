<?php

namespace Database\Seeders;

use App\Models\FloorPlanObject;
use App\Models\MenuCategory;
use App\Models\MenuItem;
use App\Models\RestaurantFloor;
use App\Models\RestaurantSetting;
use App\Models\RestaurantTable;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class AcceptanceSeeder extends Seeder
{
    public function run(): void
    {
        if (! app()->environment('testing')) {
            throw new \RuntimeException('Acceptance fixtures may only be seeded in the testing environment.');
        }
        $this->call(DatabaseSeeder::class);
        foreach (['customer', 'administrator', 'cashier', 'kitchen_staff', 'waiter', 'rider', 'manager'] as $role) {
            $user = User::create(['name' => ucfirst($role).' Demo', 'email' => $role.'@example.test', 'password' => 'Acceptance-Password-123!', 'is_active' => true]);
            $user->roles()->attach(Role::where('slug', $role)->firstOrFail());
        }
        $category = MenuCategory::create(['name' => 'Mains', 'slug' => 'mains', 'is_active' => true]);
        MenuItem::create(['category_id' => $category->id, 'name' => 'Demo Noodle Bowl', 'slug' => 'demo-noodle-bowl', 'base_price' => 100, 'discount_percent' => 0, 'is_active' => true, 'is_available' => true, 'is_sold_out' => false]);
        $floor = RestaurantFloor::create(['name' => 'Main Floor', 'slug' => 'main-floor', 'is_active' => true, 'is_published' => true]);
        $table = RestaurantTable::create(['floor_id' => $floor->id, 'table_number' => 'T1', 'qr_code' => (string) Str::uuid(), 'capacity' => 4, 'is_active' => true, 'operational_status' => 'available']);
        FloorPlanObject::create(['floor_id' => $floor->id, 'table_id' => $table->id, 'object_type' => 'table', 'label' => 'T1', 'position' => ['x' => 0, 'z' => 0], 'dimensions' => ['width' => 1.4, 'depth' => 1.2]]);
        RestaurantSetting::updateOrCreate(['key' => 'business_profile'], ['value' => ['restaurant_name' => 'DineFlow Demo', 'timezone' => 'UTC']]);
    }
}
