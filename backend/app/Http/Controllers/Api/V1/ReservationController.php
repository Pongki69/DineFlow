<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DiningSession;
use App\Models\Reservation;
use App\Models\RestaurantFloor;
use App\Models\RestaurantSetting;
use App\Models\RestaurantTable;
use App\Models\TableOccupancyHistory;
use App\Services\AuditLogService;
use App\Services\ReservationService;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ReservationController extends Controller
{
    public function availability(Request $request, ReservationService $service): JsonResponse
    {
        $data = $request->validate(['starts_at' => ['required', 'date'], 'guest_count' => ['required', 'integer', 'min:1', 'max:50'], 'floor_id' => ['nullable', 'integer', 'exists:restaurant_floors,id']]);
        $start = CarbonImmutable::parse($data['starts_at'])->setTimezone($service->timezone());

        return response()->json(['data' => $service->availability($start, (int) $data['guest_count'], isset($data['floor_id']) ? (int) $data['floor_id'] : null), 'policy' => $service->policy()]);
    }

    public function store(Request $request, ReservationService $service): JsonResponse
    {
        abort_unless($request->user()->hasPermission('reservations.create'), 403);
        $data = $request->validate([
            'starts_at' => ['required', 'date'], 'guest_count' => ['required', 'integer', 'min:1', 'max:50'],
            'table_id' => ['nullable', 'integer', 'exists:restaurant_tables,id'], 'floor_id' => ['nullable', 'integer', 'exists:restaurant_floors,id'],
            'guest_name' => ['required', 'string', 'max:120'], 'guest_email' => ['nullable', 'email', 'max:254'],
            'guest_phone' => ['nullable', 'string', 'max:32'], 'notes' => ['nullable', 'string', 'max:1500'],
        ]);
        if (empty($data['table_id']) && ! ($service->policy()['automatic_table_assignment'] ?? false)) {
            return response()->json(['message' => 'Select a table to continue.', 'errors' => ['table_id' => ['A table is required.']]], 422);
        }
        $result = $service->create($request->user(), $data);
        $deposit = $service->policy();

        return response()->json(['data' => $result['reservation'], 'assigned_automatically' => $result['assigned_automatically'], 'deposit_required' => (bool) ($deposit['deposit_required'] ?? false), 'deposit_amount' => (float) ($deposit['deposit_amount'] ?? 0), 'message' => 'Reservation created.'], 201);
    }

    public function index(Request $request, ReservationService $service): JsonResponse
    {
        $filters = $request->validate(['from' => ['nullable', 'date'], 'to' => ['nullable', 'date', 'after_or_equal:from'], 'status' => ['nullable', 'in:pending,confirmed,checked_in,seated,completed,cancelled,no_show'], 'per_page' => ['nullable', 'integer', 'min:1', 'max:100']]);
        $query = Reservation::with(['table:id,table_number,capacity', 'floor:id,name'])->latest('starts_at');
        if (! $request->user()->hasPermission('reservations.manage')) {
            $query->where('customer_id', $request->user()->id);
        }
        if (isset($filters['from'])) {
            $query->where('starts_at', '>=', $filters['from'].' 00:00:00');
        }
        if (isset($filters['to'])) {
            $query->where('starts_at', '<=', $filters['to'].' 23:59:59');
        }
        if (isset($filters['status'])) {
            $query->where('status', $filters['status']);
        }
        $page = $query->with('payments:id,reservation_id,status,amount,method,reference_number')->paginate((int) ($filters['per_page'] ?? 20));
        $depositPolicy = $service->policy();
        $page->getCollection()->each(function ($reservation) use ($depositPolicy): void {
            $reservation->setAttribute('deposit_required', (bool) ($depositPolicy['deposit_required'] ?? false));
            $reservation->setAttribute('deposit_amount', (float) ($depositPolicy['deposit_amount'] ?? 0));
            $reservation->setAttribute('deposit_paid', $reservation->payments->contains(fn ($payment) => $payment->status === 'paid'));
            $reservation->unsetRelation('payments');
        });

        return response()->json($page);
    }

    public function show(Request $request, Reservation $reservation): JsonResponse
    {
        abort_unless($reservation->customer_id === $request->user()->id || $request->user()->hasPermission('reservations.manage'), 404);

        return response()->json(['data' => $reservation->load(['table:id,table_number,capacity', 'floor:id,name', 'history'])]);
    }

    public function updateStatus(Request $request, Reservation $reservation, ReservationService $service): JsonResponse
    {
        $data = $request->validate(['status' => ['required', 'in:confirmed,checked_in,seated,completed,cancelled,no_show'], 'note' => ['nullable', 'string', 'max:500']]);

        return response()->json(['data' => $service->transition($reservation, $request->user(), $data['status'], $data['note'] ?? null)]);
    }

    public function reschedule(Request $request, Reservation $reservation, ReservationService $service): JsonResponse
    {
        $data = $request->validate(['starts_at' => ['required', 'date'], 'guest_count' => ['sometimes', 'integer', 'min:1', 'max:50'], 'table_id' => ['nullable', 'integer', 'exists:restaurant_tables,id'], 'floor_id' => ['nullable', 'integer', 'exists:restaurant_floors,id'], 'guest_name' => ['sometimes', 'string', 'max:120'], 'guest_email' => ['nullable', 'email', 'max:254'], 'guest_phone' => ['nullable', 'string', 'max:32'], 'notes' => ['nullable', 'string', 'max:1500']]);
        $result = $service->reschedule($reservation, $request->user(), $data);

        return response()->json(['data' => $result['reservation'], 'assigned_automatically' => $result['assigned_automatically'], 'message' => 'Reservation rescheduled.'], 201);
    }

    public function occupancy(Request $request, RestaurantTable $table, AuditLogService $audit): JsonResponse
    {
        abort_unless($request->user()->hasPermission('tables.occupancy.manage'), 403);
        $data = $request->validate(['status' => ['required', 'in:available,occupied,cleaning,unavailable'], 'expected_available_at' => ['nullable', 'date', 'after:now'], 'note' => ['nullable', 'string', 'max:500']]);
        $result = DB::transaction(function () use ($table, $request, $data) {
            $locked = RestaurantTable::whereKey($table->id)->lockForUpdate()->firstOrFail();
            $from = $locked->operational_status;
            $session = DiningSession::where('table_id', $locked->id)->where('status', 'open')->lockForUpdate()->first();
            if ($data['status'] === 'occupied' && ! $session) {
                $session = DiningSession::create(['table_id' => $locked->id, 'opened_by' => $request->user()->id, 'guest_count' => 1, 'status' => 'open', 'opened_at' => now()]);
            }
            if ($session && in_array($data['status'], ['cleaning', 'available', 'unavailable'], true)) {
                $session->ensureBillSettled();
                $session->update(['status' => 'closed', 'closed_at' => now(), 'closed_by' => $request->user()->id]);
            }
            $locked->update(['operational_status' => $data['status'], 'expected_available_at' => $data['expected_available_at'] ?? null]);
            TableOccupancyHistory::create(['table_id' => $locked->id, 'dining_session_id' => $session?->id, 'actor_id' => $request->user()->id, 'from_status' => $from, 'to_status' => $data['status'], 'expected_available_at' => $data['expected_available_at'] ?? null, 'note' => $data['note'] ?? null]);

            return $locked->fresh();
        }, 3);
        $audit->record($request->user(), 'table.occupancy_changed', $result, $data, $request);

        return response()->json(['data' => $result]);
    }

    public function policy(Request $request, ReservationService $service): JsonResponse
    {
        abort_unless($request->user()->hasPermission('settings.manage'), 403);
        $data = $request->validate([
            'open_time' => ['required', 'date_format:H:i'], 'close_time' => ['required', 'date_format:H:i', 'after:open_time'],
            'duration_minutes' => ['required', 'integer', 'min:30', 'max:360'], 'buffer_minutes' => ['required', 'integer', 'min:0', 'max:240'],
            'booking_window_days' => ['required', 'integer', 'min:1', 'max:365'], 'grace_minutes' => ['required', 'integer', 'min:0', 'max:120'],
            'cancellation_cutoff_hours' => ['required', 'integer', 'min:0', 'max:168'],
            'automatic_confirmation' => ['required', 'boolean'], 'automatic_table_assignment' => ['required', 'boolean'],
            'deposit_required' => ['sometimes', 'boolean'], 'deposit_amount' => ['sometimes', 'numeric', 'min:0', 'max:100000'],
        ]);
        $data = array_replace($service->policy(), $data);
        if ($data['deposit_required'] && (float) $data['deposit_amount'] < 1) {
            return response()->json(['message' => 'A required reservation deposit must be at least ₱1.00.', 'errors' => ['deposit_amount' => ['Enter a deposit amount of at least ₱1.00.']]], 422);
        }
        RestaurantSetting::updateOrCreate(['key' => 'reservation_policy'], ['value' => $data]);

        return response()->json(['data' => $service->policy()]);
    }

    public function showPolicy(Request $request, ReservationService $service): JsonResponse
    {
        abort_unless($request->user()->hasPermission('settings.manage'), 403);

        return response()->json(['data' => $service->policy()]);
    }

    public function floors(): JsonResponse
    {
        return response()->json(['data' => RestaurantFloor::where('is_active', true)->where('is_published', true)->with(['objects.table:id,table_number,capacity,operational_status,expected_available_at', 'objects.table.currentSession:id,table_id,guest_count,opened_at'])->orderBy('sort_order')->get()]);
    }

    public function adminFloors(): JsonResponse
    {
        return response()->json(['data' => RestaurantFloor::with(['objects.table:id,table_number,capacity,operational_status,expected_available_at', 'objects.table.currentSession:id,table_id,guest_count,opened_at'])->orderBy('sort_order')->get()]);
    }

    public function createFloor(Request $request, AuditLogService $audit): JsonResponse
    {
        abort_unless($request->user()->hasPermission('floorplan.manage'), 403);
        $data = $request->validate(['name' => ['required', 'string', 'max:100'], 'sort_order' => ['sometimes', 'integer', 'min:0', 'max:65535']]);
        $base = Str::slug($data['name']) ?: 'floor';
        $slug = $base;
        $suffix = 2;
        while (RestaurantFloor::where('slug', $slug)->exists()) {
            $slug = $base.'-'.$suffix++;
        }
        $floor = RestaurantFloor::create($data + ['slug' => $slug]);
        $audit->record($request->user(), 'floor_plan.floor_created', $floor, [], $request);

        return response()->json(['data' => $floor], 201);
    }

    public function createFloorTable(Request $request, RestaurantFloor $floor, AuditLogService $audit): JsonResponse
    {
        abort_unless($request->user()->hasPermission('floorplan.manage'), 403);
        $data = $request->validate(['table_number' => ['required', 'string', 'max:32', 'unique:restaurant_tables,table_number'], 'capacity' => ['required', 'integer', 'min:1', 'max:50'], 'zone' => ['nullable', 'string', 'max:60'], 'position' => ['required', 'array'], 'position.x' => ['required', 'numeric', 'between:-100,100'], 'position.z' => ['required', 'numeric', 'between:-100,100']]);
        $table = DB::transaction(function () use ($floor, $data) {
            $lockedFloor = RestaurantFloor::whereKey($floor->id)->lockForUpdate()->firstOrFail();
            $table = RestaurantTable::create(['floor_id' => $lockedFloor->id, 'table_number' => $data['table_number'], 'qr_code' => (string) Str::uuid(), 'capacity' => $data['capacity'], 'zone' => $data['zone'] ?? null, 'is_active' => true, 'operational_status' => 'available']);
            \App\Models\FloorPlanObject::create(['floor_id' => $lockedFloor->id, 'table_id' => $table->id, 'object_type' => 'table', 'label' => $table->table_number, 'position' => $data['position'], 'rotation' => ['y' => 0], 'dimensions' => ['width' => 1.6, 'depth' => 1.4, 'height' => 0.8], 'properties' => ['capacity' => $table->capacity]]);
            $lockedFloor->update(['is_published' => false]);

            return $table;
        }, 3);
        $audit->record($request->user(), 'floor_plan.table_created', $table, ['floor_id' => $floor->id], $request);

        return response()->json(['data' => $table], 201);
    }

    public function updateFloorTable(Request $request, RestaurantTable $table, AuditLogService $audit): JsonResponse
    {
        abort_unless($request->user()->hasPermission('floorplan.manage'), 403);
        $data = $request->validate(['table_number' => ['required', 'string', 'max:32', Rule::unique('restaurant_tables', 'table_number')->ignore($table->id)], 'capacity' => ['required', 'integer', 'min:1', 'max:50'], 'zone' => ['nullable', 'string', 'max:60'], 'is_active' => ['required', 'boolean']]);
        $updated = DB::transaction(function () use ($table, $data) {
            $locked = RestaurantTable::whereKey($table->id)->lockForUpdate()->firstOrFail();
            $session = $locked->currentSession()->first();
            $hasReservations = $locked->reservations()->whereIn('status', ['pending', 'confirmed', 'checked_in', 'seated'])->exists();
            if (($session || $hasReservations) && (! $data['is_active'] || $data['table_number'] !== $locked->table_number)) {
                throw ValidationException::withMessages(['table' => 'A table with an active session or reservation cannot be deactivated or renumbered.']);
            }
            if ($session && $data['capacity'] < $session->guest_count) {
                throw ValidationException::withMessages(['capacity' => 'Capacity cannot be reduced below the active party size.']);
            }
            $largestBooking = $locked->reservations()->whereIn('status', ['pending', 'confirmed', 'checked_in', 'seated'])->max('guest_count');
            if ($largestBooking && $data['capacity'] < $largestBooking) {
                throw ValidationException::withMessages(['capacity' => 'Capacity cannot be reduced below an active reservation party size.']);
            }
            $locked->update($data);
            $locked->floorPlanObject()->update(['label' => $locked->table_number, 'properties' => ['capacity' => $locked->capacity]]);

            return $locked->fresh();
        }, 3);
        $audit->record($request->user(), 'floor_plan.table_updated', $updated, $data, $request);

        return response()->json(['data' => $updated]);
    }

    public function saveLayout(Request $request, RestaurantFloor $floor, AuditLogService $audit): JsonResponse
    {
        abort_unless($request->user()->hasPermission('floorplan.manage'), 403);
        $data = $request->validate(['objects' => ['required', 'array', 'max:300'], 'objects.*.id' => ['nullable', 'integer'], 'objects.*.table_id' => ['nullable', 'integer', 'exists:restaurant_tables,id'], 'objects.*.object_type' => ['required', 'in:table,wall,counter,furniture,entrance,decoration'], 'objects.*.label' => ['nullable', 'string', 'max:100'], 'objects.*.position' => ['required', 'array'], 'objects.*.position.x' => ['required', 'numeric', 'between:-100,100'], 'objects.*.position.z' => ['required', 'numeric', 'between:-100,100'], 'objects.*.rotation' => ['nullable', 'array'], 'objects.*.rotation.y' => ['nullable', 'numeric', 'between:-6.283,6.283'], 'objects.*.dimensions' => ['nullable', 'array'], 'objects.*.dimensions.width' => ['nullable', 'numeric', 'between:0.2,30'], 'objects.*.dimensions.depth' => ['nullable', 'numeric', 'between:0.2,30'], 'objects.*.dimensions.height' => ['nullable', 'numeric', 'between:0.2,10'], 'objects.*.properties' => ['nullable', 'array'], 'objects.*.sort_order' => ['sometimes', 'integer', 'min:0']]);
        DB::transaction(function () use ($floor, $data) {
            $lockedFloor = RestaurantFloor::whereKey($floor->id)->lockForUpdate()->firstOrFail();
            foreach ($data['objects'] as $object) {
                $id = $object['id'] ?? null;
                unset($object['id']);
                if (isset($object['table_id'])) {
                    $table = RestaurantTable::whereKey($object['table_id'])->lockForUpdate()->firstOrFail();
                    if ($table->floor_id && $table->floor_id !== $lockedFloor->id && ($table->currentSession()->exists() || $table->reservations()->whereIn('status', ['pending', 'confirmed', 'checked_in', 'seated'])->exists())) {
                        throw ValidationException::withMessages(['objects' => "Table {$table->table_number} cannot be moved while it has an active session or reservation."]);
                    }
                    $table->update(['floor_id' => $lockedFloor->id]);
                }
                if ($id) {
                    FloorPlanObject::where('floor_id', $lockedFloor->id)->whereKey($id)->update($object);
                } else {
                    FloorPlanObject::create($object + ['floor_id' => $lockedFloor->id]);
                }
            }
            $lockedFloor->update(['is_published' => false]);
        }, 3);
        $audit->record($request->user(), 'floor_plan.saved_draft', $floor, ['object_count' => count($data['objects'])], $request);

        return response()->json(['data' => $floor->fresh()->load('objects.table')]);
    }

    public function publish(Request $request, RestaurantFloor $floor, AuditLogService $audit): JsonResponse
    {
        abort_unless($request->user()->hasPermission('floorplan.manage'), 403);
        abort_if($floor->objects()->doesntExist(), 422, 'Add at least one layout object before publishing.');
        $floor->update(['is_published' => true]);
        $audit->record($request->user(), 'floor_plan.published', $floor, [], $request);

        return response()->json(['data' => $floor->fresh()->load('objects.table')]);
    }
}
