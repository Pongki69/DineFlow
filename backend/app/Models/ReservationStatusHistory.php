<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ReservationStatusHistory extends Model
{
    protected $table = 'reservation_status_history';
    protected $fillable = ['reservation_id', 'actor_id', 'from_status', 'to_status', 'note'];
    public function reservation() { return $this->belongsTo(Reservation::class); }
}
