<?php

namespace App\Observers;

use App\Events\OperationsUpdated;
use App\Events\RestaurantLocationUpdated;
use App\Models\RestaurantSetting;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class OperationsObserver
{
    public function saved(Model $model): void
    {
        if ($model instanceof RestaurantSetting && ! in_array($model->key, ['restaurant_location', 'delivery_policy'], true)) {
            return;
        }
        if ($model instanceof User && (! $model->wasChanged('is_active') || ! $model->hasRole('rider'))) {
            return;
        }
        $outletChanged = $model instanceof RestaurantSetting;
        DB::afterCommit(function () use ($outletChanged): void {
            try {
                if ($outletChanged) {
                    broadcast(new RestaurantLocationUpdated);
                }
                if (Cache::add('admin.operations.changed', true, now()->addSecond())) {
                    broadcast(new OperationsUpdated);
                }
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
