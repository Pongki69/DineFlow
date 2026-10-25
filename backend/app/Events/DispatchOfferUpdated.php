<?php

namespace App\Events;

use App\Models\DispatchOffer;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

class DispatchOfferUpdated implements ShouldBroadcastNow
{
    public function __construct(public DispatchOffer $offer) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel('rider.'.$this->offer->rider_user_id)];
    }

    public function broadcastAs(): string
    {
        return 'dispatch.offer';
    }

    public function broadcastWith(): array
    {
        return ['offer_id' => $this->offer->id, 'status' => $this->offer->status, 'expires_at' => $this->offer->expires_at->toIso8601String()];
    }
}
