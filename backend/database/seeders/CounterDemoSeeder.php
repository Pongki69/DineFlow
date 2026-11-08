<?php

namespace Database\Seeders;

use App\Models\Order;
use App\Models\Payment;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Demo payments for today, so Daily transactions ("Today at the counter")
 * shows a busy day: paid cash and online payments, two refunds, one failed
 * and one pending checkout. Uses the DEMO-K kitchen orders
 * (KitchenDemoSeeder) and touches only DEMO-CTR-* payments.
 *
 *   php artisan db:seed --class=CounterDemoSeeder
 */
class CounterDemoSeeder extends Seeder
{
    /** [method, status] for each payment, earliest first. */
    private const PAYMENTS = [
        ['cash', 'paid'], ['gcash', 'paid'], ['card', 'paid'], ['cash', 'paid'],
        ['maya', 'paid'], ['gcash', 'refunded'], ['cash', 'paid'], ['card', 'paid'],
        ['gcash', 'failed'], ['cash', 'paid'], ['gcash', 'paid'], ['card', 'refunded'],
        ['cash', 'paid'], ['qrph', 'paid'], ['gcash', 'paid'], ['cash', 'paid'],
        ['card', 'paid'], ['gcash', 'pending'],
    ];

    public function run(): void
    {
        $orders = Order::where('order_number', 'like', 'DEMO-K%')->orderBy('order_number')->get();
        if ($orders->isEmpty()) {
            $this->command?->warn('Run KitchenDemoSeeder first: no DEMO-K orders to pay for.');

            return;
        }
        $cashier = User::whereHas('roles', fn ($role) => $role->whereIn('slug', ['cashier', 'administrator']))->orderBy('id')->first();
        $timezone = config('app.timezone', 'UTC');
        $business = DB::table('restaurant_settings')->where('key', 'business_profile')->value('value');
        $businessZone = json_decode((string) $business, true)['timezone'] ?? 'Asia/Manila';
        $now = Carbon::now($businessZone);
        // Spread the payments from opening (or midnight, early in the day) to a few minutes ago.
        $start = $now->copy()->startOfDay()->addHours(min(9, max(0, $now->hour - 1)));
        $span = max(30, $start->diffInMinutes($now) - 5);
        $count = count(self::PAYMENTS);

        DB::transaction(function () use ($orders, $cashier, $timezone, $start, $span, $count): void {
            Payment::where('reference_number', 'like', 'DEMO-CTR-%')->delete();
            foreach (self::PAYMENTS as $index => [$method, $status]) {
                $order = $orders[$index % $orders->count()];
                $at = $start->copy()->addMinutes((int) round($span * $index / max(1, $count - 1)))->setTimezone($timezone);
                $amount = (float) $order->total > 0 ? (float) $order->total : 250 + 35 * $index;
                $paid = in_array($status, ['paid', 'refunded'], true);
                Payment::forceCreate([
                    'order_id' => $order->id,
                    'purpose' => 'order',
                    'method' => $method,
                    'status' => $status,
                    'amount' => $amount,
                    'currency' => 'PHP',
                    'provider' => $method === 'cash' ? null : 'paymongo',
                    'reference_number' => 'DEMO-CTR-'.str_pad((string) ($index + 1), 3, '0', STR_PAD_LEFT),
                    'received_by' => $method === 'cash' ? $cashier?->id : null,
                    'cash_tendered' => $method === 'cash' ? ceil($amount / 100) * 100 : null,
                    'paid_at' => $paid ? $at : null,
                    'refunded_at' => $status === 'refunded' ? $at->copy()->addMinutes(20) : null,
                    'failure_reason' => $status === 'failed' ? 'Card declined by the issuer.' : null,
                    'created_at' => $at,
                    'updated_at' => $at,
                ]);
            }
        });
        $this->command?->info('Seeded '.$count.' demo counter payments for today.');
    }
}
