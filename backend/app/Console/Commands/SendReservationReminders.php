<?php

namespace App\Console\Commands;

use App\Models\Reservation;
use App\Services\RestaurantNotificationService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class SendReservationReminders extends Command
{
    protected $signature = 'reservations:send-reminders';
    protected $description = 'Send in-app reminders for upcoming confirmed reservations';

    public function handle(RestaurantNotificationService $notifications): int
    {
        Reservation::where('status', 'confirmed')
            ->whereNull('reminder_sent_at')
            ->whereBetween('starts_at', [now(), now()->addHours(24)])
            ->orderBy('starts_at')
            ->chunkById(100, function ($reservations) use ($notifications): void {
                foreach ($reservations as $reservation) {
                    DB::transaction(function () use ($reservation, $notifications): void {
                        $locked = Reservation::whereKey($reservation->id)->lockForUpdate()->first();
                        if (! $locked || $locked->status !== 'confirmed' || $locked->reminder_sent_at || $locked->starts_at->lt(now()) || $locked->starts_at->gt(now()->addHours(24))) return;
                        $sent = $notifications->send($locked->customer, 'reservation.reminder', 'Reservation coming up', 'Your reservation is within the next 24 hours.', ['reservation_id' => $locked->id, 'reference' => $locked->reference, 'starts_at' => $locked->starts_at?->toIso8601String()]);
                        if ($sent) $locked->update(['reminder_sent_at' => now()]);
                    }, 3);
                }
            });

        return self::SUCCESS;
    }
}
