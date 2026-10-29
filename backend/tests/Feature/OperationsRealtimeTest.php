<?php

use App\Events\OperationsUpdated;
use App\Events\RestaurantLocationUpdated;
use App\Models\RestaurantSetting;
use App\Models\RiderProfile;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\AuthSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;

uses(RefreshDatabase::class);
beforeEach(function () {
    $this->seed(AuthSeeder::class);
    Cache::flush();
});

function operationsTestUser(): User
{
    return User::create(['name' => 'Demo user', 'email' => uniqid().'@example.test', 'password' => 'Test-Password-123!', 'is_active' => true]);
}

it('authorizes only active delivery administrators to operations updates', function () {
    $authorize = Broadcast::getChannels()['admin.operations'];
    foreach (['administrator' => true, 'customer' => false, 'rider' => false] as $role => $allowed) {
        $user = operationsTestUser();
        $user->roles()->attach(Role::where('slug', $role)->firstOrFail());
        expect($authorize($user))->toBe($allowed);
        $user->is_active = false;
        expect($authorize($user))->toBeFalse();
    }
});
it('broadcasts committed GPS changes without exposing coordinates or session tokens', function () {
    $rider = operationsTestUser();
    Event::fake([OperationsUpdated::class]);
    $profile = RiderProfile::create(['user_id' => $rider->id, 'is_online' => true, 'latitude' => 14.6, 'longitude' => 120.98, 'located_at' => now()]);
    Event::assertDispatchedTimes(OperationsUpdated::class, 1);
    $profile->update(['latitude' => 14.61]);
    Event::assertDispatchedTimes(OperationsUpdated::class, 1);
    $this->travel(2)->seconds();
    $profile->update(['latitude' => 14.62]);
    Event::assertDispatchedTimes(OperationsUpdated::class, 2);
    expect(array_keys((new OperationsUpdated)->broadcastWith()))->toBe(['updated_at']);
    expect((new OperationsUpdated)->broadcastOn()[0]->name)->toBe('private-admin.operations');
});
it('does not announce rolled-back GPS changes or unrelated restaurant secrets', function () {
    $rider = operationsTestUser();
    Event::fake([OperationsUpdated::class]);
    try {
        DB::transaction(function () use ($rider) {
            RiderProfile::create(['user_id' => $rider->id]);
            throw new RuntimeException('Rollback');
        });
    } catch (RuntimeException) {
    }
    RestaurantSetting::create(['key' => 'payment_settings', 'value' => ['enabled' => false]]);
    Event::assertNotDispatched(OperationsUpdated::class);
    RestaurantSetting::create(['key' => 'restaurant_location', 'value' => ['name' => 'Demo outlet']]);
    Event::assertDispatchedTimes(OperationsUpdated::class, 1);
});

it('announces committed public outlet updates without publishing settings or rider information', function () {
    Event::fake([RestaurantLocationUpdated::class]);
    RestaurantSetting::create(['key' => 'restaurant_location', 'value' => ['name' => 'Linked outlet', 'latitude' => 14.19, 'longitude' => 121.28]]);
    Event::assertDispatchedTimes(RestaurantLocationUpdated::class, 1);
    expect(array_keys((new RestaurantLocationUpdated)->broadcastWith()))->toBe(['updated_at']);
    expect((new RestaurantLocationUpdated)->broadcastOn()[0]->name)->toBe('restaurant.location');
    $response = $this->getJson('/api/v1/restaurant/location')->assertOk()->assertJsonPath('data.name', 'Linked outlet');
    $version = $response->json('location_version');
    expect($response->headers->get('Cache-Control'))->toContain('no-store');
    RestaurantSetting::create(['key' => 'delivery_policy', 'value' => ['radius_km' => 5]]);
    $this->getJson('/api/v1/restaurant/location')->assertOk()->assertJsonMissingExact(['location_version' => $version]);
});
