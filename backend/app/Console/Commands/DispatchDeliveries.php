<?php

namespace App\Console\Commands;

use App\Services\DispatchService;
use Illuminate\Console\Command;

class DispatchDeliveries extends Command
{
    protected $signature = 'deliveries:dispatch';

    protected $description = 'Expire delivery offers and dispatch eligible paid orders';

    public function handle(DispatchService $dispatch): int
    {
        $dispatch->tick();

        return self::SUCCESS;
    }
}
