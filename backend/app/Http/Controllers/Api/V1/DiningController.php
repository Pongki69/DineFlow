<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DiningSession;
use App\Models\RestaurantTable;
use App\Models\TableOccupancyHistory;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class DiningController extends Controller
{
    public function tables(Request $request): JsonResponse
    {
        $tables = RestaurantTable::with(['currentSession'])->orderBy('table_number')->get();

        return response()->json(['data' => $tables]);
    }

    public function createTable(Request $request): JsonResponse
    {
        $data = $request->validate(['table_number' => ['required', 'string', 'max:40', 'unique:restaurant_tables,table_number'], 'capacity' => ['required', 'integer', 'min:1', 'max:50'], 'is_active' => ['sometimes', 'boolean']]);
        $table = RestaurantTable::create($data + ['qr_code' => (string) Str::uuid()]);

        return response()->json(['data' => $table], 201);
    }

    public function openSession(Request $request, RestaurantTable $table, AuditLogService $audit): JsonResponse
    {
        $data = $request->validate(['guest_count' => ['required', 'integer', 'min:1']]);
        $session = DB::transaction(function () use ($data, $table, $request) {
            $locked = RestaurantTable::whereKey($table->id)->lockForUpdate()->firstOrFail();
            if (! $locked->is_active || $locked->operational_status !== 'available' || $data['guest_count'] > $locked->capacity) {
                throw ValidationException::withMessages(['guest_count' => 'This table is unavailable or too small for the party.']);
            }
            if (DiningSession::where('table_id', $locked->id)->where('status', 'open')->exists()) {
                throw ValidationException::withMessages(['table' => 'This table already has an open dining session.']);
            }
            $session = DiningSession::create(['table_id' => $locked->id, 'opened_by' => $request->user()->id, 'guest_count' => $data['guest_count'], 'status' => 'open', 'opened_at' => now()]);
            $from = $locked->operational_status;
            $locked->update(['operational_status' => 'occupied', 'expected_available_at' => null]);
            TableOccupancyHistory::create(['table_id' => $locked->id, 'dining_session_id' => $session->id, 'actor_id' => $request->user()->id, 'from_status' => $from, 'to_status' => 'occupied']);

            return $session;
        });
        $audit->record($request->user(), 'dining_session.opened', $session, ['table_id' => $table->id], $request);

        return response()->json(['data' => $session], 201);
    }

    public function closeSession(Request $request, DiningSession $session, AuditLogService $audit): JsonResponse
    {
        $closed = DB::transaction(function () use ($session, $request) {
            $lockedSession = DiningSession::whereKey($session->id)->lockForUpdate()->firstOrFail();
            abort_unless($lockedSession->status === 'open', 422, 'Dining session is already closed.');
            $lockedSession->ensureBillSettled();
            $table = RestaurantTable::whereKey($lockedSession->table_id)->lockForUpdate()->firstOrFail();
            $lockedSession->update(['status' => 'closed', 'closed_at' => now(), 'closed_by' => $request->user()->id]);
            $from = $table->operational_status;
            $table->update(['operational_status' => 'cleaning', 'expected_available_at' => null]);
            TableOccupancyHistory::create(['table_id' => $table->id, 'dining_session_id' => $lockedSession->id, 'actor_id' => $request->user()->id, 'from_status' => $from, 'to_status' => 'cleaning']);

            return $lockedSession;
        }, 3);
        $audit->record($request->user(), 'dining_session.closed', $closed, [], $request);

        return response()->json(['data' => $closed->fresh()]);
    }
}
