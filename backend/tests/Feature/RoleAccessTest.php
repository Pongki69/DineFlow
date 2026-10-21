<?php

use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;

uses(RefreshDatabase::class);

function roleUser(string $roleSlug, string $password = 'Strong-Passphrase-922!'): User
{
    $role = Role::where('slug', $roleSlug)->firstOrFail();
    return tap(User::create(['name' => 'Test User', 'email' => $roleSlug.'@example.test', 'password' => Hash::make($password), 'is_active' => true]), fn (User $user) => $user->roles()->attach($role));
}

beforeEach(fn () => $this->seed(\Database\Seeders\AuthSeeder::class));

it('creates public registrations as customers only', function () {
    $response = $this->postJson('/api/v1/register', [
        'name' => 'Customer One', 'email' => 'customer@example.test', 'password' => 'Strong-Passphrase-922!',
        'password_confirmation' => 'Strong-Passphrase-922!', 'role' => 'administrator',
    ]);
    $response->assertCreated()->assertJsonPath('user.roles.0', 'customer');
});

it('blocks kitchen staff from financial reports and permits kitchen work', function () {
    $user = roleUser('kitchen_staff');
    $this->actingAs($user)->getJson('/api/v1/kitchen/orders')->assertOk();
    $this->actingAs($user)->getJson('/api/v1/reports/financial')->assertForbidden();
});

it('allows each operational role into its own protected workspace', function () {
    $this->actingAs(roleUser('manager'))->getJson('/api/v1/operations')->assertOk();
    $cashier = roleUser('cashier');
    $this->actingAs($cashier)->getJson('/api/v1/cashier/payments')->assertOk();
    $this->actingAs($cashier)->getJson('/api/v1/cashier/summary')->assertOk();
    $this->actingAs(roleUser('waiter'))->getJson('/api/v1/service/tables')->assertOk();
    $this->actingAs(roleUser('rider'))->getJson('/api/v1/rider/assignments')->assertOk();
    $this->actingAs(roleUser('administrator'))->getJson('/api/v1/admin/users')->assertOk();
    $this->actingAs(roleUser('customer'))->getJson('/api/v1/me')->assertOk();
});

it('blocks cashiers from assigning administrator privileges', function () {
    $cashier = roleUser('cashier');
    $target = roleUser('customer');
    $this->actingAs($cashier)->putJson('/api/v1/admin/users/'.$target->id.'/role', ['role' => 'administrator'])->assertForbidden();
});

it('blocks managers from restricted security settings and account management', function () {
    $manager = roleUser('manager');
    $this->actingAs($manager)->postJson('/api/v1/admin/users', [])->assertForbidden();
    $this->actingAs($manager)->getJson('/api/v1/admin/settings')->assertForbidden();
});

it('blocks unauthenticated access and deactivated users', function () {
    $this->getJson('/api/v1/rider/assignments')->assertUnauthorized();
    $rider = roleUser('rider');
    $rider->forceFill(['is_active' => false])->save();
    $this->actingAs($rider)->getJson('/api/v1/rider/assignments')->assertForbidden();
});

it('returns JSON for unauthenticated API requests even when the client accepts HTML', function () {
    $this->get('/api/v1/me', ['Accept' => 'text/html'])
        ->assertUnauthorized()
        ->assertJson(['message' => 'Unauthenticated.']);
});

it('prevents customers from accessing rider assignment data', function () {
    $customer = roleUser('customer');
    $this->actingAs($customer)->getJson('/api/v1/rider/assignments')->assertForbidden();
});

it('blocks customers from account administration and protects payment data from kitchen staff', function () {
    $customer = roleUser('customer');
    $kitchen = roleUser('kitchen_staff');
    $this->actingAs($customer)->getJson('/api/v1/admin/users')->assertForbidden();
    $this->actingAs($kitchen)->getJson('/api/v1/reports/financial')->assertForbidden();
});

it('does not allow a second first administrator to be provisioned', function () {
    $administrator = roleUser('administrator');
    $this->artisan('dineflow:admin:create')
        ->expectsOutput('An administrator already exists; this setup command can only create the first one.')
        ->assertExitCode(1);
    expect(User::whereHas('roles', fn ($query) => $query->where('slug', 'administrator'))->count())->toBe(1);
});
