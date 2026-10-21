<?php

namespace App\Observers;

use App\Events\FloorAvailabilityChanged;
use App\Models\RestaurantFloor;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

class FloorAvailabilityObserver
{
    public function saved(Model $model): void
    {
        $floorId = $model instanceof RestaurantFloor ? $model->id : $model->floor_id;
        DB::afterCommit(function () use ($floorId): void {
            try {
                broadcast(new FloorAvailabilityChanged($floorId));
            } catch (\Throwable $exception) {
                report($exception);
            }
        });
    }

    public function deleted(Model $model): void
    {
        $this->saved($model);
    }
}
