<?php

return [
    'timezone' => env('RESTAURANT_TIMEZONE', 'Asia/Manila'),
    'delivery_location_retention_days' => max(1, (int) env('DELIVERY_LOCATION_RETENTION_DAYS', 7)),
];
