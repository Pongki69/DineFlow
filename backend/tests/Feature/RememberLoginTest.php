<?php

use App\Models\User;
use Database\Seeders\AuthSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->seed(AuthSeeder::class);
    config(['sanctum.stateful' => ['localhost'], 'session.secure' => true]);
    $this->withHeaders(['Origin' => 'http://localhost', 'Referer' => 'http://localhost/']);
    User::create(['name' => 'Remember Customer', 'email' => 'remember@example.test', 'password' => 'Remember-Test-Password-123!', 'is_active' => true]);
});

it('issues a secure thirty-day remember cookie only when requested', function () {
    $name = Auth::guard('web')->getRecallerName();
    $response = $this->postJson('/api/v1/login', ['email' => 'remember@example.test', 'password' => 'Remember-Test-Password-123!', 'remember' => true])->assertOk()->assertCookie($name);
    $cookie = $response->getCookie($name, false);
    expect($cookie->isHttpOnly())->toBeTrue();
    expect($cookie->isSecure())->toBeTrue();
    expect($cookie->getSameSite())->toBe('lax');
    expect($cookie->getExpiresTime())->toBeGreaterThan(now()->addDays(29)->timestamp)->toBeLessThanOrEqual(now()->addDays(30)->addMinute()->timestamp);
    expect($cookie->getValue())->not->toContain('Remember-Test-Password-123!');
});

it('clears any previous remembered login when the device option is unchecked', function () {
    $this->postJson('/api/v1/login', ['email' => 'remember@example.test', 'password' => 'Remember-Test-Password-123!', 'remember' => false])->assertOk()->assertCookieExpired(Auth::guard('web')->getRecallerName());
    expect(User::where('email', 'remember@example.test')->first()->getRememberToken())->toBeEmpty();
});

it('restores an expired session but rejects the remembered cookie after a password change', function () {
    $this->withCredentials();
    $name = Auth::guard('web')->getRecallerName();
    $response = $this->postJson('/api/v1/login', ['email' => 'remember@example.test', 'password' => 'Remember-Test-Password-123!', 'remember' => true])->assertOk();
    $cookie = $response->getCookie($name, false)->getValue();
    $this->flushSession();
    Auth::forgetGuards();
    $this->withUnencryptedCookie($name, $cookie)->getJson('/api/v1/me')->assertOk()->assertJsonPath('user.email', 'remember@example.test');

    User::where('email', 'remember@example.test')->first()->update(['password' => 'Changed-Test-Password-123!']);
    $this->flushSession();
    Auth::forgetGuards();
    $this->withUnencryptedCookie($name, $cookie)->getJson('/api/v1/me')->assertUnauthorized();
});

it('rejects failed or inactive logins without creating remembered access', function () {
    $name = Auth::guard('web')->getRecallerName();
    $this->postJson('/api/v1/login', ['email' => 'remember@example.test', 'password' => 'Wrong-password', 'remember' => true])->assertUnprocessable()->assertCookieMissing($name);
    User::where('email', 'remember@example.test')->update(['is_active' => false]);
    $this->postJson('/api/v1/login', ['email' => 'remember@example.test', 'password' => 'Remember-Test-Password-123!', 'remember' => true])->assertUnprocessable()->assertCookieMissing($name);
});
