<?php

namespace App\Services;

use App\Models\Delivery;

final readonly class DeliveryPoint
{
    public function __construct(public float $lat, public float $lng, public float $dropLat, public float $dropLng) {}

    public static function from(Delivery $delivery): self
    {
        return new self((float) $delivery->pickup_latitude, (float) $delivery->pickup_longitude, (float) $delivery->order->delivery_latitude, (float) $delivery->order->delivery_longitude);
    }
}
