<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\LoginRequest;
use App\Http\Requests\RegisterRequest;
use App\Models\Role;
use App\Models\User;
use App\Services\AuditLogService;
use Illuminate\Auth\Events\Registered;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Validation\Rules\Password as PasswordRule;

class AuthController extends Controller
{
    public function register(RegisterRequest $request, AuditLogService $audit): JsonResponse
    {
        $user = DB::transaction(function () use ($request, $audit): User {
            $customer = Role::where('slug', 'customer')->firstOrFail();
            $user = User::create([...$request->safe()->only(['name', 'email', 'password']), 'is_active' => true]);
            $user->roles()->sync([$customer->id]);
            $user->customerProfile()->create();
            $audit->record($user, 'account.registered', $user, [], $request);

            return $user;
        });
        event(new Registered($user));
        if ($request->hasSession()) {
            Auth::guard('web')->login($user);
            $request->session()->regenerate();
        }

        return response()->json(['user' => $this->userPayload($user)], 201);
    }

    public function login(LoginRequest $request): JsonResponse
    {
        abort_unless($request->hasSession(), 419, 'Sign-in requires a first-party SPA session.');
        $user = User::where('email', mb_strtolower((string) $request->input('email')))->first();
        if (! $user || ! $user->is_active || ! Hash::check((string) $request->input('password'), $user->password)) {
            return response()->json(['message' => 'The provided credentials are incorrect.'], 422);
        }

        Auth::guard('web')->login($user, $request->boolean('remember'));
        $request->session()->regenerate();

        return response()->json(['user' => $this->userPayload($user)]);
    }

    public function logout(Request $request, AuditLogService $audit): JsonResponse
    {
        $user = $request->user();
        $audit->record($user, 'auth.logout', $user, [], $request);
        if ($request->hasSession()) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        } else {
            $user?->currentAccessToken()?->delete();
        }

        return response()->json(['message' => 'Signed out.']);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['user' => $this->userPayload($request->user())]);
    }

    public function update(Request $request, AuditLogService $audit): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'current_password' => ['required_with:password', 'current_password:web'],
            'password' => ['nullable', 'confirmed', PasswordRule::min(12)->mixedCase()->numbers()->symbols()],
        ]);
        $user->name = $data['name'];
        if (! empty($data['password'])) {
            $user->password = $data['password'];
        }
        $user->save();
        if (! empty($data['password'])) {
            $user->tokens()->delete();
            DB::table('sessions')->where('user_id', $user->id)->when($request->hasSession(), fn ($query) => $query->where('id', '!=', $request->session()->getId()))->delete();
            if ($request->hasSession()) {
                $request->session()->regenerate();
            }
        }
        $audit->record($user, 'account.updated', $user, ['password_changed' => ! empty($data['password'])], $request);

        return response()->json(['user' => $this->userPayload($user)]);
    }

    public function forgotPassword(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email']]);
        $data['email'] = mb_strtolower(trim($data['email']));
        ResetPassword::createUrlUsing(fn (User $user, string $token): string => rtrim((string) config('app.frontend_url'), '/').'/reset-password?token='.urlencode($token).'&email='.urlencode($user->email));
        Password::sendResetLink($data);

        // Same response avoids disclosing whether an address has an account.
        return response()->json(['message' => 'If the account exists, password recovery instructions will be sent.']);
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'token' => ['required', 'string'], 'email' => ['required', 'email'],
            'password' => ['required', 'confirmed', PasswordRule::min(12)->mixedCase()->numbers()->symbols()],
        ]);
        $data['email'] = mb_strtolower(trim($data['email']));

        $status = Password::reset($data, function (User $user, string $password): void {
            $user->forceFill(['password' => $password, 'remember_token' => str()->random(60)])->save();
            $user->tokens()->delete();
            DB::table('sessions')->where('user_id', $user->id)->delete();
        });

        return $status === Password::PASSWORD_RESET
            ? response()->json(['message' => 'Password reset successfully.'])
            : response()->json(['message' => __($status)], 422);
    }

    private function userPayload(User $user): array
    {
        return [
            'id' => $user->id, 'name' => $user->name, 'email' => $user->email,
            'roles' => $user->roles()->pluck('slug')->all(), 'permissions' => $user->permissionSlugs(),
        ];
    }
}
