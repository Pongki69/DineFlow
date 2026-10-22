<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DiningSession;
use App\Models\FloorPlanObject;
use App\Models\FloorPlanPreset;
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
        $data = $request->validate(['starts_at' => ['required', 'date'], 'guest_count' => ['required', 'integer', 'min:1', 'max:50'], 'floor_id' => ['nullable', 'integer', 'exists:restaurant_floors,id'], 'include_small_tables' => ['sometimes', 'boolean']]);
        $start = CarbonImmutable::parse($data['starts_at'])->setTimezone($service->timezone());

        return response()->json(['data' => $service->availability($start, (int) $data['guest_count'], isset($data['floor_id']) ? (int) $data['floor_id'] : null, (bool) ($data['include_small_tables'] ?? false)), 'policy' => $service->policy()]);
    }

    public function store(Request $request, ReservationService $service): JsonResponse
    {
        abort_unless($request->user()->hasPermission('reservations.create'), 403);
        $data = $request->validate([
            'starts_at' => ['required', 'date'], 'guest_count' => ['required', 'integer', 'min:1', 'max:50'],
            'table_id' => ['nullable', 'integer', 'exists:restaurant_tables,id'], 'table_ids' => ['nullable', 'array', 'min:1', 'max:12'], 'table_ids.*' => ['integer', 'distinct', 'exists:restaurant_tables,id'], 'floor_id' => ['nullable', 'integer', 'exists:restaurant_floors,id'],
            'guest_name' => ['required', 'string', 'max:120'], 'guest_email' => ['nullable', 'email', 'max:254'],
            'guest_phone' => ['nullable', 'string', 'max:32'], 'notes' => ['nullable', 'string', 'max:1500'],
        ]);
        if (empty($data['table_id']) && empty($data['table_ids']) && ! ($service->policy()['automatic_table_assignment'] ?? false)) {
            return response()->json(['message' => 'Select a table to continue.', 'errors' => ['table_id' => ['A table is required.']]], 422);
        }
        $result = $service->create($request->user(), $data);
        $deposit = $service->policy();

        return response()->json(['data' => $result['reservation'], 'assigned_automatically' => $result['assigned_automatically'], 'deposit_required' => (bool) ($deposit['deposit_required'] ?? false), 'deposit_amount' => (float) ($deposit['deposit_amount'] ?? 0), 'message' => 'Reservation created.'], 201);
    }

    public function index(Request $request, ReservationService $service): JsonResponse
    {
        $filters = $request->validate(['from' => ['nullable', 'date'], 'to' => ['nullable', 'date', 'after_or_equal:from'], 'status' => ['nullable', 'in:pending,confirmed,checked_in,seated,completed,cancelled,no_show'], 'per_page' => ['nullable', 'integer', 'min:1', 'max:100']]);
        $query = Reservation::with(['table:id,table_number,capacity', 'tables:id,table_number,capacity', 'floor:id,name'])->latest('starts_at');
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

        return response()->json(['data' => $reservation->load(['table:id,table_number,capacity', 'tables:id,table_number,capacity', 'floor:id,name', 'history'])]);
    }

    public function updateStatus(Request $request, Reservation $reservation, ReservationService $service): JsonResponse
    {
        $data = $request->validate(['status' => ['required', 'in:confirmed,checked_in,seated,completed,cancelled,no_show'], 'note' => ['nullable', 'string', 'max:500']]);

        return response()->json(['data' => $service->transition($reservation, $request->user(), $data['status'], $data['note'] ?? null)]);
    }

    public function reschedule(Request $request, Reservation $reservation, ReservationService $service): JsonResponse
    {
        $data = $request->validate(['starts_at' => ['required', 'date'], 'guest_count' => ['sometimes', 'integer', 'min:1', 'max:50'], 'table_id' => ['nullable', 'integer', 'exists:restaurant_tables,id'], 'table_ids' => ['nullable', 'array', 'min:1', 'max:12'], 'table_ids.*' => ['integer', 'distinct', 'exists:restaurant_tables,id'], 'floor_id' => ['nullable', 'integer', 'exists:restaurant_floors,id'], 'guest_name' => ['sometimes', 'string', 'max:120'], 'guest_email' => ['nullable', 'email', 'max:254'], 'guest_phone' => ['nullable', 'string', 'max:32'], 'notes' => ['nullable', 'string', 'max:1500']]);
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

    public function presets(): JsonResponse
    {
        return response()->json(['data' => FloorPlanPreset::orderBy('name')->get()]);
    }

    public function storePreset(Request $request, AuditLogService $audit): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100', 'unique:floor_plan_presets,name'],
            'definition' => ['required', 'array'],
            'definition.type' => ['sometimes', 'in:table,group'],
            'definition.shape' => ['required_unless:definition.type,group', 'in:short,long'],
            'definition.capacity' => ['required_unless:definition.type,group', 'integer', 'min:1', 'max:12'],
            'definition.dimensions' => ['required_unless:definition.type,group', 'array'],
            'definition.dimensions.width' => ['required_unless:definition.type,group', 'numeric', 'between:0.2,30'],
            'definition.dimensions.depth' => ['required_unless:definition.type,group', 'numeric', 'between:0.2,30'],
            'definition.chair_layout' => ['nullable', 'array'],
            'definition.chair_layout.top' => ['nullable', 'integer', 'min:0', 'max:12'],
            'definition.chair_layout.bottom' => ['nullable', 'integer', 'min:0', 'max:12'],
            'definition.chair_layout.left' => ['nullable', 'integer', 'min:0', 'max:12'],
            'definition.chair_layout.right' => ['nullable', 'integer', 'min:0', 'max:12'],
            'definition.chair_layout.around' => ['nullable', 'integer', 'min:1', 'max:12'],
            'definition.objects' => ['required_if:definition.type,group', 'array', 'min:2', 'max:50'],
            'definition.objects.*.object_type' => ['required_if:definition.type,group', 'in:table,wall,door,counter,furniture,entrance,decoration,flooring'],
            'definition.objects.*.label' => ['nullable', 'string', 'max:100'],
            'definition.objects.*.position' => ['required_if:definition.type,group', 'array'],
            'definition.objects.*.position.x' => ['required_if:definition.type,group', 'numeric', 'between:-100,100'],
            'definition.objects.*.position.z' => ['required_if:definition.type,group', 'numeric', 'between:-100,100'],
            'definition.objects.*.rotation' => ['nullable', 'array'],
            'definition.objects.*.rotation.y' => ['nullable', 'numeric', 'between:-6.283,6.283'],
            'definition.objects.*.dimensions' => ['required_if:definition.type,group', 'array'],
            'definition.objects.*.dimensions.width' => ['required_if:definition.type,group', 'numeric', 'between:0,30'],
            'definition.objects.*.dimensions.depth' => ['required_if:definition.type,group', 'numeric', 'between:0,30'],
            'definition.objects.*.dimensions.height' => ['nullable', 'numeric', 'between:0,10'],
            'definition.objects.*.properties' => ['nullable', 'array'],
        ]);
        $preset = FloorPlanPreset::create(['created_by' => $request->user()->id, ...$data]);
        $audit->record($request->user(), 'floor_plan.preset_created', $preset, ['name' => $preset->name], $request);

        return response()->json(['data' => $preset], 201);
    }

    public function deletePreset(Request $request, FloorPlanPreset $preset, AuditLogService $audit): JsonResponse
    {
        $audit->record($request->user(), 'floor_plan.preset_deleted', $preset, ['name' => $preset->name], $request);
        $preset->delete();

        return response()->json([], 204);
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

    public function deleteDraftFloor(Request $request, RestaurantFloor $floor, AuditLogService $audit): JsonResponse
    {
        abort_unless($request->user()->hasPermission('floorplan.manage'), 403);

        $deletedFloor = DB::transaction(function () use ($floor): RestaurantFloor {
            $lockedFloor = RestaurantFloor::whereKey($floor->id)->lockForUpdate()->firstOrFail();
            if ($lockedFloor->is_published) {
                throw ValidationException::withMessages(['floor' => 'Published floors cannot be deleted. Save the layout as a draft first.']);
            }

            $tables = RestaurantTable::where('floor_id', $lockedFloor->id)->lockForUpdate()->get();
            foreach ($tables as $table) {
                if ($table->currentSession()->exists() || $this->activeTableReservations($table->id)->exists()) {
                    throw ValidationException::withMessages(['floor' => 'This floor has an active dining session or reservation. Resolve it before deleting the draft floor.']);
                }
            }

            // Keep table and reservation history while removing these tables from operations.
            RestaurantTable::whereIn('id', $tables->pluck('id'))->update([
                'floor_id' => null,
                'is_active' => false,
                'operational_status' => 'unavailable',
            ]);

            $lockedFloor->delete();

            return $lockedFloor;
        }, 3);

        $audit->record($request->user(), 'floor_plan.draft_floor_deleted', $deletedFloor, ['name' => $deletedFloor->name], $request);

        return response()->json([], 204);
    }

    public function createFloorTable(Request $request, RestaurantFloor $floor, AuditLogService $audit): JsonResponse
    {
        abort_unless($request->user()->hasPermission('floorplan.manage'), 403);
        $data = $request->validate(['table_number' => ['required', 'string', 'max:32'], 'capacity' => ['required', 'integer', 'min:1', 'max:12'], 'zone' => ['nullable', 'string', 'max:60'], 'shape' => ['sometimes', 'in:short,long'], 'dimensions' => ['sometimes', 'array'], 'dimensions.width' => ['sometimes', 'numeric', 'between:0.2,30'], 'dimensions.depth' => ['sometimes', 'numeric', 'between:0.2,30'], 'chair_layout' => ['sometimes', 'array'], 'chair_layout.top' => ['nullable', 'integer', 'min:0', 'max:12'], 'chair_layout.bottom' => ['nullable', 'integer', 'min:0', 'max:12'], 'chair_layout.left' => ['nullable', 'integer', 'min:0', 'max:12'], 'chair_layout.right' => ['nullable', 'integer', 'min:0', 'max:12'], 'chair_layout.around' => ['nullable', 'integer', 'min:1', 'max:12'], 'position' => ['required', 'array'], 'position.x' => ['required', 'numeric', 'between:-100,100'], 'position.z' => ['required', 'numeric', 'between:-100,100']]);
        $table = DB::transaction(function () use ($floor, $data) {
            $lockedFloor = RestaurantFloor::whereKey($floor->id)->lockForUpdate()->firstOrFail();
            $tableNumber = $data['table_number'];
            if (RestaurantTable::where('table_number', $tableNumber)->exists()) {
                $nextNumber = 1;
                do {
                    $tableNumber = "Table {$nextNumber}";
                    $nextNumber++;
                } while (RestaurantTable::where('table_number', $tableNumber)->exists());
            }
            $table = RestaurantTable::create(['floor_id' => $lockedFloor->id, 'table_number' => $tableNumber, 'qr_code' => (string) Str::uuid(), 'capacity' => $data['capacity'], 'zone' => $data['zone'] ?? null, 'is_active' => true, 'operational_status' => 'available']);
            $shape = $data['shape'] ?? 'short';
            $floorObject = FloorPlanObject::create(['floor_id' => $lockedFloor->id, 'table_id' => $table->id, 'object_type' => 'table', 'label' => $table->table_number, 'position' => $data['position'], 'rotation' => ['y' => 0], 'dimensions' => array_merge($shape === 'long' ? ['width' => 2.4, 'depth' => 1.15, 'height' => 0.8] : ['width' => 1.45, 'depth' => 1.45, 'height' => 0.8], $data['dimensions'] ?? []), 'properties' => ['capacity' => $table->capacity, 'table_shape' => $shape, 'chair_layout' => $data['chair_layout'] ?? null]]);
            $lockedFloor->update(['is_published' => false]);

            return $table->setRelation('floorPlanObject', $floorObject);
        }, 3);
        $audit->record($request->user(), 'floor_plan.table_created', $table, ['floor_id' => $floor->id], $request);

        return response()->json(['data' => $table], 201);
    }

    public function updateFloorTable(Request $request, RestaurantTable $table, AuditLogService $audit): JsonResponse
    {
        abort_unless($request->user()->hasPermission('floorplan.manage'), 403);
        $data = $request->validate(['table_number' => ['required', 'string', 'max:32', Rule::unique('restaurant_tables', 'table_number')->ignore($table->id)], 'capacity' => ['required', 'integer', 'min:1', 'max:12'], 'zone' => ['nullable', 'string', 'max:60'], 'is_active' => ['required', 'boolean']]);
        $updated = DB::transaction(function () use ($table, $data) {
            $locked = RestaurantTable::whereKey($table->id)->lockForUpdate()->firstOrFail();
            $session = $locked->currentSession()->first();
            $activeReservations = $this->activeTableReservations($locked->id)->with(['tables:id,capacity', 'table:id,capacity'])->get();
            $hasReservations = $activeReservations->isNotEmpty();
            if (($session || $hasReservations) && (! $data['is_active'] || $data['table_number'] !== $locked->table_number)) {
                throw ValidationException::withMessages(['table' => 'A table with an active session or reservation cannot be deactivated or renumbered.']);
            }
            if ($session && $data['capacity'] < $session->guest_count) {
                throw ValidationException::withMessages(['capacity' => 'Capacity cannot be reduced below the active party size.']);
            }
            foreach ($activeReservations as $reservation) {
                $linkedTables = $reservation->tables->isNotEmpty() ? $reservation->tables : collect([$reservation->table])->filter();
                $otherCapacity = $linkedTables->where('id', '!=', $locked->id)->sum('capacity');
                if ($otherCapacity + (int) $data['capacity'] < $reservation->guest_count) {
                    throw ValidationException::withMessages(['capacity' => 'Capacity cannot be reduced below the combined party size for an active reservation.']);
                }
            }
            $locked->update($data);
            $floorObject = $locked->floorPlanObject;
            if ($floorObject) {
                $floorObject->update([
                    'label' => $locked->table_number,
                    'properties' => array_merge($floorObject->properties ?? [], ['capacity' => $locked->capacity]),
                ]);
            }

            return $locked->fresh();
        }, 3);
        $audit->record($request->user(), 'floor_plan.table_updated', $updated, $data, $request);

        return response()->json(['data' => $updated]);
    }

    private function activeTableReservations(int $tableId)
    {
        return Reservation::query()
            ->whereIn('status', ['pending', 'confirmed', 'checked_in', 'seated'])
            ->where(fn ($query) => $query->where('table_id', $tableId)->orWhereHas('tables', fn ($tables) => $tables->where('restaurant_tables.id', $tableId)));
    }

    public function saveLayout(Request $request, RestaurantFloor $floor, AuditLogService $audit): JsonResponse
    {
        abort_unless($request->user()->hasPermission('floorplan.manage'), 403);
        $data = $request->validate(['objects' => ['required', 'array', 'max:300'], 'objects.*.id' => ['nullable', 'integer'], 'objects.*.table_id' => ['nullable', 'integer', 'exists:restaurant_tables,id'], 'objects.*.object_type' => ['required', 'in:table,wall,door,counter,furniture,entrance,decoration,flooring'], 'objects.*.label' => ['nullable', 'string', 'max:100'], 'objects.*.position' => ['required', 'array'], 'objects.*.position.x' => ['required', 'numeric', 'between:-100,100'], 'objects.*.position.z' => ['required', 'numeric', 'between:-100,100'], 'objects.*.rotation' => ['nullable', 'array'], 'objects.*.rotation.y' => ['nullable', 'numeric', 'between:-6.283,6.283'], 'objects.*.dimensions' => ['nullable', 'array'], 'objects.*.dimensions.width' => ['nullable', 'numeric', 'between:0,30'], 'objects.*.dimensions.depth' => ['nullable', 'numeric', 'between:0,30'], 'objects.*.dimensions.height' => ['nullable', 'numeric', 'between:0,10'], 'objects.*.properties' => ['nullable', 'array'], 'objects.*.sort_order' => ['sometimes', 'integer', 'min:0']]);
        DB::transaction(function () use ($floor, $data) {
            $lockedFloor = RestaurantFloor::whereKey($floor->id)->lockForUpdate()->firstOrFail();
            $tableIds = collect($data['objects'])->pluck('table_id')->filter()->unique()->values();
            $tables = $tableIds->isEmpty()
                ? collect()
                : RestaurantTable::whereIn('id', $tableIds)->lockForUpdate()->get()->keyBy('id');
            $tablesToMove = [];
            foreach ($tables as $table) {
                if ((int) ($table->floor_id ?? 0) !== (int) $lockedFloor->id) {
                    if ($table->floor_id && ($table->currentSession()->exists() || $table->reservations()->whereIn('status', ['pending', 'confirmed', 'checked_in', 'seated'])->exists())) {
                        throw ValidationException::withMessages(['objects' => "Table {$table->table_number} cannot be moved while it has an active session or reservation."]);
                    }
                    $tablesToMove[] = $table->id;
                }
            }
            if ($tablesToMove) RestaurantTable::whereIn('id', $tablesToMove)->update(['floor_id' => $lockedFloor->id]);

            $submittedIds = collect($data['objects'])->pluck('id')->filter()->unique()->values();
            $existingIds = $submittedIds->isEmpty()
                ? collect()
                : FloorPlanObject::where('floor_id', $lockedFloor->id)->whereIn('id', $submittedIds)->pluck('id')->map(fn ($id) => (int) $id)->flip();
            $timestamp = now()->toDateTimeString();
            $updates = [];
            $inserts = [];
            foreach ($data['objects'] as $object) {
                $id = $object['id'] ?? null;
                unset($object['id']);
                if ($id && ! isset($existingIds[(int) $id])) continue;
                $row = [
                    'floor_id' => $lockedFloor->id,
                    'table_id' => $object['table_id'] ?? null,
                    'object_type' => $object['object_type'],
                    'label' => $object['label'] ?? null,
                    'position' => json_encode($object['position']),
                    'rotation' => json_encode($object['rotation'] ?? []),
                    'dimensions' => json_encode($object['dimensions'] ?? []),
                    'properties' => json_encode($object['properties'] ?? []),
                    'sort_order' => $object['sort_order'] ?? 0,
                    'updated_at' => $timestamp,
                ];
                if ($id) {
                    $updates[] = ['id' => (int) $id, ...$row];
                } else {
                    $inserts[] = ['created_at' => $timestamp, ...$row];
                }
            }
            if ($updates) DB::table('floor_plan_objects')->upsert($updates, ['id'], ['table_id', 'object_type', 'label', 'position', 'rotation', 'dimensions', 'properties', 'sort_order', 'updated_at']);
            if ($inserts) DB::table('floor_plan_objects')->insert($inserts);
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

    public function deleteLayoutObject(Request $request, \App\Models\FloorPlanObject $object, AuditLogService $audit): JsonResponse
    {
        abort_unless($request->user()->hasPermission('floorplan.manage'), 403);
        DB::transaction(function () use ($object): void {
            $locked = \App\Models\FloorPlanObject::whereKey($object->id)->lockForUpdate()->firstOrFail();
            if ($locked->table_id) {
                $table = RestaurantTable::whereKey($locked->table_id)->lockForUpdate()->firstOrFail();
                $hasActiveReservation = $table->reservations()->whereIn('status', ['pending', 'confirmed', 'checked_in', 'seated'])->exists();
                if ($table->currentSession()->exists() || $hasActiveReservation) {
                    throw ValidationException::withMessages(['object' => 'This table has an active dining session or reservation and cannot be removed.']);
                }
                $table->update(['is_active' => false, 'operational_status' => 'unavailable']);
            }
            $locked->floor()->update(['is_published' => false]);
            $locked->delete();
        }, 3);
        $audit->record($request->user(), 'floor_plan.object_removed', $object, [], $request);

        return response()->json([], 204);
    }
}
