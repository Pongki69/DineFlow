<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DiningSession extends Model
{
    protected $fillable = ['table_id', 'opened_by', 'closed_by', 'guest_count', 'status', 'opened_at', 'closed_at'];

    protected function casts(): array
    {
        return ['guest_count' => 'integer', 'opened_at' => 'datetime', 'closed_at' => 'datetime'];
    }

    public function table()
    {
        return $this->belongsTo(RestaurantTable::class, 'table_id');
    }

    public function orders()
    {
        return $this->hasMany(Order::class);
    }

    public function payments()
    {
        return $this->hasMany(Payment::class);
    }

    public function openedBy()
    {
        return $this->belongsTo(User::class, 'opened_by');
    }
}
