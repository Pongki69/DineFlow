<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;

class RiderProfile extends Model
{
    public static function normalizeVehicle(?string $vehicle): ?string
    {
        $vehicle = strtolower(trim($vehicle ?? ''));

        return match ($vehicle) {
            '' => null,
            'motorcyle', 'motor cycle', 'motorbike' => 'motorcycle',
            default => $vehicle,
        };
    }

    protected function vehicleType(): Attribute
    {
        return Attribute::make(
            get: fn ($value) => self::normalizeVehicle($value),
            set: fn ($value) => self::normalizeVehicle($value),
        );
    }

    protected $guarded = ['id'];

    protected $hidden = ['presence_token'];

    protected function casts(): array
    {
        return ['is_available' => 'boolean', 'is_online' => 'boolean', 'located_at' => 'datetime', 'planned_delivery_ids' => 'array'];
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
