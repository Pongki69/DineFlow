<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RestaurantTable extends Model
{
    protected $fillable = ['floor_id', 'table_number', 'qr_code', 'capacity', 'zone', 'is_active', 'operational_status', 'expected_available_at'];

    protected function casts(): array
    {
        return ['capacity' => 'integer', 'is_active' => 'boolean', 'expected_available_at' => 'datetime'];
    }

    public function diningSessions()
    {
        return $this->hasMany(DiningSession::class, 'table_id');
    }

    public function currentSession()
    {
        return $this->hasOne(DiningSession::class, 'table_id')->where('status', 'open');
    }

    public function floor() { return $this->belongsTo(RestaurantFloor::class, 'floor_id'); }
    public function reservations() { return $this->hasMany(Reservation::class, 'table_id'); }
    public function floorPlanObject() { return $this->hasOne(FloorPlanObject::class, 'table_id'); }
}
