<?php

use App\Models\RestaurantSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;

uses(RefreshDatabase::class);

it('prepares roles and the first admin without changing them or saved settings on restart', function () {
    config(['hosting.admin_name' => 'Portfolio Admin', 'hosting.admin_email' => 'portfolio@example.test', 'hosting.admin_password' => 'Example-Strong-Password-72!']);
    $this->artisan('dineflow:deploy')->assertSuccessful();
    $admin = User::where('email', 'portfolio@example.test')->firstOrFail();
    expect($admin->hasRole('administrator'))->toBeTrue();
    expect(Hash::check('Example-Strong-Password-72!', $admin->password))->toBeTrue();
    RestaurantSetting::where('key', 'tax_percent')->update(['value' => ['rate' => 12]]);
    config(['hosting.admin_password' => 'Different-Strong-Password-73!']);
    $this->artisan('dineflow:deploy')->assertSuccessful();
    expect(User::count())->toBe(1);
    expect(Hash::check('Example-Strong-Password-72!', $admin->fresh()->password))->toBeTrue();
    expect(RestaurantSetting::where('key', 'tax_percent')->value('value'))->toBe(['rate' => 12]);
    $this->assertDatabaseCount('audit_logs', 1);
});

it('does not promote an existing customer or create an admin with a weak password', function () {
    User::create(['name' => 'Existing User', 'email' => 'existing@example.test', 'password' => 'Existing-Password-72!', 'is_active' => true]);
    config(['hosting.admin_name' => 'Admin', 'hosting.admin_email' => 'existing@example.test', 'hosting.admin_password' => 'Example-Strong-Password-72!']);
    $this->artisan('dineflow:deploy')->assertFailed();
    config(['hosting.admin_email' => 'other@example.test', 'hosting.admin_password' => 'weak']);
    $this->artisan('dineflow:deploy')->assertFailed();
    expect(User::whereHas('roles', fn ($query) => $query->where('slug', 'administrator'))->exists())->toBeFalse();
});

it('serves built React routes without intercepting missing API routes or assets', function () {
    $index = tempnam(sys_get_temp_dir(), 'dineflow-spa-');
    file_put_contents($index, '<!doctype html><title>DineFlow test</title>');
    config(['hosting.spa_index' => $index]);
    try {
        $this->get('/')->assertOk()->assertHeader('Content-Type', 'text/html; charset=UTF-8');
        $this->get('/my-orders')->assertOk();
        $this->get('/api/v1/missing-route')->assertNotFound();
        $this->get('/assets/missing-file.js')->assertNotFound();
        $this->get('/sanctum/missing-route')->assertNotFound();
    } finally {
        unlink($index);
    }
});
