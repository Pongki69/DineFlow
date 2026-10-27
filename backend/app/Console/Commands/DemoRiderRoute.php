<?php

namespace App\Console\Commands;

use App\Models\Delivery;
use App\Models\Order;
use App\Models\User;
use App\Services\DeliveryQuoteService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class DemoRiderRoute extends Command
{
    protected $signature = 'demo:rider-route {--rider= : Rider user ID} {--remove : Remove only these 23 demo orders and deliveries}';
    protected $description = 'Create or remove 23 temporary local route-preview deliveries';
    private const MARKER = 'Temporary rider route preview d676-demo-v1';
    private const NUMBERS = [
        'DEMO-ROUTE-01', 'DEMO-ROUTE-02', 'DEMO-ROUTE-03',
        'DEMO-ROUTE-04', 'DEMO-ROUTE-05', 'DEMO-ROUTE-06',
        'DEMO-ROUTE-07', 'DEMO-ROUTE-08', 'DEMO-ROUTE-09',
        'DEMO-ROUTE-10', 'DEMO-ROUTE-11', 'DEMO-ROUTE-12',
        'DEMO-ROUTE-13', 'DEMO-ROUTE-14', 'DEMO-ROUTE-15',
        'DEMO-ROUTE-16', 'DEMO-ROUTE-17', 'DEMO-ROUTE-18',
        'DEMO-ROUTE-19', 'DEMO-ROUTE-20', 'DEMO-ROUTE-21',
        'DEMO-ROUTE-22', 'DEMO-ROUTE-23',
    ];

    public function handle(): int
    {
        if (! app()->environment(['local', 'testing'])) {
            $this->error('Route preview data is available only in local or testing environments.');
            return self::FAILURE;
        }
        if ($this->option('remove')) {
            DB::transaction(function () {
                $orders = Order::whereIn('order_number', self::NUMBERS)->where('customer_notes', self::MARKER)->lockForUpdate()->get();
                foreach ($orders as $order) {
                    // Restrict deletion to the marked disposable preview records.
                    Delivery::where('order_id', $order->id)->delete();
                    $order->delete();
                }
                $this->info('Removed '.$orders->count().' temporary route-preview orders and their deliveries.');
            });
            return self::SUCCESS;
        }
        $query = User::where('is_active', true)->whereHas('roles', fn ($q) => $q->where('slug', 'rider'));
        if ($this->option('rider')) $query->whereKey($this->option('rider'));
        $riders = $query->get();
        if ($riders->count() !== 1) {
            $this->error('Choose one active rider with --rider=ID.');
            return self::FAILURE;
        }
        $rider = $riders->first();
        $pickup = app(DeliveryQuoteService::class)->location();
        if (! isset($pickup['latitude'], $pickup['longitude'])) {
            $existingPickup = Delivery::whereNotNull('pickup_latitude')
                ->whereNotNull('pickup_longitude')
                ->latest('assigned_at')
                ->first();
            if ($existingPickup) {
                $pickup['latitude'] = $existingPickup->pickup_latitude;
                $pickup['longitude'] = $existingPickup->pickup_longitude;
                $pickup['address'] = $existingPickup->pickup_address;
            }
        }
        $baseLat = (float) ($pickup['latitude'] ?? 0);
        $baseLng = (float) ($pickup['longitude'] ?? 0);
        if (! $baseLat || ! $baseLng) {
            $this->error('Configure the restaurant map location before creating route-preview deliveries.');
            return self::FAILURE;
        }
        $destinations = [
            ['Preview stop A · north-east of restaurant', $baseLat + 0.006, $baseLng + 0.004, 'Demo meal A', 320],
            ['Preview stop B · west of restaurant', $baseLat + 0.002, $baseLng - 0.007, 'Demo meal B', 380],
            ['Preview stop C · south-east of restaurant', $baseLat - 0.006, $baseLng + 0.005, 'Demo meal C', 450],
            ['Preview stop D · north of restaurant', $baseLat + 0.009, $baseLng - 0.001, 'Demo meal D', 340],
            ['Preview stop E · north-west of restaurant', $baseLat + 0.004, $baseLng - 0.009, 'Demo meal E', 410],
            ['Preview stop F · south of restaurant', $baseLat - 0.009, $baseLng - 0.001, 'Demo meal F', 360],
            ['Preview stop G · east of restaurant', $baseLat + 0.001, $baseLng + 0.010, 'Demo meal G', 430],
            ['Preview stop H · south-west of restaurant', $baseLat - 0.005, $baseLng - 0.009, 'Demo meal H', 390],
            ['Preview stop I · south-east of restaurant', $baseLat - 0.011, $baseLng + 0.010, 'Demo meal I', 470],
        ];
        $directions = ['north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north'];
        for ($i = count($destinations); $i < count(self::NUMBERS); $i++) {
            $letter = chr(ord('A') + $i);
            $angle = deg2rad($i * 137.507764);
            $radius = 0.004 + (($i - 9) % 5) * 0.0025;
            $direction = $directions[($i - 9) % count($directions)];
            $destinations[] = [
                "Preview stop {$letter} · {$direction} of restaurant",
                $baseLat + sin($angle) * $radius,
                $baseLng + cos($angle) * $radius,
                "Demo meal {$letter}",
                320 + (($i * 47) % 280),
            ];
        }
        DB::transaction(function () use ($rider, $pickup, $destinations) {
            foreach ($destinations as $i => [$address, $lat, $lng, $dish, $price]) {
                $existing = Order::where('order_number', self::NUMBERS[$i])->first();
                if ($existing) {
                    if ($existing->customer_notes !== self::MARKER) throw new \RuntimeException('Demo order number already belongs to another order.');
                    continue;
                }
                $order = Order::create([
                    'order_number' => self::NUMBERS[$i], 'customer_name_snapshot' => 'Demo recipient '.($i + 1),
                    'order_type' => 'delivery', 'status' => 'ready_to_serve', 'customer_notes' => self::MARKER,
                    'delivery_address' => $address, 'delivery_latitude' => $lat, 'delivery_longitude' => $lng,
                    'delivery_recipient_name' => 'DEMO ONLY · Recipient '.($i + 1), 'delivery_phone' => null,
                    'delivery_instructions' => 'Temporary map preview. No real customer or delivery. Delete after checking.',
                    'subtotal' => $price, 'total' => $price, 'currency' => 'PHP', 'confirmed_at' => now(),
                ]);
                $order->items()->create(['item_name_snapshot' => $dish.' (preview only)', 'category_name_snapshot' => 'Demo', 'base_unit_price' => $price, 'quantity' => 1, 'line_total' => $price]);
                $delivery = Delivery::create([
                    'order_id' => $order->id, 'rider_user_id' => $rider->id, 'status' => 'in_transit',
                    'dispatch_status' => 'assigned', 'assigned_at' => now(), 'accepted_at' => now(), 'picked_up_at' => now(),
                    'pickup_latitude' => $pickup['latitude'] ?? null, 'pickup_longitude' => $pickup['longitude'] ?? null, 'pickup_address' => $pickup['address'] ?? null,
                ]);
                $delivery->statusHistory()->create(['actor_id' => $rider->id, 'to_status' => 'in_transit', 'reason' => self::MARKER]);
            }
        });
        $this->info('Up to 23 demo deliveries are ready for '.$rider->name.'.');
        $this->table(['Order', 'Destination'], array_map(fn ($number, $destination) => [$number, $destination[0]], self::NUMBERS, $destinations));
        $this->line('Remove these preview records later with: php artisan demo:rider-route --remove');
        return self::SUCCESS;
    }
}
