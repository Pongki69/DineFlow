<?php

namespace App\Services;

use App\Models\RestaurantSetting;
use App\Models\RestaurantTable;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ReservationService
{
    public function timezone(): string
    {
        $profile = RestaurantSetting::where('key', 'business_profile')->value('value') ?? [];
        return $profile['timezone'] ?? config('app.timezone', 'Asia/Manila');
    }

    public function policy(): array
    {
        $saved = RestaurantSetting::where('key', 'reservation_policy')->value('value') ?? [];
        return array_replace([
            'open_time' => '10:00', 'close_time' => '22:00', 'duration_minutes' => 90,
            'buffer_minutes' => 30, 'booking_window_days' => 60, 'grace_minutes' => 15,
            'cancellation_cutoff_hours' => 4,
            'automatic_confirmation' => true, 'automatic_table_assignment' => true,
            'deposit_required' => false, 'deposit_amount' => 0,
        ], $saved);
    }

    public function availability(CarbonImmutable $startsAt, int $guestCount, ?int $floorId = null): array
    {
        $policy = $this->policy();
        $endsAt = $startsAt->addMinutes((int) $policy['duration_minutes']);
        $tables = RestaurantTable::query()->with(['floor:id,name', 'currentSession:id,table_id,guest_count,opened_at'])
            ->where('is_active', true)->where('capacity', '>=', $guestCount)
            ->when($floorId, fn ($query) => $query->where('floor_id', $floorId))
            ->whereHas('floor', fn ($query) => $query->where('is_active', true)->where('is_published', true))
            ->orderBy('capacity')->orderBy('table_number')->get();

        return $tables->map(function (RestaurantTable $table) use ($startsAt, $endsAt, $policy): array {
            $buffer = (int) $policy['buffer_minutes'];
            $occupied = in_array($table->operational_status, ['occupied', 'cleaning'], true) || $table->currentSession !== null;
            $operationallyFree = in_array($table->operational_status, ['available'], true)
                || ($occupied && $table->expected_available_at && $table->expected_available_at->lte($startsAt->subMinutes($buffer)));
            $conflict = $this->hasReservationConflict($table->id, $startsAt, $endsAt, $buffer);
            return [
                'id' => $table->id, 'table_number' => $table->table_number, 'capacity' => $table->capacity,
                'zone' => $table->zone, 'floor_id' => $table->floor_id, 'floor_name' => $table->floor?->name,
                'operational_status' => $table->operational_status, 'expected_available_at' => $table->expected_available_at,
                'availability_estimate_confirmed' => false,
                'estimated_remaining_minutes' => $table->expected_available_at ? max(0, now()->diffInMinutes($table->expected_available_at, false)) : null,
                'next_schedulable_slot' => (! $operationallyFree || $conflict) ? $this->nextSchedulableSlot($table, $startsAt, $policy) : null,
                'available' => $operationallyFree && ! $conflict,
                'status' => $conflict ? 'reserved' : ($operationallyFree ? 'available' : $table->operational_status),
            ];
        })->values()->all();
    }

    public function create($actor, array $data): array
    {
        $startsAt = CarbonImmutable::parse($data['starts_at'])->setTimezone($this->timezone());
        $policy = $this->policy();
        $this->validateSlot($startsAt, $policy);
        $endsAt = $startsAt->addMinutes((int) $policy['duration_minutes']);
        $floorId = isset($data['floor_id']) ? (int) $data['floor_id'] : null;
        $requestedId = isset($data['table_id']) ? (int) $data['table_id'] : null;

        $result = DB::transaction(function () use ($actor, $data, $startsAt, $endsAt, $policy, $floorId, $requestedId): array {
            $candidateIds = $requestedId ? [$requestedId] : collect($this->availability($startsAt, (int) $data['guest_count'], $floorId))->where('available', true)->pluck('id')->all();
            sort($candidateIds);
            foreach ($candidateIds as $id) {
                $table = RestaurantTable::query()->whereKey($id)->lockForUpdate()->first();
                if (! $table || ($floorId && $table->floor_id !== $floorId)) continue;
                $isAvailable = collect($this->availability($startsAt, (int) $data['guest_count'], $table->floor_id))->firstWhere('id', $table->id)['available'] ?? false;
                if (! $isAvailable) continue;
                $reservation = \App\Models\Reservation::create([
                    'reference' => $this->reference(), 'customer_id' => $actor->id, 'table_id' => $table->id,
                    'floor_id' => $table->floor_id, 'guest_name' => $data['guest_name'], 'guest_email' => $data['guest_email'] ?? null,
                    'guest_phone' => $data['guest_phone'] ?? null, 'guest_count' => $data['guest_count'],
                    'starts_at' => $startsAt, 'ends_at' => $endsAt, 'duration_minutes' => (int) $policy['duration_minutes'],
                    'status' => ($policy['deposit_required'] ?? false) ? 'pending' : ($policy['automatic_confirmation'] ? 'confirmed' : 'pending'), 'notes' => $data['notes'] ?? null,
                ]);
                $reservation->history()->create(['actor_id' => $actor->id, 'from_status' => null, 'to_status' => $reservation->status]);
                app(AuditLogService::class)->record($actor, 'reservation.created', $reservation, ['table_id' => $table->id], request());
                return ['reservation' => $reservation->load(['table:id,table_number,capacity', 'floor:id,name']), 'assigned_automatically' => ! $requestedId];
            }
            throw ValidationException::withMessages(['table_id' => 'That table or time is no longer available. Choose another table or time.']);
        }, 3);

        $reservation = $result['reservation'];
        app(RestaurantNotificationService::class)->send($reservation->customer, 'reservation.created', 'Reservation received', 'Reservation '.$reservation->reference.' is '.$reservation->status.'.', ['reservation_id' => $reservation->id, 'reference' => $reservation->reference, 'starts_at' => $reservation->starts_at?->toIso8601String()]);
        return $result;
    }

    public function transition($reservation, $actor, string $to, ?string $note = null)
    {
        $updated = DB::transaction(function () use ($reservation, $actor, $to, $note) {
            $locked = \App\Models\Reservation::whereKey($reservation->id)->lockForUpdate()->firstOrFail();
            if ($to === 'cancelled' && $locked->payments()->where('status', 'paid')->exists()) {
                throw ValidationException::withMessages(['status' => 'A reservation with a paid deposit must be refunded before it can be cancelled.']);
            }
            if ($to === 'cancelled' && $locked->payments()->where('status', 'pending')->exists()) {
                throw ValidationException::withMessages(['status' => 'Cancel the active deposit checkout before cancelling this reservation.']);
            }
            $isOwnerCancel = $to === 'cancelled' && $locked->customer_id === $actor->id && in_array($locked->status, ['pending', 'confirmed'], true);
            if (! $actor->hasPermission('reservations.manage') && ! $isOwnerCancel) abort(403);
            if ($isOwnerCancel && $locked->starts_at->lte(now()->addHours((int) $this->policy()['cancellation_cutoff_hours']))) {
                throw ValidationException::withMessages(['status' => 'This reservation is inside the cancellation cutoff. Please contact the restaurant.']);
            }
            if ($to === 'no_show' && now()->lt($locked->starts_at->addMinutes((int) $this->policy()['grace_minutes']))) {
                throw ValidationException::withMessages(['status' => 'The arrival grace period has not elapsed yet.']);
            }
            $allowed = [
                'pending' => ['confirmed', 'cancelled'], 'confirmed' => ['checked_in', 'cancelled', 'no_show'],
                'checked_in' => ['seated', 'cancelled'], 'seated' => ['completed'],
                'completed' => [], 'cancelled' => [], 'no_show' => [],
            ];
            if (! in_array($to, $allowed[$locked->status] ?? [], true)) {
                throw ValidationException::withMessages(['status' => "Reservation cannot move from {$locked->status} to {$to}."]);
            }
            $from = $locked->status;
            $locked->status = $to;
            if ($to === 'checked_in') $locked->checked_in_at = now();
            if ($to === 'seated') $locked->seated_at = now();
            if ($to === 'cancelled') $locked->cancelled_at = now();
            $locked->save();
            $locked->history()->create(['actor_id' => $actor->id, 'from_status' => $from, 'to_status' => $to, 'note' => $note]);
            app(AuditLogService::class)->record($actor, 'reservation.status_changed', $locked, ['from' => $from, 'to' => $to], request());
            return $locked->load(['table:id,table_number,capacity', 'floor:id,name']);
        }, 3);

        app(RestaurantNotificationService::class)->send($updated->customer, 'reservation.status_changed', 'Reservation update', 'Reservation '.$updated->reference.' is now '.str_replace('_', ' ', $updated->status).'.', ['reservation_id' => $updated->id, 'reference' => $updated->reference, 'status' => $updated->status]);
        return $updated;
    }

    public function reschedule($reservation, $actor, array $data): array
    {
        return DB::transaction(function () use ($reservation, $actor, $data): array {
            $locked = \App\Models\Reservation::whereKey($reservation->id)->lockForUpdate()->firstOrFail();
            if ($locked->payments()->whereIn('status', ['pending', 'paid'])->exists()) {
                throw ValidationException::withMessages(['reservation' => 'Cancel or refund the active reservation deposit before rescheduling.']);
            }
            $isOwner = $locked->customer_id === $actor->id;
            if (! $actor->hasPermission('reservations.manage') && ! $isOwner) abort(404);
            if (! in_array($locked->status, ['pending', 'confirmed'], true)) {
                throw ValidationException::withMessages(['reservation' => 'Only pending or confirmed bookings can be rescheduled.']);
            }
            if ($isOwner && $locked->starts_at->lte(now()->addHours((int) $this->policy()['cancellation_cutoff_hours']))) {
                throw ValidationException::withMessages(['reservation' => 'This reservation is inside the rescheduling cutoff. Please contact the restaurant.']);
            }
            $from = $locked->status;
            $locked->update(['status' => 'cancelled', 'cancelled_at' => now()]);
            $locked->history()->create(['actor_id' => $actor->id, 'from_status' => $from, 'to_status' => 'cancelled', 'note' => 'Rescheduled']);
            $result = $this->create($actor, array_replace($data, [
                'guest_name' => $data['guest_name'] ?? $locked->guest_name, 'guest_email' => $data['guest_email'] ?? $locked->guest_email,
                'guest_phone' => $data['guest_phone'] ?? $locked->guest_phone, 'guest_count' => $data['guest_count'] ?? $locked->guest_count,
                'floor_id' => $data['floor_id'] ?? $locked->floor_id,
            ]));
            return $result;
        }, 3);
    }

    private function validateSlot(CarbonImmutable $startsAt, array $policy): void
    {
        $now = CarbonImmutable::now($startsAt->getTimezone());
        if ($startsAt->lessThan($now->addMinutes(30))) throw ValidationException::withMessages(['starts_at' => 'Reservations must be made at least 30 minutes ahead.']);
        if ($startsAt->greaterThan($now->addDays((int) $policy['booking_window_days']))) throw ValidationException::withMessages(['starts_at' => 'That date is outside the booking window.']);
        $open = CarbonImmutable::parse($startsAt->toDateString().' '.$policy['open_time'], $startsAt->getTimezone());
        $close = CarbonImmutable::parse($startsAt->toDateString().' '.$policy['close_time'], $startsAt->getTimezone());
        $end = $startsAt->addMinutes((int) $policy['duration_minutes']);
        if ($startsAt->lessThan($open) || $end->greaterThan($close)) throw ValidationException::withMessages(['starts_at' => 'That time is outside reservation hours.']);
    }

    private function hasReservationConflict(int $tableId, CarbonImmutable $startsAt, CarbonImmutable $endsAt, int $buffer): bool
    {
        return \App\Models\Reservation::query()->where('table_id', $tableId)->whereIn('status', ['pending', 'confirmed', 'checked_in', 'seated'])
            ->where('starts_at', '<', $endsAt->addMinutes($buffer))
            ->where('ends_at', '>', $startsAt->subMinutes($buffer))->exists();
    }

    private function nextSchedulableSlot(RestaurantTable $table, CarbonImmutable $requested, array $policy): ?CarbonImmutable
    {
        $occupied = in_array($table->operational_status, ['occupied', 'cleaning'], true) || $table->currentSession !== null;
        if ($occupied && ! $table->expected_available_at) return null;
        $buffer = (int) $policy['buffer_minutes'];
        $candidate = $occupied ? $requested->max(CarbonImmutable::instance($table->expected_available_at)->addMinutes($buffer)) : $requested;

        for ($attempt = 0; $attempt < 30; $attempt++) {
            $open = CarbonImmutable::parse($candidate->toDateString().' '.$policy['open_time'], $candidate->getTimezone());
            $close = CarbonImmutable::parse($candidate->toDateString().' '.$policy['close_time'], $candidate->getTimezone());
            if ($candidate->lessThan($open)) $candidate = $open;
            if ($candidate->addMinutes((int) $policy['duration_minutes'])->greaterThan($close)) {
                $candidate = $candidate->addDay()->startOfDay()->setTimeFromTimeString($policy['open_time']);
                continue;
            }
            $blockerEnd = \App\Models\Reservation::query()->where('table_id', $table->id)
                ->whereIn('status', ['pending', 'confirmed', 'checked_in', 'seated'])
                ->where('starts_at', '<', $candidate->addMinutes((int) $policy['duration_minutes'] + $buffer))
                ->where('ends_at', '>', $candidate->subMinutes($buffer))->max('ends_at');
            if (! $blockerEnd) return $candidate;
            $candidate = CarbonImmutable::parse($blockerEnd, $candidate->getTimezone())->addMinutes($buffer);
        }
        return null;
    }

    private function reference(): string
    {
        do { $reference = 'RSV'.now()->format('ymd').strtoupper(Str::random(6)); }
        while (\App\Models\Reservation::where('reference', $reference)->exists());
        return $reference;
    }
}
