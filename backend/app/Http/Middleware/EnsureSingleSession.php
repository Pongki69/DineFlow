<?php

namespace App\Http\Middleware;

use App\Services\SingleDeviceSession;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cookie;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

class EnsureSingleSession
{
    public function __construct(private SingleDeviceSession $devices) {}

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        // Only browser sessions are devices; API tokens are left alone.
        if (! $user || ! $request->hasSession() || $user->currentAccessToken() instanceof PersonalAccessToken) {
            return $next($request);
        }
        if ($user->session_token === null) {
            // Signed in before this rule existed: the first device seen keeps it.
            $this->devices->claim($user, $request);

            return $next($request);
        }
        if ($this->devices->holds($user, $request)) {
            return $next($request);
        }
        if (auth('web')->viaRemember()) {
            // Only the latest sign-in has a working "remember me" cookie, so a
            // session restored from it belongs to the device that holds the account.
            $request->session()->put(SingleDeviceSession::SESSION_KEY, $user->session_token);

            return $next($request);
        }

        // Not logout(): that would also reset the account's "remember me" key
        // and sign out the device that does hold the account.
        auth('web')->forgetUser();
        Cookie::queue(Cookie::forget(auth('web')->getRecallerName()));
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json([
            'code' => 'session_replaced',
            'message' => 'You were signed out because this account signed in on another device.',
        ], 401);
    }
}
