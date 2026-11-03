<?php

namespace App\Events;

use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

class WorkspaceUpdated implements ShouldBroadcastNow
{
    use Dispatchable;

    public function __construct(public readonly array $topics) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel('workspace')];
    }

    public function broadcastAs(): string { return 'workspace.updated'; }

    public function broadcastWith(): array
    {
        // Invalidation only. Records are fetched through each user's authorized API.
        return ['topics' => $this->topics];
    }
}
