<?php

namespace App\Jobs;

use App\Services\DeliveryService;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class RefreshDeliveryEta implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    public int $uniqueFor = 45;

    public int $tries = 2;

    public int $timeout = 40;

    public function __construct(public int $deliveryId) {}

    public function uniqueId(): string
    {
        return (string) $this->deliveryId;
    }

    public function handle(DeliveryService $service): void
    {
        $service->refreshEta($this->deliveryId);
    }
}
