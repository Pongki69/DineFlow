<?php

use App\Models\RestaurantSetting;
use App\Models\RiderProfile;
use App\Models\Role;
use App\Models\User;
use App\Services\DeliveryQuoteService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->seed(\Database\Seeders\AuthSeeder::class);
});

function adminWorkspaceUser(string $role): User
{
    $user = User::create(['name' => ucfirst($role), 'email' => uniqid().'@example.test', 'password' => 'Test-Password-123!', 'is_active' => true]);
    $user->roles()->attach(Role::where('slug', $role)->firstOrFail());
    return $user;
}

function outletPayload(): array
{
    return ['location' => ['name' => 'Main outlet', 'address' => 'Manila restaurant', 'latitude' => 14.6, 'longitude' => 120.98, 'is_active' => true, 'opening_hours' => ['monday' => ['open' => '09:00', 'close' => '22:00', 'closed' => false]]], 'radius_km' => 5];
}

it('protects fleet locations and outlet configuration with permissions', function () {
    $this->getJson('/api/v1/admin/operations-overview')->assertUnauthorized();
    $this->actingAs(adminWorkspaceUser('customer'))->getJson('/api/v1/admin/operations-overview')->assertForbidden();
    $this->putJson('/api/v1/admin/outlet-config', outletPayload())->assertForbidden();
});

it('saves outlet configuration together while preserving delivery pricing', function () {
    RestaurantSetting::create(['key' => 'delivery_policy', 'value' => ['radius_km' => 8, 'base_fee' => 75, 'minimum_order' => 200, 'per_km_fee' => 12]]);
    $this->actingAs(adminWorkspaceUser('administrator'))->putJson('/api/v1/admin/outlet-config', outletPayload())->assertOk()->assertJsonPath('data.radius_km', 5);
    expect(RestaurantSetting::where('key', 'delivery_policy')->value('value'))->toMatchArray(['radius_km' => 5, 'base_fee' => 75, 'minimum_order' => 200]);
    expect(RestaurantSetting::where('key', 'restaurant_location')->value('value')['latitude'])->toBe(14.6);
});

it('rejects invalid coordinates and hours without partially changing the outlet', function () {
    $this->actingAs(adminWorkspaceUser('administrator'));
    $this->putJson('/api/v1/admin/outlet-config', outletPayload())->assertOk();
    $invalid = outletPayload();
    $invalid['location']['latitude'] = 91;
    $invalid['location']['opening_hours']['monday']['open'] = 'tomorrow';
    $invalid['radius_km'] = 200;
    $this->putJson('/api/v1/admin/outlet-config', $invalid)->assertUnprocessable();
    expect(RestaurantSetting::where('key', 'delivery_policy')->value('value')['radius_km'])->toBe(5);
    expect(RestaurantSetting::where('key', 'restaurant_location')->value('value')['latitude'])->toBe(14.6);
});

it('counts only fresh online riders as available and omits stale GPS coordinates', function () {
    $fresh = adminWorkspaceUser('rider');
    $stale = adminWorkspaceUser('rider');
    foreach ([$fresh, $stale] as $rider) RiderProfile::create(['user_id' => $rider->id, 'is_online' => true, 'latitude' => 14.6, 'longitude' => 120.98, 'accuracy_meters' => 10, 'located_at' => $rider->is($fresh) ? now() : now()->subHour(), 'presence_token' => (string) \Illuminate\Support\Str::uuid()]);
    $response = $this->actingAs(adminWorkspaceUser('administrator'))->getJson('/api/v1/admin/operations-overview')->assertOk()->assertJsonPath('data.metrics.available_riders', 1);
    $fleet = collect($response->json('data.fleet'))->keyBy('id');
    expect($fleet[$fresh->id]['status'])->toBe('available')->and($fleet[$stale->id]['latitude'])->toBeNull()->and($fleet[$stale->id]['status'])->toBe('location_stale');
    expect($response->getContent())->not->toContain('presence_token');
});

it('rejects new delivery quotes for an offline outlet before contacting routing providers', function () {
    RestaurantSetting::create(['key' => 'restaurant_location', 'value' => ['latitude' => 14.6, 'longitude' => 120.98, 'is_active' => false]]);
    expect(fn () => app(DeliveryQuoteService::class)->quote(14.61, 120.99, 10000))->toThrow(ValidationException::class, 'currently offline');
});

it('keeps outlet availability when the existing location settings form is saved', function () {
    RestaurantSetting::create(['key' => 'restaurant_location', 'value' => ['is_active' => false]]);
    $this->actingAs(adminWorkspaceUser('administrator'))->putJson('/api/v1/admin/restaurant/location', ['address' => 'Updated address', 'latitude' => 14.6, 'longitude' => 120.98])->assertOk();
    expect(RestaurantSetting::where('key', 'restaurant_location')->value('value')['is_active'])->toBeFalse();
});

it('rejects a partial opening window before changing saved settings', function () {
    $payload = outletPayload();
    $payload['location']['opening_hours']['monday']['close'] = null;
    $this->actingAs(adminWorkspaceUser('administrator'))->putJson('/api/v1/admin/outlet-config', $payload)->assertUnprocessable();
    expect(RestaurantSetting::where('key', 'restaurant_location')->exists())->toBeFalse();
});
