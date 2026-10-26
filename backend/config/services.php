<?php

return [
    'mailgun' => ['domain' => env('MAILGUN_DOMAIN'), 'secret' => env('MAILGUN_SECRET'), 'endpoint' => env('MAILGUN_ENDPOINT', 'api.mailgun.net'), 'scheme' => 'https'],
    'ses' => ['key' => env('AWS_ACCESS_KEY_ID'), 'secret' => env('AWS_SECRET_ACCESS_KEY'), 'region' => env('AWS_DEFAULT_REGION', 'us-east-1')],
    'postmark' => ['token' => env('POSTMARK_TOKEN')],
    'paymongo' => ['secret' => env('PAYMONGO_SECRET_KEY'), 'webhook_secret' => env('PAYMONGO_WEBHOOK_SECRET')],
    'xendit' => ['secret' => env('XENDIT_SECRET_KEY'), 'webhook_token' => env('XENDIT_WEBHOOK_TOKEN')],
    'maps' => [
        'provider' => env('MAP_PROVIDER', 'geoapify') ?: 'geoapify',
        'geoapify_key' => env('GEOAPIFY_API_KEY'),
        'local_osrm_fallback' => env('MAPS_LOCAL_OSRM_FALLBACK', true),
        'local_osrm_url' => env('MAPS_LOCAL_OSRM_URL', 'https://router.project-osrm.org/route/v1/driving'),
        'token' => env('MAPBOX_SERVER_TOKEN'),
        'country' => env('MAPS_COUNTRY', 'ph'),
        'routing_url' => env('MAPS_ROUTING_URL', 'https://api.mapbox.com/directions/v5/mapbox/driving'),
        'traffic_enabled' => env('MAPS_TRAFFIC_ENABLED', false),
    ],
    'notification_retention_days' => env('NOTIFICATION_RETENTION_DAYS', 180),
];
