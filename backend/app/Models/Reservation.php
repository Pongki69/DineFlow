<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Reservation extends Model
{
    public const STATUSES = ['pending', 'confirmed', 'checked_in', 'seated', 'completed', 'cancelled', 'no_show'];

    protected $fillable = ['reference', 'customer_id', 'table_id', 'floor_id', 'guest_name', 'guest_email', 'guest_phone', 'guest_count', 'starts_at', 'ends_at', 'duration_minutes', 'buffer_minutes', 'status', 'notes', 'checked_in_at', 'seated_at', 'cancelled_at', 'reminder_sent_at'];

    protected function casts(): array
    {
        return ['guest_count' => 'integer', 'duration_minutes' => 'integer', 'buffer_minutes' => 'integer', 'starts_at' => 'datetime', 'ends_at' => 'datetime', 'checked_in_at' => 'datetime', 'seated_at' => 'datetime', 'cancelled_at' => 'datetime'];
    }

    public function table()
    {
        return $this->belongsTo(RestaurantTable::class);
    }

    public function floor()
    {
        return $this->belongsTo(RestaurantFloor::class);
    }

    public function customer()
    {
        return $this->belongsTo(User::class, 'customer_id');
    }

    public function history()
    {
        return $this->hasMany(ReservationStatusHistory::class)->orderBy('created_at');
    }

    public function payments()
    {
        return $this->hasMany(Payment::class);
    }
}
