<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Delivery extends Model
{
    public const TERMINAL = ['delivered', 'failed', 'cancelled'];

    protected $guarded = ['id'];

    protected $attributes = ['dispatch_status' => 'waiting_merchant', 'dispatch_stage' => 0, 'dispatch_round' => 1, 'dispatch_attempts' => 0];

    protected function casts(): array
    {
        return ['assigned_at' => 'datetime', 'accepted_at' => 'datetime', 'picked_up_at' => 'datetime', 'delivered_at' => 'datetime', 'cancelled_at' => 'datetime', 'estimated_arrival_at' => 'datetime', 'last_routed_at' => 'datetime', 'route_geometry' => 'array', 'next_dispatch_at' => 'datetime', 'search_stage_started_at' => 'datetime', 'dispatch_stage' => 'integer', 'dispatch_round' => 'integer'];
    }

    public function offers()
    {
        return $this->hasMany(DispatchOffer::class);
    }

    public function order()
    {
        return $this->belongsTo(Order::class);
    }

    public function rider()
    {
        return $this->belongsTo(User::class, 'rider_user_id');
    }

    public function assignments()
    {
        return $this->hasMany(DeliveryAssignment::class);
    }

    public function statusHistory()
    {
        return $this->hasMany(DeliveryStatusHistory::class);
    }

    public function locationUpdates()
    {
        return $this->hasMany(DeliveryLocationUpdate::class);
    }
}
