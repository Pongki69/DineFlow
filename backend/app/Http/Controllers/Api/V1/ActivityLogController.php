<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\User;
use App\Services\ActivityLogPresenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;

/**
 * Who did what, and when. Everyone sees their own actions; administrators
 * see everyone's, so a problem is traced to the right person.
 */
class ActivityLogController extends Controller
{
    public function __construct(private ActivityLogPresenter $presenter) {}

    public function mine(Request $request): JsonResponse
    {
        return $this->respond($request, $request->user()->id);
    }

    public function everyone(Request $request): JsonResponse
    {
        $request->validate(['actor_id' => ['nullable', 'integer', 'exists:users,id']]);

        return $this->respond($request, $request->integer('actor_id') ?: null);
    }

    /** Staff who have done something, for the person filter. */
    public function people(): JsonResponse
    {
        $people = User::whereIn('id', AuditLog::whereNotNull('actor_id')->select('actor_id')->distinct())
            ->whereHas('roles', fn ($query) => $query->where('slug', '!=', 'customer'))
            ->with('roles:id,name')->orderBy('name')->get(['id', 'name']);

        return response()->json(['data' => $people->map(fn (User $user) => [
            'id' => $user->id, 'name' => $user->name, 'role' => $user->roles->first()?->name,
        ])]);
    }

    private function respond(Request $request, ?int $actorId): JsonResponse
    {
        $data = $request->validate([
            'area' => ['nullable', Rule::in(array_keys(ActivityLogPresenter::AREAS))],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ]);
        $zone = config('app.timezone');
        $query = AuditLog::with(['actor:id,name', 'actor.roles:id,name'])
            ->when($actorId, fn ($q) => $q->where('actor_id', $actorId))
            ->when($data['from'] ?? null, fn ($q, $from) => $q->where('created_at', '>=', Carbon::parse($from, $zone)->startOfDay()->utc()))
            ->when($data['to'] ?? null, fn ($q, $to) => $q->where('created_at', '<=', Carbon::parse($to, $zone)->endOfDay()->utc()));
        if (! empty($data['area'])) {
            ActivityLogPresenter::whereArea($query, $data['area']);
        }
        $page = $query->latest()->orderByDesc('id')->paginate($data['per_page'] ?? 25);

        return response()->json([
            'data' => $this->presenter->present($page->getCollection()),
            'current_page' => $page->currentPage(),
            'last_page' => $page->lastPage(),
            'total' => $page->total(),
            'from' => $page->firstItem(),
            'to' => $page->lastItem(),
        ]);
    }
}
