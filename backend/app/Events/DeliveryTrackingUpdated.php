<?php

namespace App\Events;

use App\Models\Delivery;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class DeliveryTrackingUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public Delivery $delivery, public array $tracking = []) {}
    public function broadcastOn(): array { return [new PrivateChannel('delivery.'.$this->delivery->id)]; }
    public function broadcastAs(): string { return 'delivery.updated'; }
    public function broadcastWith(): array
    {
        return ['delivery_id'=>$this->delivery->id,'status'=>$this->delivery->status,'order_status'=>$this->delivery->order?->status,'updated_at'=>$this->delivery->updated_at?->toIso8601String()] + $this->tracking;
    }
}
