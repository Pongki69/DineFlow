<?php

use Illuminate\Support\Facades\Route;

Route::get('/{path?}', function () {
    $index = config('hosting.spa_index');
    abort_unless(is_file($index), 503, 'Frontend build is unavailable. Use the Vite development server locally.');
    return response()->file($index, ['Content-Type' => 'text/html; charset=UTF-8', 'Cache-Control' => 'no-cache']);
})->where('path', '(?!(?:api|sanctum|up|storage|assets)(?:/|$)).*');
