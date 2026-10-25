<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DispatchOffer extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['expires_at' => 'datetime', 'responded_at' => 'datetime', 'ranking' => 'array'];
    }

    public function delivery()
    {
        return $this->belongsTo(Delivery::class);
    }

    public function rider()
    {
        return $this->belongsTo(User::class, 'rider_user_id');
    }
}
