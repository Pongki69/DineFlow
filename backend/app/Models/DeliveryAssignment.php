<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DeliveryAssignment extends Model
{
    protected $fillable = ['delivery_id','rider_user_id','assigned_by','status','reason','accepted_at','rejected_at','ended_at'];
    protected function casts(): array { return ['accepted_at'=>'datetime','rejected_at'=>'datetime','ended_at'=>'datetime']; }
    public function delivery() { return $this->belongsTo(Delivery::class); }
    public function rider() { return $this->belongsTo(User::class, 'rider_user_id'); }
}
