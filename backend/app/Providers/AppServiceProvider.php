<?php

namespace App\Providers;

use App\Models\Delivery;
use App\Models\Reservation;
use App\Models\RestaurantFloor;
use App\Models\RestaurantSetting;
use App\Models\RestaurantTable;
use App\Models\RiderProfile;
use App\Models\User;
use App\Observers\FloorAvailabilityObserver;
use App\Observers\OperationsObserver;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void {}

    public function boot(): void
    {
        foreach ([Delivery::class, RiderProfile::class, RestaurantSetting::class, User::class] as $model) {
            $model::observe(OperationsObserver::class);
        }
        foreach ([Reservation::class, RestaurantTable::class, RestaurantFloor::class] as $model) {
            $model::observe(FloorAvailabilityObserver::class);
        }
    }
}
