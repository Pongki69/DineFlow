<?php

use App\Models\Delivery;
use App\Models\User;
use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('delivery.{delivery}', function (User $user, Delivery $delivery): bool {
    return $delivery->order()->where('customer_id', $user->id)->exists()
        || $delivery->rider_user_id === $user->id
        || $user->hasPermission('deliveries.manage');
});
