<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * A busy service for the kitchen queue, timed from "now": ten or more
 * tickets in each stage - waiting, cooking (with time left, due soon and
 * running over), and ready for handoff - across dine-in, pickup and
 * delivery, with notes, an allergy and dishes already ticked off.
 *
 * Tickets are "DEMO-K…" orders, so DemoDataCleanupSeeder removes them with
 * the rest of the demo data, and running this again replaces only them.
 *
 *   php artisan db:seed --class=KitchenDemoSeeder
 */
class KitchenDemoSeeder extends Seeder
{
    /**
     * [type, status, minutes since ordered, prep ready in (minutes, negative
     * is over), ready since (minutes ago), dishes, dishes done, note, rider].
     */
    private const TICKETS = [
        // Waiting: just in, due soon, and late (20 minutes and more).
        ['dine_in', 'confirmed', 2, null, null, 2, 0, null, null],
        ['pickup', 'confirmed', 4, null, null, 1, 0, null, null],
        ['delivery', 'confirmed', 6, null, null, 3, 0, null, 'pending_assignment'],
        ['dine_in', 'confirmed', 8, null, null, 2, 0, 'Birthday, please bring a candle with dessert.', null],
        ['pickup', 'confirmed', 11, null, null, 2, 0, null, null],
        ['delivery', 'confirmed', 13, null, null, 2, 0, null, 'pending_assignment'],
        ['dine_in', 'confirmed', 16, null, null, 4, 0, null, null],
        ['pickup', 'confirmed', 21, null, null, 2, 0, 'Less spicy, please.', null],
        ['delivery', 'confirmed', 25, null, null, 3, 0, null, 'accepted'],
        ['dine_in', 'confirmed', 28, null, null, 1, 0, null, null],
        // Preparing: plenty of time, due soon, and over the estimate.
        ['dine_in', 'preparing', 5, 14, null, 2, 0, null, null],
        ['pickup', 'preparing', 7, 12, null, 2, 1, null, null],
        ['delivery', 'preparing', 9, 10, null, 3, 1, null, 'accepted'],
        ['dine_in', 'preparing', 12, 8, null, 3, 1, 'Peanut allergy, please use a clean pan.', null],
        ['dine_in', 'preparing', 14, 6, null, 2, 0, null, null],
        ['pickup', 'preparing', 15, 3, null, 2, 1, null, null],
        ['delivery', 'preparing', 18, 2, null, 2, 1, null, 'arrived_at_restaurant'],
        ['dine_in', 'preparing', 21, 1, null, 4, 3, null, null],
        ['pickup', 'preparing', 26, -3, null, 2, 1, null, null],
        ['delivery', 'preparing', 30, -6, null, 3, 2, null, 'arrived_at_restaurant'],
        ['dine_in', 'preparing', 34, -9, null, 2, 0, 'Sauce on the side for the whole table.', null],
        // Ready: handed off within the last half hour (the board keeps 30 minutes).
        ['dine_in', 'ready_to_serve', 12, null, 1, 2, 2, null, null],
        ['pickup', 'ready_to_serve', 15, null, 2, 1, 1, null, null],
        ['delivery', 'ready_to_serve', 17, null, 3, 2, 2, null, 'accepted'],
        ['dine_in', 'ready_to_serve', 20, null, 4, 3, 3, null, null],
        ['pickup', 'ready_to_serve', 22, null, 6, 2, 2, null, null],
        ['delivery', 'ready_to_serve', 25, null, 8, 2, 2, null, 'arrived_at_restaurant'],
        ['dine_in', 'ready_to_serve', 28, null, 11, 1, 1, null, null],
        ['pickup', 'ready_to_serve', 31, null, 14, 3, 3, null, null],
        ['delivery', 'ready_to_serve', 35, null, 18, 2, 2, null, 'accepted'],
        ['dine_in', 'ready_to_serve', 40, null, 23, 2, 2, null, null],
    ];

    private const ITEM_NOTES = ['No onions, please.', 'Sauce on the side.', 'Extra crispy.'];

    public function run(): void
    {
        if (app()->environment('production')) {
            throw new \RuntimeException('Demo data is for local databases only.');
        }

        DB::transaction(function (): void {
            $this->clear();
            $now = now();
            $admin = DB::table('users')->join('role_user', 'role_user.user_id', '=', 'users.id')
                ->join('roles', 'roles.id', '=', 'role_user.role_id')->where('roles.slug', 'administrator')
                ->orderBy('users.id')->first(['users.id', 'users.name', 'users.email']);
            $customer = DB::table('users')->join('role_user', 'role_user.user_id', '=', 'users.id')
                ->join('roles', 'roles.id', '=', 'role_user.role_id')->where('roles.slug', 'customer')
                ->where('users.email', 'not like', '%@demo.dineflow.test')
                ->orderBy('users.id')->first(['users.id', 'users.name', 'users.email']) ?? $admin;
            $rider = DB::table('users')->join('role_user', 'role_user.user_id', '=', 'users.id')
                ->join('roles', 'roles.id', '=', 'role_user.role_id')->where('roles.slug', 'rider')
                ->orderBy('users.id')->value('users.id');
            if (! $admin) {
                throw new \RuntimeException('Needs an administrator account.');
            }
            $menu = DB::table('menu_items')->whereNull('menu_items.deleted_at')->where('menu_items.is_active', true)
                ->join('menu_categories', 'menu_categories.id', '=', 'menu_items.category_id')
                ->whereNull('menu_categories.deleted_at')->orderBy('menu_items.id')
                ->get(['menu_items.id', 'menu_items.name', 'menu_items.base_price', 'menu_items.category_id', 'menu_categories.name as category_name']);
            if ($menu->isEmpty()) {
                throw new \RuntimeException('Add some menu items before seeding kitchen tickets.');
            }
            $tables = DB::table('restaurant_tables')->orderBy('id')->get(['id', 'table_number']);
            $location = json_decode((string) DB::table('restaurant_settings')->where('key', 'restaurant_location')->value('value'), true) ?: [];
            $pickup = [
                'lat' => (float) ($location['latitude'] ?? 14.1869),
                'lng' => (float) ($location['longitude'] ?? 121.2318),
                'address' => $location['address'] ?? 'Restaurant pickup',
            ];

            foreach (self::TICKETS as $index => $ticket) {
                $this->ticket($index, $ticket, $now, $admin, $customer, $rider, $menu, $tables, $pickup);
            }
        });
    }

    /** Removes only the tickets this seeder made before. */
    private function clear(): void
    {
        $orderIds = DB::table('orders')->where('order_number', 'like', 'DEMO-K%')->pluck('id');
        $deliveryIds = DB::table('deliveries')->whereIn('order_id', $orderIds)->pluck('id');
        DB::table('delivery_status_history')->whereIn('delivery_id', $deliveryIds)->delete();
        DB::table('dispatch_offers')->whereIn('delivery_id', $deliveryIds)->delete();
        DB::table('delivery_location_updates')->whereIn('delivery_id', $deliveryIds)->delete();
        DB::table('deliveries')->whereIn('id', $deliveryIds)->delete();
        DB::table('order_status_history')->whereIn('order_id', $orderIds)->delete();
        $itemIds = DB::table('order_items')->whereIn('order_id', $orderIds)->pluck('id');
        DB::table('order_item_addons')->whereIn('order_item_id', $itemIds)->delete();
        DB::table('order_items')->whereIn('id', $itemIds)->delete();
        DB::table('orders')->whereIn('id', $orderIds)->delete();
    }

    /** Ticket indexes the pass has pinned (DEMO-K04 and DEMO-K12). */
    private const PINNED = [3, 11];

    private function ticket(int $index, array $ticket, Carbon $now, object $admin, object $customer, ?int $rider, $menu, $tables, array $pickup): void
    {
        [$type, $status, $age, $prepIn, $readyAgo, $dishes, $done, $note, $deliveryStatus] = $ticket;
        $createdAt = $now->copy()->subMinutes($age);
        $confirmedAt = $createdAt->copy()->addMinute();
        $startedAt = $createdAt->copy()->addMinutes(3);
        $readyAt = $readyAgo !== null ? $now->copy()->subMinutes($readyAgo) : null;
        $table = $type === 'dine_in' ? $tables->get(($index * 3) % max(1, $tables->count())) : null;

        $lines = [];
        $subtotal = 0;
        foreach (range(0, $dishes - 1) as $line) {
            $item = $menu[($index * 5 + $line * 3) % $menu->count()];
            $quantity = 1 + ($index + $line) % 3 % 2;
            $lineTotal = round((float) $item->base_price * $quantity, 2);
            $subtotal += $lineTotal;
            $lines[] = [$item, $quantity, $lineTotal, $line < $done];
        }
        $deliveryFee = $type === 'delivery' ? 45 : 0;
        $lat = $pickup['lat'] + (($index % 5) - 2) * 0.006;
        $lng = $pickup['lng'] + (($index % 4) - 1) * 0.007;

        $orderId = DB::table('orders')->insertGetId([
            'order_number' => 'DEMO-K'.str_pad((string) ($index + 1), 2, '0', STR_PAD_LEFT),
            'customer_id' => $customer->id,
            'customer_name_snapshot' => $customer->name,
            'customer_email_snapshot' => $customer->email,
            'order_type' => $type,
            'status' => $status,
            'table_id' => $table?->id,
            'table_number_snapshot' => $table?->table_number,
            'delivery_address' => $type === 'delivery' ? 'Demo street '.(20 + $index).', Los Baños, Laguna' : null,
            'delivery_recipient_name' => $type === 'delivery' ? $customer->name : null,
            'delivery_phone' => $type === 'delivery' ? '09171234567' : null,
            'delivery_latitude' => $type === 'delivery' ? $lat : null,
            'delivery_longitude' => $type === 'delivery' ? $lng : null,
            'delivery_distance_km' => $type === 'delivery' ? 2.4 : null,
            'delivery_duration_minutes' => $type === 'delivery' ? 12 : null,
            'customer_notes' => $note,
            'subtotal' => $subtotal,
            'item_discount_total' => 0,
            'service_charge' => 0,
            'delivery_fee' => $deliveryFee,
            'tax' => 0,
            'total' => $subtotal + $deliveryFee,
            'currency' => 'PHP',
            'prep_minutes' => 15,
            'prep_ready_at' => $prepIn !== null ? $now->copy()->addMinutes($prepIn) : null,
            'delivery_vehicle_class' => 'motorcycle',
            // The pass has pinned the birthday table and one pickup to the top.
            'kitchen_pinned_at' => in_array($index, self::PINNED, true) ? $now->copy()->subMinute() : null,
            'confirmed_at' => $confirmedAt,
            'created_at' => $createdAt,
            'updated_at' => $readyAt ?? $now,
        ]);

        foreach ($lines as $position => [$item, $quantity, $lineTotal, $isDone]) {
            DB::table('order_items')->insert([
                'order_id' => $orderId,
                'menu_item_id' => $item->id,
                'category_id' => $item->category_id,
                'item_name_snapshot' => $item->name,
                'category_name_snapshot' => $item->category_name,
                'base_unit_price' => $item->base_price,
                'variant_price_adjustment' => 0,
                'discount_percent' => 0,
                'discount_total' => 0,
                'quantity' => $quantity,
                'line_total' => $lineTotal,
                // Every third ticket's first dish carries a cook's note.
                'special_instructions' => $position === 0 && $index % 3 === 0 ? self::ITEM_NOTES[$index % 3 === 0 ? intdiv($index, 3) % 3 : 0] : null,
                'prepared_at' => $isDone ? ($readyAt ?? $now->copy()->subMinutes(2 + $position)) : null,
                'created_at' => $createdAt,
                'updated_at' => $createdAt,
            ]);
        }

        // Status timeline, so "ready since" and the history read true.
        $steps = [['pending', 'confirmed', $confirmedAt]];
        if (in_array($status, ['preparing', 'ready_to_serve'], true)) {
            $steps[] = ['confirmed', 'preparing', $startedAt];
        }
        if ($status === 'ready_to_serve') {
            $steps[] = ['preparing', 'ready_to_serve', $readyAt];
        }
        DB::table('order_status_history')->insert(['order_id' => $orderId, 'actor_id' => $admin->id, 'from_status' => null, 'to_status' => 'pending', 'note' => 'demo', 'created_at' => $createdAt, 'updated_at' => $createdAt]);
        foreach ($steps as [$from, $to, $at]) {
            DB::table('order_status_history')->insert(['order_id' => $orderId, 'actor_id' => $admin->id, 'from_status' => $from, 'to_status' => $to, 'note' => 'demo', 'created_at' => $at, 'updated_at' => $at]);
        }

        if ($deliveryStatus) {
            $assigned = $deliveryStatus !== 'pending_assignment' && $rider;
            $deliveryId = DB::table('deliveries')->insertGetId([
                'order_id' => $orderId,
                'rider_user_id' => $assigned ? $rider : null,
                'status' => $assigned ? $deliveryStatus : 'pending_assignment',
                'assigned_at' => $assigned ? $createdAt->copy()->addMinutes(4) : null,
                'accepted_at' => $assigned ? $createdAt->copy()->addMinutes(5) : null,
                'estimated_arrival_at' => $now->copy()->addMinutes(20),
                'pickup_latitude' => $pickup['lat'],
                'pickup_longitude' => $pickup['lng'],
                'pickup_address' => $pickup['address'],
                'dispatch_status' => $assigned ? 'assigned' : 'searching',
                'created_at' => $createdAt,
                'updated_at' => $now,
            ]);
            DB::table('delivery_status_history')->insert(['delivery_id' => $deliveryId, 'actor_id' => $assigned ? $rider : null, 'from_status' => 'pending_assignment', 'to_status' => $assigned ? $deliveryStatus : 'pending_assignment', 'reason' => 'demo', 'created_at' => $createdAt->copy()->addMinutes(5), 'updated_at' => $createdAt->copy()->addMinutes(5)]);
        }
    }
}
