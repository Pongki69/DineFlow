<?php

namespace App\Notifications;

use Illuminate\Notifications\Notification;

class RestaurantUpdateNotification extends Notification
{
    public function __construct(
        private readonly string $event,
        private readonly string $title,
        private readonly string $message,
        private readonly array $context = [],
    ) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toArray(object $notifiable): array
    {
        return [
            'event' => $this->event,
            'title' => $this->title,
            'message' => $this->message,
            'context' => $this->context,
        ];
    }
}
