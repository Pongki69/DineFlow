<?php

namespace App\Services;

use App\Models\RestaurantSetting;
use App\Models\User;
use App\Notifications\RestaurantUpdateNotification;
use Illuminate\Support\Facades\Notification;

class RestaurantNotificationService
{
    public function send(?User $user, string $event, string $title, string $message, array $context = []): bool
    {
        if (! $user || (RestaurantSetting::where('key', 'business_profile')->value('value')['notifications_enabled'] ?? true) === false) return false;

        try {
            Notification::send($user, new RestaurantUpdateNotification($event, $title, $message, $context));
            return true;
        } catch (\Throwable $exception) {
            report($exception);
            return false;
        }
    }
}
