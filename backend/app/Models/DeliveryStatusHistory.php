<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DeliveryStatusHistory extends Model
{
    protected $table = 'delivery_status_history';

    protected $fillable = ['delivery_id', 'actor_id', 'from_status', 'to_status', 'reason'];
}
