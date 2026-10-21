<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Delivery extends Model
{
    public const TERMINAL = ['delivered', 'failed', 'cancelled'];
    protected $fillable = ['order_id','rider_user_id','status','failure_reason','assigned_at','accepted_at','picked_up_at','delivered_at','cancelled_at','estimated_arrival_at','last_routed_at','route_geometry'];
    protected function casts(): array { return ['assigned_at'=>'datetime','accepted_at'=>'datetime','picked_up_at'=>'datetime','delivered_at'=>'datetime','cancelled_at'=>'datetime','estimated_arrival_at'=>'datetime','last_routed_at'=>'datetime','route_geometry'=>'array']; }
    public function order() { return $this->belongsTo(Order::class); }
    public function rider() { return $this->belongsTo(User::class, 'rider_user_id'); }
    public function assignments() { return $this->hasMany(DeliveryAssignment::class); }
    public function statusHistory() { return $this->hasMany(DeliveryStatusHistory::class); }
    public function locationUpdates() { return $this->hasMany(DeliveryLocationUpdate::class); }
}
