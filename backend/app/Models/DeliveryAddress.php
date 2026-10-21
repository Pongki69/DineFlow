<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DeliveryAddress extends Model
{
    protected $fillable = ['user_id', 'label', 'recipient_name', 'phone', 'formatted_address', 'latitude', 'longitude', 'delivery_instructions', 'is_default'];

    protected function casts(): array
    {
        return ['latitude' => 'decimal:7', 'longitude' => 'decimal:7', 'is_default' => 'boolean'];
    }
}
