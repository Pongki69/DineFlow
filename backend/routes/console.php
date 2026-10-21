<?php

use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Schedule::command('deliveries:purge-locations')->daily();
Schedule::command('payments:expire-pending')->everyFiveMinutes();
Schedule::command('reservations:send-reminders')->hourly();
Schedule::command('notifications:purge-read')->daily();

Artisan::command('about:security', function (): void {
    $this->info('DineFlow authentication uses Sanctum sessions; see docs/ARCHITECTURE.md before deployment.');
})->purpose('Display DineFlow security setup guidance');
