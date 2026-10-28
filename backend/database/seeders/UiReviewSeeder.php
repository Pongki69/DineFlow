<?php

namespace Database\Seeders;

use App\Models\Delivery;
use App\Models\DiningSession;
use App\Models\FloorPlanObject;
use App\Models\MenuCategory;
use App\Models\MenuItem;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Reservation;
use App\Models\RestaurantFloor;
use App\Models\RestaurantSetting;
use App\Models\RestaurantTable;
use App\Models\RiderProfile;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/** Populated UI fixtures restricted to the disposable acceptance database. */
class UiReviewSeeder extends Seeder
{
    public function run(): void
    {
        $reviewDatabase = realpath(base_path('../.local/acceptance.sqlite'));
        $activeDatabase = realpath((string) config('database.connections.sqlite.database'));
        if (! app()->environment('testing') || config('database.default') !== 'sqlite'
            || $reviewDatabase === false || $activeDatabase !== $reviewDatabase) {
            throw new \RuntimeException('UI review fixtures require the disposable acceptance SQLite database.');
        }
        $customer = User::where('email', 'customer@example.test')->firstOrFail();
        $waiter = User::where('email', 'waiter@example.test')->firstOrFail();
        $cashier = User::where('email', 'cashier@example.test')->firstOrFail();
        $rider = User::where('email', 'rider@example.test')->firstOrFail();
        $rider->update(['name' => 'Carlos Dela Cruz']);
        RestaurantSetting::updateOrCreate(['key' => 'business_profile'], ['value' => ['restaurant_name' => 'DineFlow Riverside Kitchen & Lounge', 'timezone' => 'Asia/Manila', 'brand_color' => '#1e4d3a', 'notifications_enabled' => true]]);
        $hours = array_fill_keys(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'], ['open' => '09:00', 'close' => '23:00', 'closed' => false]);
        RestaurantSetting::updateOrCreate(['key' => 'restaurant_location'], ['value' => ['name' => 'Riverside main branch', 'address' => '124 Riverside Avenue, Barangay San Antonio, Manila', 'latitude' => 14.5995, 'longitude' => 120.9842, 'phone' => '09171234567', 'contact_email' => 'hello@example.test', 'is_active' => true, 'opening_hours' => $hours]]);
        RestaurantSetting::updateOrCreate(['key' => 'delivery_policy'], ['value' => ['radius_km' => 8, 'minimum_order' => 100, 'base_fee' => 40, 'per_km_fee' => 5]]);
        $category = MenuCategory::where('slug', 'mains')->firstOrFail();
        $items = [MenuItem::where('slug', 'demo-noodle-bowl')->firstOrFail()];
        foreach ([['Grilled chicken inasal', 245], ['Truffle mushroom risotto', 380], ['Wood-fired margherita pizza', 450], ['Iced matcha oat latte', 165], ['Pistachio Basque cheesecake', 275], ['Roasted vegetable grain bowl', 295]] as $index => [$name, $price]) {
            $items[] = MenuItem::create(['category_id' => $category->id, 'name' => $name, 'slug' => 'review-'.Str::slug($name), 'description' => 'Prepared to order with seasonal ingredients. Ask our team about dietary preferences and available options.', 'base_price' => $price, 'is_active' => true, 'is_available' => true, 'is_sold_out' => false, 'sort_order' => $index + 1, 'servings' => 1]);
        }
        $floor = RestaurantFloor::firstOrFail();
        $tables = [RestaurantTable::firstOrFail()];
        foreach ([['T-02', 4, 'Main dining', 'occupied'], ['T-03', 4, 'Main dining', 'cleaning'], ['T-04', 6, 'Patio', 'available'], ['T-05', 8, 'VIP lounge', 'occupied'], ['T-06', 2, 'Patio', 'unavailable']] as $index => [$number,$capacity,$zone,$status]) {
            $table = RestaurantTable::create(['floor_id' => $floor->id, 'table_number' => $number, 'qr_code' => (string) Str::uuid(), 'capacity' => $capacity, 'zone' => $zone, 'is_active' => true, 'operational_status' => $status]);
            FloorPlanObject::create(['floor_id' => $floor->id, 'table_id' => $table->id, 'object_type' => 'table', 'label' => $number, 'position' => ['x' => ($index % 3) * 3, 'z' => 3 + intdiv($index, 3) * 3], 'dimensions' => ['width' => 1.4, 'depth' => 1.2]]);
            $tables[] = $table;
        }
        $sessions = [];
        foreach ([1 => 3, 4 => 7] as $index => $guests) {
            $sessions[$index] = DiningSession::create(['table_id' => $tables[$index]->id, 'opened_by' => $waiter->id, 'guest_count' => $guests, 'status' => 'open', 'opened_at' => now()->subMinutes($index === 1 ? 42 : 85)]);
        }
        $cases = [['delivery', 'preparing', 'accepted'], ['pickup', 'confirmed', null], ['dine_in', 'preparing', null], ['delivery', 'ready_to_serve', 'in_transit'], ['dine_in', 'served', null], ['pickup', 'ready_to_serve', null], ['delivery', 'confirmed', 'pending_assignment'], ['pickup', 'pending', null], ['dine_in', 'completed', null], ['pickup', 'cancelled', null]];
        foreach ($cases as $index => [$type,$status,$deliveryStatus]) {
            $tableIndex = $index === 4 ? 4 : 1;
            $subtotal = 245 + $index * 135;
            $order = Order::create(['order_number' => 'DF-VISUAL-'.str_pad((string) ($index + 1), 2, '0', STR_PAD_LEFT), 'customer_id' => $customer->id, 'customer_name_snapshot' => $index % 2 ? 'Alexandra Dela Cruz-Santos' : 'Jamie Rivera', 'order_type' => $type, 'status' => $status, 'subtotal' => $subtotal, 'total' => $subtotal, 'currency' => 'PHP', 'table_id' => $type === 'dine_in' ? $tables[$tableIndex]->id : null, 'table_number_snapshot' => $type === 'dine_in' ? $tables[$tableIndex]->table_number : null, 'dining_session_id' => $type === 'dine_in' && $status !== 'completed' ? $sessions[$tableIndex]->id : null, 'delivery_address' => 'Unit 407, Riverside Residences, 742 San Antonio Avenue, Manila', 'delivery_recipient_name' => 'Alexandra Dela Cruz-Santos', 'delivery_phone' => '09179876543', 'delivery_instructions' => 'Use the side entrance beside the blue gate. Please call on arrival.', 'delivery_latitude' => 14.613, 'delivery_longitude' => 120.994, 'prep_minutes' => 18, 'prep_ready_at' => now()->addMinutes($index === 0 ? -4 : 12), 'delivery_vehicle_class' => 'motorcycle', 'customer_notes' => $index === 0 ? 'Please pack sauce separately. One guest has a nut allergy; confirm with the kitchen before preparing.' : null]);
            $order->forceFill(['created_at' => now()->subMinutes(12 + $index * 5)])->save();
            foreach ([$items[($index + 1) % count($items)], $items[0]] as $line => $item) {
                $row = $order->items()->create(['menu_item_id' => $item->id, 'category_id' => $category->id, 'item_name_snapshot' => $item->name, 'category_name_snapshot' => 'Mains', 'variant_name_snapshot' => $line ? null : 'Large portion', 'base_unit_price' => $line ? 100 : $subtotal - 100, 'quantity' => 1, 'line_total' => $line ? 100 : $subtotal - 100, 'special_instructions' => $line ? 'No onions, please.' : null]);
                if (! $line) {
                    $row->addons()->create(['addon_name_snapshot' => 'Extra roasted vegetables', 'unit_price' => 0, 'quantity' => 1, 'line_total' => 0]);
                }
            }
            if ($deliveryStatus) {
                $assigned = $deliveryStatus !== 'pending_assignment';
                $delivery = Delivery::create(['order_id' => $order->id, 'rider_user_id' => $assigned ? $rider->id : null, 'status' => $deliveryStatus, 'assigned_at' => $assigned ? now()->subMinutes(15) : null, 'accepted_at' => $assigned ? now()->subMinutes(13) : null, 'picked_up_at' => $deliveryStatus === 'in_transit' ? now()->subMinutes(8) : null, 'pickup_address' => '124 Riverside Avenue, Manila', 'pickup_latitude' => 14.5995, 'pickup_longitude' => 120.9842, 'estimated_arrival_at' => now()->addMinutes($index === 3 ? -5 : 14), 'route_geometry' => ['type' => 'LineString', 'coordinates' => [[120.9842, 14.5995], [120.989, 14.606], [120.994, 14.613]]], 'last_routed_at' => now()]);
                $delivery->statusHistory()->create(['actor_id' => $assigned ? $rider->id : null, 'to_status' => $deliveryStatus]);
            }
            if (in_array($index, [5, 8], true)) {
                Payment::create(['order_id' => $order->id, 'purpose' => 'order', 'method' => $index === 5 ? 'cash' : 'card', 'status' => 'paid', 'amount' => $subtotal, 'currency' => 'PHP', 'reference_number' => 'VISUAL-PAY-'.($index + 1), 'received_by' => $index === 5 ? $cashier->id : null, 'paid_at' => now()->subMinutes(8)]);
            }
        }
        RiderProfile::updateOrCreate(['user_id' => $rider->id], ['vehicle_type' => 'motorcycle', 'is_online' => true, 'is_available' => false, 'latitude' => 14.6, 'longitude' => 120.985, 'accuracy_meters' => 15, 'located_at' => now()]);
        Reservation::create(['reference' => 'RSV-VISUAL', 'customer_id' => $customer->id, 'table_id' => $tables[3]->id, 'floor_id' => $floor->id, 'guest_name' => 'Alexandra Dela Cruz-Santos', 'guest_count' => 5, 'starts_at' => now()->addHours(2), 'ends_at' => now()->addHours(4), 'duration_minutes' => 120, 'buffer_minutes' => 15, 'status' => 'confirmed']);
    }
}
