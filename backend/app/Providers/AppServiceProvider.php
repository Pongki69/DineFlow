<?php

namespace App\Providers;

use App\Models\Reservation;
use App\Models\RestaurantFloor;
use App\Models\RestaurantTable;
use App\Observers\FloorAvailabilityObserver;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void {}

    public function boot(): void
    {
        foreach ([Reservation::class, RestaurantTable::class, RestaurantFloor::class] as $model) {
            $model::observe(FloorAvailabilityObserver::class);
        }
    }
}
