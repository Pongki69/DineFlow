<?php

use App\Models\User;
use Database\Seeders\AuthSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->seed(AuthSeeder::class);
    config(['sanctum.stateful' => ['localhost']]);
    $this->withHeaders(['Origin' => 'http://localhost', 'Referer' => 'http://localhost/']);
    $this->user = User::create(['name' => 'One Device', 'email' => 'one.device@example.test', 'password' => 'One-Device-Password-123!', 'is_active' => true]);
});

function signInOneDevice(bool $remember = false)
{
    return test()->postJson('/api/v1/login', ['email' => 'one.device@example.test', 'password' => 'One-Device-Password-123!', 'remember' => $remember])->assertOk();
}

it('keeps the device that signed in last', function () {
    signInOneDevice();

    $this->getJson('/api/v1/me')->assertOk()->assertJsonPath('user.email', 'one.device@example.test');
    expect($this->user->fresh()->session_token)->not->toBeNull()
        ->and($this->getJson('/api/v1/me')->json('user'))->not->toHaveKey('session_token');
});

it('signs this device out once the account signs in on another device', function () {
    signInOneDevice();
    // Another device signs in: it takes the account over.
    $this->user->fresh()->forceFill(['session_token' => str_repeat('b', 64)])->save();
    Auth::forgetGuards();

    $this->getJson('/api/v1/me')->assertUnauthorized()->assertJsonPath('code', 'session_replaced');
    Auth::forgetGuards();
    $this->getJson('/api/v1/me')->assertUnauthorized()->assertJsonPath('code', 'unauthenticated');
});

it('stops an older device being restored from its remember-me cookie', function () {
    $this->withCredentials();
    $name = Auth::guard('web')->getRecallerName();
    $old = signInOneDevice(true)->getCookie($name, false)->getValue();

    // The account signs in again elsewhere.
    $this->flushSession();
    Auth::forgetGuards();
    signInOneDevice(true);

    $this->flushSession();
    Auth::forgetGuards();
    $this->withUnencryptedCookie($name, $old)->getJson('/api/v1/me')->assertUnauthorized();
});
