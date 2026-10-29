<?php

use App\Models\Delivery;
use App\Models\Order;
use App\Models\Payment;
use App\Models\RiderProfile;
use App\Models\Role;
use App\Models\User;
use App\Support\RiderWorkspacePreview as Preview;
use Database\Seeders\AuthSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;

uses(RefreshDatabase::class);

function workspacePreviewUser(string $role, bool $active = true): User
{
    $user = User::create(['name' => 'Existing '.ucfirst($role), 'email' => uniqid().'@example.test', 'password' => 'Existing-Test-Password-123!', 'is_active' => $active]);
    $user->roles()->attach(Role::where('slug', $role)->firstOrFail());

    return $user;
}

function workspacePreviewOptions(User $rider, array $extra = []): array
{
    return $extra + ['--rider' => $rider->id, '--latitude' => '14.186648', '--longitude' => '121.231433'];
}

beforeEach(function () {
    $this->seed(AuthSeeder::class);
    Notification::fake();
    Mail::fake();
    Queue::fake();
    $this->rider = workspacePreviewUser('rider');
    $this->customer = workspacePreviewUser('customer');
    $this->profile = RiderProfile::create(['user_id' => $this->rider->id, 'vehicle_type' => 'bicycle', 'latitude' => 14.1, 'longitude' => 121.2, 'is_online' => false, 'located_at' => now()->subHour()]);
    $this->realOrder = Order::create(['order_number' => 'REAL-EXISTING', 'customer_id' => $this->customer->id, 'customer_name_snapshot' => 'Existing customer', 'order_type' => 'delivery', 'status' => 'ready_to_serve', 'subtotal' => 300, 'total' => 300, 'currency' => 'PHP', 'customer_notes' => 'Keep this real record']);
    $this->realDelivery = Delivery::create(['order_id' => $this->realOrder->id, 'rider_user_id' => $this->rider->id, 'status' => 'in_transit']);
});

it('seeds 25 distinct reviewed historical deliveries and 15 active demo assignments without side effects', function () {
    $originalProfile = $this->profile->fresh()->toArray();
    $originalOrder = $this->realOrder->fresh()->toArray();
    $this->artisan('demo:rider-workspace', workspacePreviewOptions($this->rider))->assertSuccessful();

    $orders = Order::where('customer_notes', Preview::marker($this->rider->id))->get();
    expect($orders)->toHaveCount(40);
    expect(Delivery::whereIn('order_id', $orders->modelKeys())->where('status', 'delivered')->count())->toBe(25);
    expect(Delivery::whereIn('order_id', $orders->modelKeys())->whereNotIn('status', Delivery::TERMINAL)->count())->toBe(15);
    expect(DB::table('delivery_ratings')->count())->toBe(25);
    expect(DB::table('delivery_ratings')->distinct()->count('delivery_id'))->toBe(25);
    expect(DB::table('delivery_ratings')->join('deliveries', 'deliveries.id', '=', 'delivery_ratings.delivery_id')->where('deliveries.status', '!=', 'delivered')->count())->toBe(0);
    expect(DB::table('delivery_ratings')->where('comment', 'not like', 'DEMO ONLY%')->count())->toBe(0);
    expect(DB::table('delivery_assignments')->count())->toBe(40);
    expect(DB::table('order_items')->count())->toBe(40);
    $demoCustomer = User::where('email', 'dineflow-workspace-rider-'.$this->rider->id.'@preview.invalid')->firstOrFail();
    expect($demoCustomer->is_active)->toBeFalse();
    expect($demoCustomer->hasRole('customer'))->toBeTrue();
    expect($this->profile->fresh()->toArray())->toBe($originalProfile);
    expect($this->realOrder->fresh()->toArray())->toBe($originalOrder);
    $this->assertDatabaseCount('payments', 0);
    $this->assertDatabaseCount('restaurant_settings', 0);
    Notification::assertNothingSent();
    Mail::assertNothingSent();
    Queue::assertNothingPushed();
});

it('is idempotent and preserves progress on previously seeded assignments', function () {
    $options = workspacePreviewOptions($this->rider);
    $this->artisan('demo:rider-workspace', $options)->assertSuccessful();
    $orderIds = Order::orderBy('id')->pluck('id')->all();
    $ratingRows = DB::table('delivery_ratings')->orderBy('id')->get()->toArray();
    $active = Delivery::where('status', 'accepted')->firstOrFail();
    $active->update(['status' => 'arrived_at_restaurant']);
    $this->artisan('demo:rider-workspace', $options)->assertSuccessful();
    expect(Order::orderBy('id')->pluck('id')->all())->toBe($orderIds);
    expect(DB::table('delivery_ratings')->orderBy('id')->get()->toArray())->toEqual($ratingRows);
    expect($active->fresh()->status)->toBe('arrived_at_restaurant');
    expect(Delivery::count())->toBe(41);
});

it('rejects production creation and cleanup before changing any records', function () {
    $this->app->instance('env', 'production');
    try {
        $this->artisan('demo:rider-workspace', workspacePreviewOptions($this->rider))->assertFailed();
        $this->artisan('demo:rider-workspace', ['--rider' => $this->rider->id, '--remove' => true])->assertFailed();
        $this->assertDatabaseCount('orders', 1);
        $this->assertDatabaseCount('delivery_ratings', 0);
    } finally {
        $this->app->instance('env', 'testing');
    }
});

it('rejects non-riders inactive riders invalid counts and invalid coordinates', function () {
    $inactive = workspacePreviewUser('rider', false);
    foreach ([
        workspacePreviewOptions($this->customer),
        workspacePreviewOptions($inactive),
        workspacePreviewOptions($this->rider, ['--reviews' => 101]),
        workspacePreviewOptions($this->rider, ['--deliveries' => -1]),
        workspacePreviewOptions($this->rider, ['--latitude' => 'NaN']),
        workspacePreviewOptions($this->rider, ['--longitude' => 181]),
    ] as $options) {
        $this->artisan('demo:rider-workspace', $options)->assertFailed();
    }
    $this->assertDatabaseCount('orders', 1);
    $this->assertDatabaseCount('delivery_ratings', 0);
});

it('rolls back the entire dataset when a preview number collides with an unrelated order', function () {
    $collision = $this->realOrder->replicate();
    $collision->order_number = Preview::prefix($this->rider->id).'H-002';
    $collision->save();
    $this->artisan('demo:rider-workspace', workspacePreviewOptions($this->rider))->assertFailed();
    $this->assertDatabaseCount('orders', 2);
    $this->assertDatabaseCount('deliveries', 1);
    $this->assertDatabaseCount('delivery_ratings', 0);
    expect(User::where('email', 'like', '%@preview.invalid')->exists())->toBeFalse();
    expect($collision->fresh()->customer_notes)->toBe('Keep this real record');
});

it('removes only the chosen rider marked preview records and leaves other riders and real data intact', function () {
    $otherRider = workspacePreviewUser('rider');
    $this->artisan('demo:rider-workspace', workspacePreviewOptions($this->rider))->assertSuccessful();
    $this->artisan('demo:rider-workspace', workspacePreviewOptions($otherRider, ['--reviews' => 2, '--deliveries' => 2]))->assertSuccessful();
    $this->artisan('demo:rider-workspace', ['--rider' => $this->rider->id, '--remove' => true])->assertSuccessful();
    expect(Order::where('customer_notes', Preview::marker($this->rider->id))->count())->toBe(0);
    expect(Order::where('customer_notes', Preview::marker($otherRider->id))->count())->toBe(4);
    expect(DB::table('delivery_ratings')->where('rider_user_id', $otherRider->id)->count())->toBe(2);
    expect($this->realOrder->fresh()->customer_notes)->toBe('Keep this real record');
    expect($this->realDelivery->fresh()->status)->toBe('in_transit');
    expect(User::where('email', 'dineflow-workspace-rider-'.$this->rider->id.'@preview.invalid')->exists())->toBeFalse();
    expect($this->profile->fresh()->latitude)->toEqual(14.1);
    $this->artisan('demo:rider-workspace', ['--rider' => $this->rider->id, '--remove' => true])->assertSuccessful();
    $this->assertDatabaseCount('orders', 5);
});

it('preserves changed ownership and financial records during cleanup', function () {
    $otherRider = workspacePreviewUser('rider');
    $this->artisan('demo:rider-workspace', workspacePreviewOptions($this->rider, ['--reviews' => 1, '--deliveries' => 2]))->assertSuccessful();
    $paidOrder = Order::where('order_number', Preview::prefix($this->rider->id).'A-001')->firstOrFail();
    Payment::create(['order_id' => $paidOrder->id, 'method' => 'cash', 'status' => 'paid', 'amount' => $paidOrder->total, 'currency' => 'PHP']);
    $reassigned = Order::where('order_number', Preview::prefix($this->rider->id).'A-002')->firstOrFail();
    $reassigned->delivery->update(['rider_user_id' => $otherRider->id]);
    $this->artisan('demo:rider-workspace', ['--rider' => $this->rider->id, '--remove' => true])->assertSuccessful();
    expect($paidOrder->fresh())->not->toBeNull();
    expect($reassigned->delivery->fresh()->rider_user_id)->toBe($otherRider->id);
    $this->assertDatabaseCount('payments', 1);
    expect(DB::table('delivery_ratings')->count())->toBe(0);
    $this->assertDatabaseCount('orders', 3);
});
