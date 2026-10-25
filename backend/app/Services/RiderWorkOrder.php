<?php

namespace App\Services;

use App\Models\Delivery;
use App\Models\RiderProfile;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class RiderWorkOrder
{
    public function ids(User $rider): array
    {
        return RiderProfile::where('user_id', $rider->id)->first()?->planned_delivery_ids ?? [];
    }

    public function ordered(User $rider)
    {
        $ids = $this->ids($rider);
        $items = Delivery::with(['order.items.addons', 'statusHistory'])->where('rider_user_id', $rider->id)->whereNotIn('status', Delivery::TERMINAL)->orderBy('assigned_at')->orderBy('id')->get();
        $items = $items->sortBy(fn ($d) => array_search($d->id, $ids, true) !== false ? array_search($d->id, $ids, true) : count($ids) + $items->search(fn ($v) => $v->id === $d->id))->values();
        // Repair stale preferences without ever reversing a paired delivery's required sequence.
        foreach ($items->filter(fn ($d) => $d->batch_key)->groupBy('batch_key') as $batch) {
            $positions = $items->keys()->filter(fn ($i) => $items[$i]->batch_key === $batch->first()->batch_key)->values();
            foreach ($batch->sortBy('batch_sequence')->values() as $index => $delivery) {
                $items[$positions[$index]] = $delivery;
            }
        }

        return $items;
    }

    public function next(User $rider): ?Delivery
    {
        $items = $this->ordered($rider);

        return $items->first(fn ($d) => ! in_array($d->status, ['picked_up', 'in_transit'], true)) ?? $items->first();
    }

    public function save(User $rider, array $ids): array
    {
        $ids = array_map('intval', $ids);

        return DB::transaction(function () use ($rider, $ids) {
            DispatchGuard::lock();
            $items = Delivery::where('rider_user_id', $rider->id)->whereNotIn('status', Delivery::TERMINAL)->whereIn('id', $ids)->lockForUpdate()->get()->keyBy('id');
            abort_unless($items->count() === count($ids), 404);
            foreach (collect($ids)->map(fn ($id) => $items[$id])->filter(fn ($d) => $d->batch_key)->groupBy('batch_key') as $batch) {
                $sequence = $batch->pluck('batch_sequence')->all();
                $sorted = $sequence;
                sort($sorted);
                if ($sequence !== $sorted) {
                    throw ValidationException::withMessages(['delivery_ids' => 'Keep paired deliveries in their assigned sequence.']);
                }
            }
            $profile = RiderProfile::firstOrCreate(['user_id' => $rider->id]);
            $profile->update(['planned_delivery_ids' => $ids]);

            return $ids;
        });
    }
}
