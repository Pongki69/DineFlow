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
        foreach ([\App\Models\Order::class, \App\Models\OrderItem::class, \App\Models\OrderItemAddon::class,
            Delivery::class, RiderProfile::class, \App\Models\DeliveryLocationUpdate::class,
            \App\Models\DispatchOffer::class, \App\Models\DeliveryAssignment::class,
            \App\Models\Payment::class, \App\Models\PaymentAllocation::class, \App\Models\PaymentTransaction::class,
            Reservation::class, \App\Models\DiningSession::class, RestaurantTable::class, RestaurantFloor::class,
            \App\Models\FloorPlanObject::class, RestaurantSetting::class, User::class, \App\Models\Role::class,
            \App\Models\MenuCategory::class, \App\Models\MenuItem::class, \App\Models\MenuItemVariant::class,
            \App\Models\MenuItemAddon::class, \App\Models\DeliveryAddress::class, \Illuminate\Notifications\DatabaseNotification::class] as $model) {
            $model::observe(\App\Observers\WorkspaceObserver::class);
        }
        foreach ([Delivery::class, RiderProfile::class, RestaurantSetting::class, User::class] as $model) {
            $model::observe(OperationsObserver::class);
        }
        foreach ([Reservation::class, RestaurantTable::class, RestaurantFloor::class] as $model) {
            $model::observe(FloorAvailabilityObserver::class);
        }
    }
}
