<?php

namespace App\Console\Commands;

use App\Models\DeliveryLocationUpdate;
use Illuminate\Console\Command;

class PurgeDeliveryLocations extends Command
{
    protected $signature = 'deliveries:purge-locations';
    protected $description = 'Delete rider GPS points older than the configured delivery retention window';

    public function handle(): int
    {
        $cutoff=now()->subDays(config('restaurant.delivery_location_retention_days',7));
        $deleted=DeliveryLocationUpdate::where('recorded_at','<',$cutoff)->delete();
        $this->info("Deleted {$deleted} expired delivery location updates.");
        return self::SUCCESS;
    }
}
