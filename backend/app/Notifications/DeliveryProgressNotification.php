<?php

namespace App\Notifications;

use App\Models\Delivery;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class DeliveryProgressNotification extends Notification
{
    use Queueable;

    public function __construct(private Delivery $delivery) {}
    public function via(object $notifiable): array { return ['database']; }
    public function toArray(object $notifiable): array
    {
        return ['delivery_id'=>$this->delivery->id,'order_number'=>$this->delivery->order?->order_number,'status'=>$this->delivery->status,'message'=>$this->message()];
    }
    private function message(): string
    {
        return match ($this->delivery->status) {
            'accepted' => 'A rider accepted your delivery.',
            'picked_up' => 'Your order has been picked up.',
            'in_transit' => 'Your order is on the way.',
            'delivered' => 'Your order has been delivered.',
            'failed' => 'The delivery could not be completed. Please contact the restaurant.',
            default => 'Your delivery status was updated.',
        };
    }
}
