<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DeliveryLocationUpdate extends Model
{
    protected $fillable = ['delivery_id','rider_user_id','latitude','longitude','accuracy_meters','speed_mps','recorded_at'];
    protected function casts(): array { return ['latitude'=>'decimal:7','longitude'=>'decimal:7','accuracy_meters'=>'decimal:2','speed_mps'=>'decimal:2','recorded_at'=>'datetime']; }
}
