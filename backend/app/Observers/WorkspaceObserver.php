<?php

namespace App\Observers;

use App\Events\WorkspaceUpdated;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

class WorkspaceObserver
{
    public function saved(Model $model): void { $this->changed($model); }
    public function deleted(Model $model): void { $this->changed($model); }
    public function restored(Model $model): void { $this->changed($model); }

    private function changed(Model $model): void
    {
        $topic = match (class_basename($model)) {
            'Order', 'OrderItem', 'OrderItemAddon' => 'orders',
            'Delivery', 'DispatchOffer', 'DeliveryAssignment' => 'deliveries',
            'RiderProfile', 'DeliveryLocationUpdate' => 'locations',
            'Payment', 'PaymentAllocation', 'PaymentTransaction' => 'payments',
            'Reservation', 'DiningSession' => 'reservations',
            'RestaurantTable', 'RestaurantFloor', 'FloorPlanObject' => 'floor',
            'RestaurantSetting' => 'settings',
            'User', 'Role' => 'accounts',
            'DatabaseNotification' => 'notifications',
            'DeliveryAddress' => 'addresses',
            default => 'menu',
        };
        $topics = [$topic];
        if ($model instanceof \App\Models\RiderProfile && $model->wasChanged(['vehicle_type', 'vehicle_plate', 'phone'])) $topics[] = 'accounts';
        DB::afterCommit(function () use ($topics): void {
            try { broadcast(new WorkspaceUpdated($topics)); }
            catch (\Throwable $exception) { report($exception); }
        });
    }
}
