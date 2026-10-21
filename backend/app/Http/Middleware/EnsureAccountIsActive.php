<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureAccountIsActive
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if ($user && ! $user->is_active) {
            if ($user->currentAccessToken() && method_exists($user->currentAccessToken(), 'delete')) {
                $user->currentAccessToken()->delete();
            }
            if ($request->hasSession()) {
                auth('web')->logout();
                $request->session()->invalidate();
                $request->session()->regenerateToken();
            }

            return response()->json(['message' => 'This account is deactivated.'], 403);
        }

        return $next($request);
    }
}
