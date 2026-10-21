<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DeliveryStatusHistory extends Model
{
    protected $fillable = ['delivery_id','actor_id','from_status','to_status','reason'];
}
