<?php

use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schedule;

Schedule::command('deliveries:refresh-etas')->everyMinute()->withoutOverlapping()->runInBackground();

Schedule::command('deliveries:purge-locations')->daily();
Schedule::command('deliveries:dispatch')->everyFiveSeconds()->withoutOverlapping(2)->runInBackground();
Schedule::command('payments:expire-pending')->everyFiveMinutes();
Schedule::command('reservations:send-reminders')->hourly();
Schedule::command('notifications:purge-read')->daily();
Schedule::call(fn () => DB::table('idempotency_requests')->where('expires_at', '<', now())->delete())->daily()->name('idempotency:purge');

Artisan::command('about:security', function (): void {
    $this->info('DineFlow authentication uses Sanctum sessions; see docs/ARCHITECTURE.md before deployment.');
})->purpose('Display DineFlow security setup guidance');
