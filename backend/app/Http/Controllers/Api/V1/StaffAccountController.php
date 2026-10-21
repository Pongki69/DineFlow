<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\User;
use App\Models\AuditLog;
use App\Models\Delivery;
use App\Models\RiderProfile;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rules\Password;

class StaffAccountController extends Controller
{
    public function index(): JsonResponse
    {
        $users = User::whereHas('roles', fn ($query) => $query->where('slug', '!=', 'customer'))
            ->with('roles:id,name,slug')->orderBy('name')->paginate(30);
        return response()->json($users);
    }

    public function roles(): JsonResponse
    {
        return response()->json(['data' => Role::orderBy('name')->get(['id', 'name', 'slug'])]);
    }

    public function auditLogs(): JsonResponse
    {
        return response()->json(AuditLog::with('actor:id,name,email')->latest()->paginate(50));
    }

    public function store(Request $request, AuditLogService $audit): JsonResponse
    {
        if ($request->has('email')) $request->merge(['email' => mb_strtolower(trim((string) $request->input('email')))]);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'], 'email' => ['required', 'email', 'max:254', 'unique:users,email'],
            'password' => ['required', 'confirmed', Password::min(12)->mixedCase()->numbers()->symbols()],
            'role' => ['required', 'string', 'exists:roles,slug', 'not_in:customer'],
        ]);

        $user = DB::transaction(function () use ($data): User {
            $user = User::create(['name' => $data['name'], 'email' => $data['email'], 'password' => $data['password'], 'is_active' => true]);
            $user->roles()->sync([Role::where('slug', $data['role'])->value('id')]);
            if ($data['role'] === 'rider') RiderProfile::firstOrCreate(['user_id' => $user->id]);
            return $user;
        });

        $audit->record($request->user(), 'staff.created', $user, ['role' => $data['role']], $request);

        return response()->json(['id' => $user->id, 'name' => $user->name, 'email' => $user->email, 'role' => $data['role']], 201);
    }

    public function setActive(Request $request, User $user, AuditLogService $audit): JsonResponse
    {
        $data = $request->validate(['is_active' => ['required', 'boolean']]);
        abort_if($request->user()->is($user), 422, 'Administrators cannot deactivate their own account here.');
        if (! $data['is_active'] && $user->hasRole('rider') && Delivery::where('rider_user_id', $user->id)->whereNotIn('status', Delivery::TERMINAL)->exists()) return response()->json(['message' => 'Reassign this rider’s active deliveries before deactivating the account.'], 422);

        $user->forceFill(['is_active' => $data['is_active']])->save();
        if (! $user->is_active) {
            $user->tokens()->delete();
            DB::table('sessions')->where('user_id', $user->id)->delete();
        }
        $audit->record($request->user(), $user->is_active ? 'account.activated' : 'account.deactivated', $user, [], $request);

        return response()->json(['id' => $user->id, 'is_active' => $user->is_active]);
    }

    public function assignRole(Request $request, User $user, AuditLogService $audit): JsonResponse
    {
        $data = $request->validate(['role' => ['required', 'string', 'exists:roles,slug']]);
        abort_if($request->user()->is($user), 422, 'Administrators cannot change their own role here.');
        $role = Role::where('slug', $data['role'])->firstOrFail();
        if ($user->hasRole('rider') && $role->slug !== 'rider' && Delivery::where('rider_user_id', $user->id)->whereNotIn('status', Delivery::TERMINAL)->exists()) return response()->json(['message' => 'Reassign this rider’s active deliveries before changing their role.'], 422);
        $user->roles()->sync([$role->id]);
        if ($role->slug === 'rider') RiderProfile::firstOrCreate(['user_id' => $user->id]);
        $audit->record($request->user(), 'account.role_assigned', $user, ['role' => $role->slug], $request);

        return response()->json(['id' => $user->id, 'role' => $role->slug]);
    }
}
