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
        $item = MenuItem::create(['category_id' => $category->id, 'name' => 'Demo Noodle Bowl', 'slug' => 'demo-noodle-bowl', 'base_price' => 100, 'discount_percent' => 0, 'is_active' => true, 'is_available' => true, 'is_sold_out' => false]);
        $customer = User::where('email', 'customer@example.test')->firstOrFail();
        $rider = User::where('email', 'rider@example.test')->firstOrFail();
        \App\Models\RiderProfile::updateOrCreate(['user_id' => $rider->id], ['vehicle_type' => 'motorcycle']);
        $order = \App\Models\Order::create(['order_number' => 'DF-REVIEW-DEMO', 'customer_id' => $customer->id, 'customer_name_snapshot' => $customer->name, 'order_type' => 'delivery', 'status' => 'completed', 'subtotal' => 100, 'total' => 120, 'delivery_fee' => 20, 'currency' => 'PHP', 'delivery_address' => 'Demo customer entrance', 'delivery_recipient_name' => $customer->name, 'delivery_phone' => '09123456789', 'delivery_instructions' => 'Please use the blue gate beside the entrance.', 'customer_notes' => 'Please pack the sauce separately. Thank you!', 'delivery_latitude' => 14.61, 'delivery_longitude' => 120.99]);
        $order->items()->create(['menu_item_id' => $item->id, 'category_id' => $category->id, 'item_name_snapshot' => $item->name, 'category_name_snapshot' => 'Mains', 'base_unit_price' => 100, 'quantity' => 1, 'line_total' => 100]);
        $delivery = \App\Models\Delivery::create(['order_id' => $order->id, 'rider_user_id' => $rider->id, 'status' => 'delivered', 'assigned_at' => now()->subMinutes(30), 'picked_up_at' => now()->subMinutes(15), 'delivered_at' => now()->subMinutes(10), 'pickup_address' => 'Demo restaurant', 'pickup_latitude' => 14.6, 'pickup_longitude' => 120.98]);
        foreach (['assigned', 'accepted', 'arrived_at_restaurant', 'picked_up', 'in_transit', 'delivered'] as $index => $status) {
            $event = $delivery->statusHistory()->create(['actor_id' => $rider->id, 'to_status' => $status]);
            $event->forceFill(['created_at' => now()->subMinutes(30 - $index * 4)])->save();
        }
        $floor = RestaurantFloor::create(['name' => 'Main Floor', 'slug' => 'main-floor', 'is_active' => true, 'is_published' => true]);
        $table = RestaurantTable::create(['floor_id' => $floor->id, 'table_number' => 'T1', 'qr_code' => (string) Str::uuid(), 'capacity' => 4, 'is_active' => true, 'operational_status' => 'available']);
        FloorPlanObject::create(['floor_id' => $floor->id, 'table_id' => $table->id, 'object_type' => 'table', 'label' => 'T1', 'position' => ['x' => 0, 'z' => 0], 'dimensions' => ['width' => 1.4, 'depth' => 1.2]]);
        RestaurantSetting::updateOrCreate(['key' => 'business_profile'], ['value' => ['restaurant_name' => 'DineFlow Demo', 'timezone' => 'UTC']]);
    }
}
