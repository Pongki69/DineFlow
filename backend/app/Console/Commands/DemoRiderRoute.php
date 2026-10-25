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
    protected $signature = 'demo:rider-route {--rider= : Rider user ID} {--remove : Remove only these three demo orders and deliveries}';
    protected $description = 'Create or remove three temporary local route-preview deliveries';
    private const MARKER = 'Temporary rider route preview d676-demo-v1';
    private const NUMBERS = ['DEMO-ROUTE-01', 'DEMO-ROUTE-02', 'DEMO-ROUTE-03'];

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
                $this->info('Removed '.$orders->count().' temporary demo orders and their deliveries.');
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
        $destinations = [
            ['Lopez Avenue, Los Baños, Laguna (demo stop)', 14.1805, 121.243, 'Demo meal A', 320],
            ['Bambang, Los Baños, Laguna (demo stop)', 14.1778, 121.2387, 'Demo meal B', 380],
            ['National Highway, Los Baños, Laguna (demo stop)', 14.1736, 121.242, 'Demo meal C', 450],
        ];
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
        $this->info('Three demo deliveries are ready for '.$rider->name.'.');
        $this->table(['Order', 'Destination'], array_map(fn ($number, $destination) => [$number, $destination[0]], self::NUMBERS, $destinations));
        $this->line('Remove later with: php artisan demo:rider-route --remove');
        return self::SUCCESS;
    }
}
