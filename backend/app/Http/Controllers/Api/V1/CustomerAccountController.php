<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\CustomerAccountDeletion;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class CustomerAccountController extends Controller
{
    public function destroy(Request $request, CustomerAccountDeletion $deletion): JsonResponse
    {
        $data = $request->validate([
            'current_password' => ['required', 'string', 'max:255'],
            'confirmation' => ['required', 'accepted'],
        ]);
        $deletion->delete($request->user(), $data['current_password'], $request);
        if ($request->hasSession()) {
            // Avoid cycling a remember token on a user row that has been deleted.
            Auth::guard('web')->logoutCurrentDevice();
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->json(['message' => 'Your account has been deleted.'])->header('Cache-Control', 'no-store');
    }
}
