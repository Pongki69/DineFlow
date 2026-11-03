<?php

use App\Models\Order;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\AuthSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->seed(AuthSeeder::class);
});

function reportManager(): User
{
    $user = User::create(['name' => 'Manager', 'email' => 'manager-'.uniqid().'@example.test', 'password' => Hash::make('Strong-Passphrase-922!'), 'is_active' => true]);
    $user->roles()->attach(Role::where('slug', 'manager')->firstOrFail());

    return $user;
}

function reportOrder(string $createdAt, string $total, string $status = 'completed'): void
{
    $order = Order::create(['order_number' => 'R-'.uniqid(), 'customer_name_snapshot' => 'Guest', 'order_type' => 'pickup', 'status' => $status, 'subtotal' => $total, 'total' => $total]);
    $order->forceFill(['created_at' => Carbon::parse($createdAt)])->save();
}

it('compares with the previous period and keeps a week-long trend for one day', function () {
    reportOrder('2026-11-03 12:00:00', '300.00');
    reportOrder('2026-11-02 12:00:00', '200.00');
    reportOrder('2026-11-02 13:00:00', '999.00', 'cancelled');
    reportOrder('2026-10-29 12:00:00', '50.00');

    $data = $this->actingAs(reportManager())->getJson('/api/v1/reports?from=2026-11-03&to=2026-11-03')->assertOk()->json('data');

    expect($data['previous_sales'])->toMatchArray(['from' => '2026-11-02', 'to' => '2026-11-02', 'orders' => 1])
        ->and((float) $data['previous_sales']['gross'])->toBe(200.0)
        ->and($data['sales_trend']['from'])->toBe('2026-10-28')
        ->and(collect($data['sales_trend']['days'])->pluck('date')->all())->toBe(['2026-10-29', '2026-11-02', '2026-11-03']);
});

it('uses the range itself as the trend when it is a week or longer', function () {
    reportOrder('2026-11-05 12:00:00', '120.00');

    $data = $this->actingAs(reportManager())->getJson('/api/v1/reports?from=2026-11-01&to=2026-11-10')->assertOk()->json('data');

    expect($data['sales_trend']['from'])->toBe('2026-11-01')
        ->and($data['previous_sales']['from'])->toBe('2026-10-22')
        ->and($data['previous_sales']['to'])->toBe('2026-10-31');
});

it('counts orders by the restaurant business day, not by the stored UTC day', function () {
    App\Models\RestaurantSetting::updateOrCreate(['key' => 'business_profile'], ['value' => ['timezone' => 'Asia/Manila']]);
    reportOrder('2026-11-02 20:00:00', '400.00'); // Nov 3, 4:00 am in Manila
    reportOrder('2026-11-03 18:00:00', '70.00');  // Nov 4, 2:00 am in Manila

    $data = $this->actingAs(reportManager())->getJson('/api/v1/reports?from=2026-11-03&to=2026-11-03')->assertOk()->json('data');

    expect($data['range'])->toBe(['from' => '2026-11-03', 'to' => '2026-11-03'])
        ->and($data['sales']['orders'])->toBe(1)
        ->and((float) $data['sales']['gross'])->toBe(400.0)
        ->and($data['sales_by_day'][0]['date'])->toBe('2026-11-03');
});
