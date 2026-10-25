<?php

namespace App\Console\Commands;

use App\Jobs\RefreshDeliveryEta;
use App\Models\Delivery;
use App\Services\DeliveryService;
use Illuminate\Console\Command;

class RefreshDeliveryEtas extends Command
{
    protected $signature = 'deliveries:refresh-etas';

    protected $description = 'Refresh stale delivery ETAs outside GPS requests, including sync/demo installations';

    public function handle(DeliveryService $service): int
    {
        Delivery::whereIn('status', ['picked_up', 'in_transit'])
            ->where(fn ($q) => $q->whereNull('last_routed_at')->orWhere('last_routed_at', '<=', now()->subSeconds(30)))
            ->whereHas('locationUpdates', fn ($q) => $q->where('recorded_at', '>=', now()->subSeconds(90)))
            ->orderBy('id')->chunkById(50, function ($deliveries) use ($service) {
                foreach ($deliveries as $delivery) {
                    try {
                        if (config('queue.default') === 'sync') {
                            $service->refreshEta($delivery->id);
                        } else {
                            RefreshDeliveryEta::dispatch($delivery->id);
                        }
                    } catch (\Throwable $exception) {
                        report($exception);
                    }
                }
            });

        return self::SUCCESS;
    }
}
