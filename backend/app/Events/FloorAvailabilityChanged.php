<?php

namespace App\Events;

use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

class FloorAvailabilityChanged implements ShouldBroadcastNow
{
    public function __construct(public ?int $floorId) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel('floor-plan')];
    }

    public function broadcastAs(): string
    {
        return 'floor.updated';
    }

    public function broadcastWith(): array
    {
        return ['floor_id' => $this->floorId];
    }
}
