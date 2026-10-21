<?php

namespace App\Console\Commands;

use App\Services\PaymentService;
use Illuminate\Console\Command;

class ExpirePendingPayments extends Command
{
    protected $signature = 'payments:expire-pending';
    protected $description = 'Expire timed-out PayMongo checkout sessions and release unpaid reservation deposits';

    public function handle(PaymentService $payments): int
    {
        $this->info('Cancelled '.$payments->expirePending().' expired pending payment(s).');
        return self::SUCCESS;
    }
}
