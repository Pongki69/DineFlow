<?php

namespace App\Console\Commands;

use App\Models\Delivery;
use App\Models\Order;
use App\Models\RestaurantSetting;
use App\Models\Role;
use App\Models\User;
use App\Services\DispatchGuard;
use App\Services\RiderReviewService;
use App\Support\RiderWorkspacePreview as Preview;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use InvalidArgumentException;
use RuntimeException;

class DemoRiderWorkspace extends Command
{
    protected $signature = 'demo:rider-workspace
        {--rider= : Active rider user ID}
        {--reviews=25 : Number of historical demo reviews, 0–100}
        {--deliveries=15 : Number of active demo deliveries, 0–100}
        {--latitude= : Preview center latitude}
        {--longitude= : Preview center longitude}
        {--remove : Remove only this rider\'s unchanged, marked preview data}';

    protected $description = 'Create or remove clearly marked local rider workspace preview data';

    private function isPreviewOrder(?string $number, ?string $notes, int $riderId): bool
    {
        return Preview::matches($number, $notes, $riderId)
            && preg_match('/^'.preg_quote(Preview::prefix($riderId), '/').'[AH]-\d{3}$/D', $number ?? '') === 1;
    }

    public function handle(): int
    {
        if (! app()->environment(['local', 'testing'])) {
            $this->error('Workspace preview data is available only in local or testing environments.');

            return self::FAILURE;
        }

        try {
            $riderId = $this->integerOption('rider', 1, PHP_INT_MAX);
            $rider = User::whereKey($riderId)->where('is_active', true)
                ->whereHas('roles', fn ($query) => $query->where('slug', 'rider'))->first();
            if (! $rider || strlen(Preview::prefix($riderId).'H-001') > 32) {
                throw new InvalidArgumentException('Choose an active rider with --rider=ID.');
            }
            if ($this->option('remove')) {
                return $this->removePreview($rider);
            }
            $reviews = $this->integerOption('reviews', 0, 100);
            $deliveries = $this->integerOption('deliveries', 0, 100);
            $latitude = $this->coordinateOption('latitude', -90, 90);
            $longitude = $this->coordinateOption('longitude', -180, 180);
            $pickup = $this->pickup($latitude, $longitude);

            Model::withoutEvents(fn () => DB::transaction(function () use ($rider, $reviews, $deliveries, $latitude, $longitude, $pickup) {
                DispatchGuard::lock();
                $customer = $this->customer($rider->id);
                foreach (['H' => $reviews, 'A' => $deliveries] as $kind => $count) {
                    for ($index = 1; $index <= $count; $index++) {
                        $this->createPreview($rider, $customer, $kind, $index, $latitude, $longitude, $pickup);
                    }
                }
            }, 3));

            $this->info("Demo workspace ready for {$rider->name}: {$reviews} historical reviews and {$deliveries} active preview deliveries.");
            $this->line('Existing records, rider GPS, restaurant settings, payments and notifications were not changed.');
            $this->line('Remove these marked fixtures with: php artisan demo:rider-workspace --rider='.$rider->id.' --remove');

            return self::SUCCESS;
        } catch (InvalidArgumentException|RuntimeException $exception) {
            $this->error($exception->getMessage());

            return self::FAILURE;
        }
    }

    private function integerOption(string $name, int $minimum, int $maximum): int
    {
        $value = filter_var($this->option($name), FILTER_VALIDATE_INT, ['options' => ['min_range' => $minimum, 'max_range' => $maximum]]);
        if ($value === false) {
            throw new InvalidArgumentException("--{$name} must be an integer between {$minimum} and {$maximum}.");
        }

        return $value;
    }

    private function coordinateOption(string $name, float $minimum, float $maximum): float
    {
        $input = $this->option($name);
        if (! is_numeric($input) || ! is_finite((float) $input) || (float) $input < $minimum || (float) $input > $maximum) {
            throw new InvalidArgumentException("Provide --{$name} between {$minimum} and {$maximum}.");
        }

        return (float) $input;
    }

    private function customer(int $riderId): User
    {
        $email = $this->customerEmail($riderId);
        $customer = User::where('email', $email)->lockForUpdate()->first();
        if ($customer) {
            if ($customer->name !== 'DEMO ONLY · Review customer' || $customer->is_active || ! $customer->hasRole('customer')) {
                throw new RuntimeException('The preview customer email belongs to another account. No records were changed.');
            }

            return $customer;
        }
        $customer = User::create(['name' => 'DEMO ONLY · Review customer', 'email' => $email, 'password' => Str::random(64), 'is_active' => false]);
        $customer->roles()->attach(Role::where('slug', 'customer')->firstOrFail());

        return $customer;
    }

    private function customerEmail(int $riderId): string
    {
        return 'dineflow-workspace-rider-'.$riderId.'@preview.invalid';
    }

    private function pickup(float $latitude, float $longitude): array
    {
        $configured = RestaurantSetting::where('key', 'restaurant_location')->value('value') ?? [];
        if (isset($configured['latitude'], $configured['longitude']) && is_numeric($configured['latitude']) && is_numeric($configured['longitude'])
            && abs((float) $configured['latitude']) <= 90 && abs((float) $configured['longitude']) <= 180) {
            return ['latitude' => (float) $configured['latitude'], 'longitude' => (float) $configured['longitude'], 'address' => 'DEMO pickup · '.($configured['address'] ?? 'Configured restaurant')];
        }

        return ['latitude' => $latitude, 'longitude' => $longitude, 'address' => 'DEMO ONLY · Temporary pickup near preview center'];
    }

    private function createPreview(User $rider, User $customer, string $kind, int $index, float $latitude, float $longitude, array $pickup): void
    {
        $number = Preview::prefix($rider->id).$kind.'-'.str_pad((string) $index, 3, '0', STR_PAD_LEFT);
        $existing = Order::where('order_number', $number)->lockForUpdate()->first();
        if ($existing) {
            if (! $this->isPreviewOrder($existing->order_number, $existing->customer_notes, $rider->id)
                || $existing->customer_id !== $customer->id || $existing->delivery?->rider_user_id !== $rider->id) {
                throw new RuntimeException('A preview order number belongs to another record. No records were changed.');
            }

            return;
        }
        $historical = $kind === 'H';
        $status = $historical ? 'delivered' : ['accepted', 'arrived_at_restaurant', 'in_transit'][($index - 1) % 3];
        $end = $historical ? now()->subDays($index)->subMinutes(10) : now()->subMinutes(($index - 1) % 10);
        $start = $end->copy()->subMinutes(35);
        $orderStatus = $historical ? 'completed' : ($status === 'accepted' ? 'preparing' : 'ready_to_serve');
        $angle = deg2rad($index * 137.507764);
        $radius = 0.003 + ($index % 5) * 0.001;
        $destinationLat = max(-89.999999, min(89.999999, $latitude + sin($angle) * $radius));
        $destinationLng = fmod($longitude + cos($angle) * $radius + 540, 360) - 180;
        $amount = 200 + ($index % 7) * 35;
        $vehicle = $rider->riderProfile?->vehicle_type;
        $order = Order::create([
            'order_number' => $number, 'customer_id' => $customer->id, 'customer_name_snapshot' => 'DEMO ONLY · Recipient '.$index,
            'customer_email_snapshot' => $customer->email, 'order_type' => 'delivery', 'status' => $orderStatus,
            'subtotal' => $amount, 'total' => $amount, 'currency' => 'PHP', 'customer_notes' => Preview::marker($rider->id),
            'delivery_address' => 'DEMO ONLY · Preview stop '.$kind.'-'.$index, 'delivery_recipient_name' => 'DEMO ONLY · Recipient '.$index,
            'delivery_phone' => null, 'delivery_instructions' => 'Synthetic preview only. No real customer or delivery.',
            'delivery_latitude' => $destinationLat, 'delivery_longitude' => $destinationLng, 'delivery_vehicle_class' => in_array($vehicle, ['bicycle', 'motorcycle', 'car'], true) ? $vehicle : 'motorcycle',
            'confirmed_at' => $start, 'completed_at' => $historical ? $end : null,
            'prep_minutes' => 15, 'prep_ready_at' => $historical ? $start->copy()->addMinutes(12) : ($status === 'accepted' ? now()->addMinutes(10) : $end->copy()->subMinutes(5)),
        ]);
        $order->forceFill(['created_at' => $start, 'updated_at' => $end])->save();
        $order->items()->create(['item_name_snapshot' => 'DEMO meal '.$index, 'category_name_snapshot' => 'Demo preview', 'base_unit_price' => $amount, 'quantity' => 1, 'line_total' => $amount, 'special_instructions' => $index % 4 === 0 ? 'DEMO ONLY · Sauce separately; please check allergy instructions.' : null]);
        $order->statusHistory()->create(['actor_id' => $rider->id, 'to_status' => $orderStatus, 'note' => Preview::marker($rider->id)]);
        $pickedUp = in_array($status, ['in_transit', 'delivered'], true);
        $delivery = Delivery::create([
            'order_id' => $order->id, 'rider_user_id' => $rider->id, 'status' => $status, 'dispatch_status' => 'assigned',
            'assigned_at' => $start->copy()->addMinutes(3), 'accepted_at' => $start->copy()->addMinutes(5),
            'picked_up_at' => $pickedUp ? $start->copy()->addMinutes(15) : null, 'delivered_at' => $historical ? $end : null,
            'pickup_latitude' => $pickup['latitude'], 'pickup_longitude' => $pickup['longitude'], 'pickup_address' => $pickup['address'],
            'estimated_arrival_at' => $historical ? null : now()->addMinutes(10 + $index), 'created_at' => $start, 'updated_at' => $end,
        ]);
        $delivery->assignments()->create(['rider_user_id' => $rider->id, 'assigned_by' => $rider->id, 'status' => $historical ? 'delivered' : 'accepted', 'accepted_at' => $start->copy()->addMinutes(5), 'ended_at' => $historical ? $end : null, 'reason' => Preview::marker($rider->id)]);
        $stages = ['assigned', 'accepted', 'arrived_at_restaurant', 'picked_up', 'in_transit', 'delivered'];
        $last = array_search($status, $stages, true);
        foreach (array_slice($stages, 0, $last + 1) as $stageIndex => $stage) {
            $offsets = ['assigned' => 3, 'accepted' => 5, 'arrived_at_restaurant' => 10, 'picked_up' => 15, 'in_transit' => 17];
            $at = $stage === 'delivered' ? $end : $start->copy()->addMinutes($offsets[$stage]);
            $delivery->statusHistory()->create(['actor_id' => $rider->id, 'from_status' => $stageIndex > 0 ? $stages[$stageIndex - 1] : null, 'to_status' => $stage, 'reason' => Preview::marker($rider->id)])->forceFill(['created_at' => $at, 'updated_at' => $at])->save();
        }
        if ($historical) {
            $scores = [5, 5, 4, 5, 4, 3, 5, 4, 5, 2, 5, 4, 3, 5, 4, 5, 1, 4, 5, 3, 5, 4, 5, 5, 4];
            $comments = ['On-time delivery and careful packaging.', 'Clear updates and an easy hand-off.', 'Friendly service; instructions followed.', 'The food arrived securely packed.', 'Helpful communication at the preview stop.', 'Delivery took longer than expected in this sample scenario.', 'Please improve arrival updates in this sample scenario.'];
            $categories = array_keys(RiderReviewService::CATEGORIES);
            DB::table('delivery_ratings')->insert(['delivery_id' => $delivery->id, 'rider_user_id' => $rider->id, 'customer_id' => $customer->id, 'rating' => $scores[($index - 1) % count($scores)], 'comment' => 'DEMO ONLY · '.$comments[($index - 1) % count($comments)], 'categories' => json_encode([$categories[($index - 1) % count($categories)]]), 'show_name' => true, 'created_at' => $end->copy()->addMinutes(3), 'updated_at' => $end->copy()->addMinutes(3)]);
        }
    }

    private function removePreview(User $rider): int
    {
        [$removed, $skipped] = Model::withoutEvents(fn () => DB::transaction(function () use ($rider) {
            DispatchGuard::lock();
            $customer = User::where('email', $this->customerEmail($rider->id))->where('name', 'DEMO ONLY · Review customer')->where('is_active', false)->lockForUpdate()->first();
            if (! $customer) {
                return [0, 0];
            }
            $orders = Order::where('order_number', 'like', Preview::prefix($rider->id).'%')
                ->where('customer_notes', Preview::marker($rider->id))->where('customer_id', $customer->id)->lockForUpdate()->get();
            $removed = 0;
            $skipped = 0;
            foreach ($orders as $order) {
                $delivery = $order->delivery;
                if (! $this->isPreviewOrder($order->order_number, $order->customer_notes, $rider->id) || ! $delivery || $delivery->rider_user_id !== $rider->id
                    || $order->payments()->exists() || $order->paymentAllocations()->exists()
                    || DB::table('delivery_proofs')->where('delivery_id', $delivery->id)->exists()
                    || DB::table('delivery_ratings')->where('delivery_id', $delivery->id)->where(fn ($query) => $query->where('rider_user_id', '!=', $rider->id)->orWhere('customer_id', '!=', $customer->id))->exists()) {
                    $skipped++;

                    continue;
                }
                $delivery->delete();
                $order->delete();
                $removed++;
            }
            if (! Order::where('customer_id', $customer->id)->exists() && ! DB::table('delivery_ratings')->where('customer_id', $customer->id)->exists()) {
                $customer->delete();
            }

            return [$removed, $skipped];
        }, 3));
        $this->info("Removed {$removed} marked preview orders and their deliveries/reviews; skipped {$skipped} changed or in-use records.");
        $this->line('Existing rider coordinates and non-preview records were not changed.');

        return self::SUCCESS;
    }
}
