<?php

return [
    'enabled' => env('DISPATCH_ENABLED', true),
    'offer_seconds' => 25,
    'gps_fresh_seconds' => 90,
    'radii_km' => [3, 5, 8],
    'attempts_per_radius' => 3,
    'seconds_per_radius' => 60,
    'pickup_buffer_minutes' => 1,
    'shortlist' => 5,
    'weights' => ['eta' => 0.6, 'rating' => 0.2, 'acceptance' => 0.2, 'batch' => 0.3],
    'batch' => ['enabled' => true, 'max_pickup_km' => 1, 'max_heading_degrees' => 30, 'max_detour_minutes' => 5, 'max_ready_gap_minutes' => 5],
    'vehicle_capacity' => ['bicycle' => 2, 'motorcycle' => 4, 'car' => 8],
    'order_load' => ['bicycle' => 1, 'motorcycle' => 2, 'car' => 4],
];
