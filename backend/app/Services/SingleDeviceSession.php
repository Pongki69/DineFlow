<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * One signed-in device per account: each sign-in claims the account for the
 * device it came from, and every other device is signed out on its next request.
 */
class SingleDeviceSession
{
    public const SESSION_KEY = 'device_token';

    /**
     * Call just before signing in, so other devices' "remember me" cookies stop
     * working. Signing in with "remember me" then issues a fresh key.
     */
    public function forgetOtherDevices(User $user): void
    {
        $user->setRememberToken(null);
        $user->save();
    }

    /** Call after signing in: this device now holds the account. */
    public function claim(User $user, Request $request): void
    {
        if (! $request->hasSession()) {
            return;
        }
        $token = Str::random(64);
        $user->forceFill(['session_token' => $token])->save();
        $request->session()->put(self::SESSION_KEY, $token);
    }

    public function holds(User $user, Request $request): bool
    {
        return hash_equals((string) $user->session_token, (string) $request->session()->get(self::SESSION_KEY));
    }
}
