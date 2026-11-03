<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Fills a local database with realistic demo records for every workspace:
 * orders, deliveries, rider history and reviews, payments, reservations,
 * notifications, saved addresses and staff. Lists get at least 25 rows so
 * pagination can be checked.
 *
 * Every row is tagged ("DEMO-" references, "@demo.dineflow.test" emails,
 * "demo": true in JSON, "Demo:" address notes), so it only adds data and
 * DemoDataCleanupSeeder removes exactly what this created. Running it again
 * replaces the previous demo rows.
 *
 *   php artisan db:seed --class=DemoDataSeeder
 *   php artisan db:seed --class=DemoDataCleanupSeeder
 */
class DemoDataSeeder extends Seeder
{
    private const ORDER_STATUS_STEPS = ['pending', 'confirmed', 'preparing', 'ready_to_serve', 'completed'];

    private const DELIVERY_STEPS = ['accepted', 'arrived_at_restaurant', 'picked_up', 'in_transit', 'delivered'];

    public function run(): void
    {
        if (app()->environment('production')) {
            throw new \RuntimeException('Demo data is for local databases only.');
        }

        (new DemoDataCleanupSeeder)->run();

        DB::transaction(function (): void {
            $now = now();
            $admin = $this->userWithRole('administrator');
            $customers = $this->usersWithRole('customer');
            $rider = $this->userWithRole('rider');
            if (! $admin || $customers->isEmpty() || ! $rider) {
                throw new \RuntimeException('Needs at least one administrator, customer and rider account.');
            }

            $location = json_decode((string) DB::table('restaurant_settings')->where('key', 'restaurant_location')->value('value'), true) ?: [];
            $pickup = [
                'lat' => (float) ($location['latitude'] ?? 14.1869),
                'lng' => (float) ($location['longitude'] ?? 121.2318),
                'address' => $location['address'] ?? 'Restaurant pickup',
            ];
            $menu = DB::table('menu_items')->whereNull('menu_items.deleted_at')->where('menu_items.is_active', true)
                ->join('menu_categories', 'menu_categories.id', '=', 'menu_items.category_id')
                ->whereNull('menu_categories.deleted_at')
                ->get(['menu_items.id', 'menu_items.name', 'menu_items.base_price', 'menu_items.category_id', 'menu_categories.name as category_name']);
            if ($menu->isEmpty()) {
                throw new \RuntimeException('Add some menu items before seeding demo orders.');
            }
            $tables = DB::table('restaurant_tables')->orderBy('id')->get(['id', 'table_number', 'capacity', 'floor_id', 'operational_status']);

            $staff = $this->seedStaff($now, $pickup);
            $this->seedAddresses($customers->first(), $now);

            // The first customer gets the full picture: 25 orders of every kind.
            $primary = $customers->first();
            $plan = array_merge(
                [['delivery', 'preparing', 'accepted'], ['delivery', 'ready_to_serve', 'picked_up'], ['delivery', 'confirmed', 'pending_assignment']],
                [['pickup', 'pending', null], ['pickup', 'preparing', null], ['dine_in', 'preparing', null]],
                array_fill(0, 14, ['delivery', 'completed', 'delivered']),
                array_fill(0, 3, ['pickup', 'completed', null]),
                [['delivery', 'cancelled', 'cancelled'], ['pickup', 'cancelled', null]],
            );
            $sequence = 1;
            $delivered = [];
            foreach ($plan as $index => [$type, $status, $deliveryStatus]) {
                // Some finished orders (and the refund) are from today, so the
                // cashier's "Today" view has real numbers.
                $today = ($index >= 6 && $index <= 11) || $index >= 20;
                $options = $today ? ['created_at' => $now->copy()->subMinutes(50 + ($index - 6) * 23)] : [];
                $result = $this->seedOrder($sequence++, $primary, $type, $status, $deliveryStatus, $index, $menu, $tables, $rider, $admin, $pickup, $now, $options);
                if ($deliveryStatus === 'delivered') {
                    $delivered[] = $result;
                }
            }
            // A second customer adds more finished trips, so the rider's history
            // and reviews pass 25 too.
            $secondary = $customers->skip(1)->first() ?? $primary;
            foreach (range(0, 12) as $index) {
                $failed = $index === 12;
                $result = $this->seedOrder($sequence++, $secondary, 'delivery', $failed ? 'cancelled' : 'completed', $failed ? 'failed' : 'delivered', $index + 30, $menu, $tables, $rider, $admin, $pickup, $now);
                if (! $failed) {
                    $delivered[] = $result;
                }
            }

            $sequence = $this->seedCashierData($sequence, $primary, $secondary, $menu, $tables, $rider, $admin, $staff, $pickup, $now);
            $this->seedRatings($delivered, $rider, $now);
            $this->seedReservations($primary, $tables, $now);
            $this->seedNotifications($primary, $rider, $admin, $now);
        });
    }

    private function userWithRole(string $slug): ?object
    {
        return $this->usersWithRole($slug)->first();
    }

    private function usersWithRole(string $slug)
    {
        return DB::table('users')
            ->join('role_user', 'role_user.user_id', '=', 'users.id')
            ->join('roles', 'roles.id', '=', 'role_user.role_id')
            ->where('roles.slug', $slug)->where('users.email', 'not like', '%@demo.dineflow.test')
            ->orderBy('users.id')->get(['users.id', 'users.name', 'users.email']);
    }

    /** 25 staff accounts across every role, so Team & access paginates. */
    private function seedStaff(Carbon $now, array $pickup): array
    {
        $roles = DB::table('roles')->pluck('id', 'slug');
        $names = ['Andrea Santos', 'Ben Villanueva', 'Carla Reyes', 'Dario Mendoza', 'Ella Cruz', 'Franco Bautista', 'Gia Navarro', 'Hector Ramos', 'Isabel Torres', 'Jomar Aquino', 'Kat Domingo', 'Leo Castillo', 'Mika Flores', 'Nico Garcia', 'Olive Pascual', 'Paolo Rivera', 'Queenie Lim', 'Rafael Tan', 'Sofia Mercado', 'Tomas Dizon', 'Uma Salazar', 'Vince Ocampo', 'Wena Valdez', 'Xander Robles', 'Yna Fernandez'];
        $cycle = ['manager', 'cashier', 'kitchen_staff', 'waiter', 'rider'];
        $password = Hash::make('Demo-Password-123!');
        $ids = [];
        foreach ($names as $index => $name) {
            $slug = $cycle[$index % count($cycle)];
            $id = DB::table('users')->insertGetId([
                'name' => $name,
                'email' => Str::slug($name, '.').'@demo.dineflow.test',
                'password' => $password,
                'is_active' => $index % 9 !== 8,
                'email_verified_at' => $now,
                'created_at' => $now->copy()->subDays(40 - $index),
                'updated_at' => $now,
            ]);
            DB::table('role_user')->insert(['user_id' => $id, 'role_id' => $roles[$slug]]);
            if ($slug === 'rider') {
                $online = $index % 2 === 0;
                DB::table('rider_profiles')->insert([
                    'user_id' => $id,
                    'phone' => '0917'.str_pad((string) (1000000 + $index * 4133), 7, '0', STR_PAD_LEFT),
                    'vehicle_type' => ['motorcycle', 'bicycle', 'car'][$index % 3],
                    'vehicle_plate' => 'DEMO '.(100 + $index),
                    'is_online' => $online,
                    'is_available' => $online,
                    'latitude' => $pickup['lat'] + (($index % 5) - 2) * 0.004,
                    'longitude' => $pickup['lng'] + (($index % 3) - 1) * 0.005,
                    'accuracy_meters' => 12,
                    'located_at' => $online ? $now->copy()->subMinutes($index % 4) : $now->copy()->subHours(5),
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
            $ids[] = $id;
        }

        return $ids;
    }

    private function seedAddresses(object $customer, Carbon $now): void
    {
        foreach ([['Work', 'UPLB Main Gate, Los Baños, Laguna', 14.1675, 121.2433], ['Mom\'s house', 'Purok 3, Brgy Bayog, Los Baños, Laguna', 14.1791, 121.2391], ['Gym', 'Lopez Avenue, Batong Malake, Los Baños', 14.1702, 121.2410]] as [$label, $address, $lat, $lng]) {
            DB::table('delivery_addresses')->insert([
                'user_id' => $customer->id,
                'label' => $label,
                'recipient_name' => $customer->name,
                'phone' => '09171234567',
                'formatted_address' => $address,
                'latitude' => $lat,
                'longitude' => $lng,
                'delivery_instructions' => 'Demo: call when outside.',
                'is_default' => false,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    private function seedOrder(int $sequence, object $customer, string $type, string $status, ?string $deliveryStatus, int $index, $menu, $tables, object $rider, object $admin, array $pickup, Carbon $now, array $options = []): array
    {
        $active = ! in_array($status, ['completed', 'cancelled'], true);
        $createdAt = $options['created_at'] ?? $active
            ? $now->copy()->subMinutes(8 + $index * 6)
            : $now->copy()->subDays(1 + intdiv($index, 2))->setTime(9 + $index % 8, ($index * 7) % 60);
        $lines = [];
        $subtotal = 0;
        foreach (range(0, $index % 3) as $line) {
            $item = $menu[($index * 3 + $line * 7) % $menu->count()];
            $quantity = 1 + ($index + $line) % 2;
            $lineTotal = round((float) $item->base_price * $quantity, 2);
            $subtotal += $lineTotal;
            $lines[] = [$item, $quantity, $lineTotal];
        }
        $deliveryFee = $type === 'delivery' ? 40 + ($index % 4) * 5 : 0;
        $total = $subtotal + $deliveryFee;
        $table = $type === 'dine_in' ? ($options['table'] ?? $tables->get($index % max(1, $tables->count()))) : null;
        $lat = $pickup['lat'] + (($index % 7) - 3) * 0.006;
        $lng = $pickup['lng'] + (($index % 5) - 2) * 0.007;
        $orderNumber = 'DEMO-'.str_pad((string) $sequence, 3, '0', STR_PAD_LEFT);
        $orderId = DB::table('orders')->insertGetId([
            'order_number' => $orderNumber,
            'customer_id' => $customer->id,
            'customer_name_snapshot' => $customer->name,
            'customer_email_snapshot' => $customer->email,
            'order_type' => $type,
            'status' => $status,
            'table_id' => $table?->id,
            'table_number_snapshot' => $table?->table_number,
            'dining_session_id' => $options['dining_session_id'] ?? null,
            'delivery_address' => $type === 'delivery' ? 'Demo street '.(10 + $index).', Los Baños, Laguna' : null,
            'delivery_recipient_name' => $type === 'delivery' ? $customer->name : null,
            'delivery_phone' => $type === 'delivery' ? '09171234567' : null,
            'delivery_instructions' => $type === 'delivery' && $index % 3 === 0 ? 'Leave with the guard if no one answers.' : null,
            'delivery_latitude' => $type === 'delivery' ? $lat : null,
            'delivery_longitude' => $type === 'delivery' ? $lng : null,
            'delivery_distance_km' => $type === 'delivery' ? round(1.2 + ($index % 6) * 0.7, 2) : null,
            'delivery_duration_minutes' => $type === 'delivery' ? 8 + $index % 12 : null,
            'customer_notes' => $index === 1 ? 'Peanut allergy, please use a clean pan.' : ($index % 5 === 0 ? 'Less spicy, please.' : null),
            'subtotal' => $subtotal,
            'item_discount_total' => 0,
            'service_charge' => 0,
            'delivery_fee' => $deliveryFee,
            'tax' => 0,
            'total' => $total,
            'currency' => 'PHP',
            'prep_minutes' => 15,
            'prep_ready_at' => $active ? $now->copy()->addMinutes(10) : $createdAt->copy()->addMinutes(18),
            'confirmed_at' => $status === 'pending' ? null : $createdAt->copy()->addMinutes(2),
            'completed_at' => $status === 'completed' ? $createdAt->copy()->addMinutes(45) : null,
            'cancelled_at' => $status === 'cancelled' ? $createdAt->copy()->addMinutes(6) : null,
            'created_at' => $createdAt,
            'updated_at' => $createdAt->copy()->addMinutes(45),
        ]);
        foreach ($lines as [$item, $quantity, $lineTotal]) {
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
                'created_at' => $createdAt,
                'updated_at' => $createdAt,
            ]);
        }
        // Order timeline up to the current status.
        $steps = match ($status) {
            'cancelled' => ['pending', 'cancelled'],
            'served' => ['pending', 'confirmed', 'preparing', 'ready_to_serve', 'served'],
            default => array_slice(self::ORDER_STATUS_STEPS, 0, array_search($status, self::ORDER_STATUS_STEPS, true) + 1),
        };
        $previous = null;
        foreach ($steps as $step => $value) {
            DB::table('order_status_history')->insert(['order_id' => $orderId, 'actor_id' => $admin->id, 'from_status' => $previous, 'to_status' => $value, 'note' => 'demo', 'created_at' => $createdAt->copy()->addMinutes($step * 6), 'updated_at' => $createdAt->copy()->addMinutes($step * 6)]);
            $previous = $value;
        }

        $deliveryId = null;
        if ($deliveryStatus) {
            $assigned = ! in_array($deliveryStatus, ['pending_assignment'], true);
            $reached = array_search($deliveryStatus, self::DELIVERY_STEPS, true);
            $at = fn (string $step) => $assigned && $reached !== false && array_search($step, self::DELIVERY_STEPS, true) <= $reached
                ? $createdAt->copy()->addMinutes(10 + array_search($step, self::DELIVERY_STEPS, true) * 7) : null;
            $deliveryId = DB::table('deliveries')->insertGetId([
                'order_id' => $orderId,
                'rider_user_id' => $assigned ? $rider->id : null,
                'status' => $deliveryStatus,
                'failure_reason' => $deliveryStatus === 'failed' ? 'Customer could not be reached at the address.' : null,
                'assigned_at' => $assigned ? $createdAt->copy()->addMinutes(8) : null,
                'accepted_at' => $at('accepted'),
                'picked_up_at' => $at('picked_up'),
                'delivered_at' => $deliveryStatus === 'delivered' ? $createdAt->copy()->addMinutes(38) : null,
                'cancelled_at' => in_array($deliveryStatus, ['cancelled', 'failed'], true) ? $createdAt->copy()->addMinutes(30) : null,
                'estimated_arrival_at' => $active ? $now->copy()->addMinutes(18) : $createdAt->copy()->addMinutes(38),
                'pickup_latitude' => $pickup['lat'],
                'pickup_longitude' => $pickup['lng'],
                'pickup_address' => $pickup['address'],
                'route_geometry' => json_encode(['type' => 'LineString', 'coordinates' => [[$pickup['lng'], $pickup['lat']], [($pickup['lng'] + $lng) / 2, ($pickup['lat'] + $lat) / 2 + 0.002], [$lng, $lat]]]),
                'last_routed_at' => $createdAt,
                'dispatch_status' => $assigned ? 'assigned' : 'searching',
                'created_at' => $createdAt,
                'updated_at' => $createdAt->copy()->addMinutes(40),
            ]);
            $history = $deliveryStatus === 'failed' ? ['accepted', 'arrived_at_restaurant', 'picked_up', 'in_transit', 'failed']
                : ($assigned && $reached !== false ? array_slice(self::DELIVERY_STEPS, 0, $reached + 1) : [$deliveryStatus]);
            $from = 'pending_assignment';
            foreach ($history as $step => $value) {
                $when = $createdAt->copy()->addMinutes(10 + $step * 7);
                DB::table('delivery_status_history')->insert(['delivery_id' => $deliveryId, 'actor_id' => $assigned ? $rider->id : null, 'from_status' => $from, 'to_status' => $value, 'reason' => 'demo', 'created_at' => $when, 'updated_at' => $when]);
                $from = $value;
            }
        }

        // Payments: finished orders are paid; one live delivery waits on an
        // online checkout; one cancelled order was refunded.
        if ($status === 'completed' && empty($options['unpaid'])) {
            $this->payment($orderId, $total, $type === 'pickup' ? 'cash' : ($index % 2 ? 'gcash' : 'card'), 'paid', $type === 'pickup' ? $admin->id : null, $createdAt->copy()->addMinutes(40), $sequence);
        } elseif ($status === 'preparing' && $type === 'delivery') {
            $this->payment($orderId, $total, 'gcash', 'pending', null, null, $sequence);
        } elseif ($status === 'cancelled' && $type === 'delivery' && $deliveryStatus === 'cancelled') {
            $this->payment($orderId, $total, 'card', 'refunded', null, $createdAt->copy()->addMinutes(3), $sequence);
        }

        return ['order_id' => $orderId, 'total' => $total, 'delivery_id' => $deliveryId, 'customer_id' => $customer->id, 'at' => $createdAt];
    }

    /** Dining bills, pickups waiting at the counter and failed online attempts. */
    private function seedCashierData(int $sequence, object $primary, object $secondary, $menu, $tables, object $rider, object $admin, array $staff, array $pickup, Carbon $now): int
    {
        $waiterId = DB::table('role_user')->join('roles', 'roles.id', '=', 'role_user.role_id')
            ->where('roles.slug', 'waiter')->whereIn('role_user.user_id', $staff)->value('role_user.user_id');
        $busy = DB::table('dining_sessions')->where('status', 'open')->pluck('table_id')->all();
        $free = $tables->reject(fn ($table) => in_array($table->id, $busy, true))->values();
        foreach ([[3, 2], [5, 3], [2, 2]] as $bill => [$guests, $orders]) {
            $table = $free->get($bill * 2);
            if (! $table) {
                break;
            }
            $opened = $now->copy()->subMinutes(40 + $bill * 25);
            $sessionId = DB::table('dining_sessions')->insertGetId(['table_id' => $table->id, 'opened_by' => $waiterId, 'guest_count' => $guests, 'status' => 'open', 'opened_at' => $opened, 'created_at' => $opened, 'updated_at' => $opened]);
            DB::table('restaurant_tables')->where('id', $table->id)->update(['operational_status' => 'occupied', 'updated_at' => $opened]);
            foreach (range(0, $orders - 1) as $round) {
                $this->seedOrder($sequence++, $bill === 1 ? $secondary : $primary, 'dine_in', $round === $orders - 1 && $bill === 1 ? 'ready_to_serve' : 'served', null, 60 + $bill * 3 + $round, $menu, $tables, $rider, $admin, $pickup, $now,
                    ['table' => $table, 'dining_session_id' => $sessionId, 'created_at' => $opened->copy()->addMinutes(4 + $round * 14)]);
            }
        }
        // Pickups waiting to be paid at the counter.
        $counter = [];
        foreach (['ready_to_serve', 'ready_to_serve', 'completed'] as $wait => $status) {
            $counter[] = $this->seedOrder($sequence++, $wait === 1 ? $secondary : $primary, 'pickup', $status, null, 80 + $wait, $menu, $tables, $rider, $admin, $pickup, $now,
                ['unpaid' => true, 'created_at' => $now->copy()->subMinutes(18 + $wait * 16)]);
        }
        // Online attempts that did not go through today.
        $this->payment($counter[0]['order_id'], $counter[0]['total'], 'online', 'failed', null, null, $sequence, '-A', $now->copy()->subMinutes(12));
        $this->payment($counter[1]['order_id'], $counter[1]['total'], 'online', 'expired', null, null, $sequence, '-B', $now->copy()->subMinutes(55));

        return $sequence;
    }

    private function payment(int $orderId, float $amount, string $method, string $status, ?int $receivedBy, ?Carbon $paidAt, int $sequence, string $suffix = '', ?Carbon $createdAt = null): void
    {
        DB::table('payments')->insert([
            'order_id' => $orderId,
            'purpose' => 'order',
            'method' => $method,
            'status' => $status,
            'amount' => $amount,
            'currency' => 'PHP',
            'reference_number' => 'DEMO-PAY-'.str_pad((string) $sequence, 3, '0', STR_PAD_LEFT).$suffix,
            'received_by' => $receivedBy,
            'paid_at' => $paidAt,
            'refunded_at' => $status === 'refunded' ? $paidAt?->copy()->addHour() : null,
            'expires_at' => $status === 'pending' ? now()->addMinutes(30) : null,
            'provider' => in_array($method, ['online', 'card', 'gcash'], true) ? 'paymongo' : null,
            'failure_reason' => $status === 'failed' ? 'The card was declined by the issuing bank.' : null,
            'created_at' => $createdAt ?? $paidAt ?? now(),
            'updated_at' => $createdAt ?? $paidAt ?? now(),
        ]);
    }

    private function seedRatings(array $delivered, object $rider, Carbon $now): void
    {
        $comments = [null, 'Fast and polite, food was still hot.', 'Called ahead, easy to find me.', null, 'Careful with the soup, nothing spilled.', 'A bit late but very friendly.', null, 'Great service as always!'];
        $categories = ['delivery_time', 'handling', 'communication', 'professionalism'];
        foreach (array_slice($delivered, 0, 25) as $index => $trip) {
            $rating = [5, 5, 4, 5, 3, 5, 4, 5, 2, 5][$index % 10];
            DB::table('delivery_ratings')->insert([
                'delivery_id' => $trip['delivery_id'],
                'rider_user_id' => $rider->id,
                'customer_id' => $trip['customer_id'],
                'rating' => $rating,
                'comment' => $comments[$index % count($comments)],
                'categories' => json_encode(array_slice($categories, $index % 3, 1 + $index % 3)),
                'show_name' => $index % 4 !== 0,
                'created_at' => $trip['at']->copy()->addHour(),
                'updated_at' => $trip['at']->copy()->addHour(),
            ]);
        }
    }

    /** 25 bookings: upcoming, today, past, cancelled and no-shows. */
    private function seedReservations(object $customer, $tables, Carbon $now): void
    {
        $plan = [];
        foreach (range(0, 24) as $index) {
            $dayOffset = $index - 10;
            $status = match (true) {
                $index % 11 === 3 => 'cancelled',
                $index % 13 === 5 => 'no_show',
                $dayOffset < 0 => 'completed',
                $dayOffset === 0 => 'confirmed',
                default => $index % 3 === 0 ? 'pending' : 'confirmed',
            };
            $plan[] = [$dayOffset, $status];
        }
        foreach ($plan as $index => [$dayOffset, $status]) {
            $guests = 2 + $index % 5;
            $table = $tables->first(fn ($table) => $table->capacity >= $guests && $table->id % 7 === $index % 7) ?? $tables->firstWhere('capacity', '>=', $guests) ?? $tables->first();
            $starts = $now->copy()->addDays($dayOffset)->setTime(10 + $index % 6, $index % 2 ? 30 : 0);
            $id = DB::table('reservations')->insertGetId([
                'reference' => 'DEMO-RSV-'.str_pad((string) ($index + 1), 3, '0', STR_PAD_LEFT),
                'customer_id' => $customer->id,
                'table_id' => $table?->id,
                'floor_id' => $table?->floor_id,
                'guest_name' => $customer->name,
                'guest_email' => $customer->email,
                'guest_phone' => '09171234567',
                'guest_count' => $guests,
                'starts_at' => $starts,
                'ends_at' => $starts->copy()->addMinutes(90),
                'duration_minutes' => 90,
                'buffer_minutes' => 30,
                'status' => $status,
                'notes' => $index % 6 === 0 ? 'Birthday dinner, a small cake would be lovely.' : null,
                'cancelled_at' => $status === 'cancelled' ? $starts->copy()->subDay() : null,
                'checked_in_at' => $status === 'completed' ? $starts : null,
                'seated_at' => $status === 'completed' ? $starts->copy()->addMinutes(5) : null,
                'created_at' => $starts->copy()->subDays(3),
                'updated_at' => $starts->copy()->subDays(3),
            ]);
            if ($table) {
                DB::table('reservation_tables')->insert(['reservation_id' => $id, 'table_id' => $table->id, 'created_at' => $now, 'updated_at' => $now]);
            }
            DB::table('reservation_status_history')->insert(['reservation_id' => $id, 'actor_id' => null, 'from_status' => null, 'to_status' => $status, 'note' => 'demo', 'created_at' => $starts->copy()->subDays(3), 'updated_at' => $starts->copy()->subDays(3)]);
        }
        $this->seedArrivals($customer, $tables, $now);
    }

    /** Two parties due in the next few hours, on free tables, for the waiter's floor. */
    private function seedArrivals(object $customer, $tables, Carbon $now): void
    {
        $busy = DB::table('dining_sessions')->where('status', 'open')->pluck('table_id')->all();
        $free = $tables->reject(fn ($table) => in_array($table->id, $busy, true))->values();
        foreach ([[40, 2, 'Alyssa Cruz'], [125, 4, 'Miguel Torres']] as $index => [$minutes, $guests, $name]) {
            $table = $free->first(fn ($table) => $table->capacity >= $guests && $table->operational_status === 'available' && ! in_array($table->id, $busy, true));
            if (! $table) {
                return;
            }
            $busy[] = $table->id;
            $starts = $now->copy()->addMinutes($minutes)->second(0);
            $id = DB::table('reservations')->insertGetId([
                'reference' => 'DEMO-RSV-'.str_pad((string) (26 + $index), 3, '0', STR_PAD_LEFT),
                'customer_id' => $customer->id, 'table_id' => $table->id, 'floor_id' => $table->floor_id,
                'guest_name' => $name, 'guest_email' => $customer->email, 'guest_phone' => '09171234567',
                'guest_count' => $guests, 'starts_at' => $starts, 'ends_at' => $starts->copy()->addMinutes(90),
                'duration_minutes' => 90, 'buffer_minutes' => 30, 'status' => 'confirmed',
                'notes' => $index === 0 ? 'Window seat if possible.' : null,
                'created_at' => $now->copy()->subDay(), 'updated_at' => $now->copy()->subDay(),
            ]);
            DB::table('reservation_tables')->insert(['reservation_id' => $id, 'table_id' => $table->id, 'created_at' => $now, 'updated_at' => $now]);
            DB::table('reservation_status_history')->insert(['reservation_id' => $id, 'actor_id' => null, 'from_status' => null, 'to_status' => 'confirmed', 'note' => 'demo', 'created_at' => $now, 'updated_at' => $now]);
        }
    }

    private function seedNotifications(object $customer, object $rider, object $admin, Carbon $now): void
    {
        $orders = DB::table('orders')->where('order_number', 'like', 'DEMO-%')->where('customer_id', $customer->id)->orderBy('id')->get(['id', 'order_number', 'status']);
        foreach ($orders->take(25) as $index => $order) {
            $this->notify($customer->id, 'order.status_changed', 'Order update', 'Order '.$order->order_number.' is now '.str_replace('_', ' ', $order->status).'.', ['order_id' => $order->id, 'order_number' => $order->order_number], $now->copy()->subMinutes($index * 37), $index > 3);
        }
        foreach (range(1, 8) as $index) {
            $this->notify($rider->id, 'delivery.assigned', 'Delivery assigned', 'A demo delivery has been assigned to you.', [], $now->copy()->subHours($index), $index > 2);
            $this->notify($admin->id, 'delivery.dispatch_exhausted', 'No rider accepted', 'Review a demo delivery and assign a rider.', [], $now->copy()->subHours($index * 2), $index > 2);
        }
    }

    private function notify(int $userId, string $event, string $title, string $message, array $context, Carbon $at, bool $read): void
    {
        DB::table('notifications')->insert([
            'id' => (string) Str::uuid(),
            'type' => 'App\\Notifications\\RestaurantUpdateNotification',
            'notifiable_type' => 'App\\Models\\User',
            'notifiable_id' => $userId,
            'data' => json_encode(['event' => $event, 'title' => $title, 'message' => $message, 'context' => $context, 'demo' => true]),
            'read_at' => $read ? $at->copy()->addMinutes(5) : null,
            'created_at' => $at,
            'updated_at' => $at,
        ]);
    }
}
