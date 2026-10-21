<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RiderProfile extends Model
{
    protected $fillable = ['user_id', 'phone', 'vehicle_type', 'vehicle_plate', 'is_available'];
    protected function casts(): array { return ['is_available' => 'boolean']; }
    public function user() { return $this->belongsTo(User::class); }
}
