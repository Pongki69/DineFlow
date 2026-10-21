<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class PurgeReadNotifications extends Command
{
    protected $signature = 'notifications:purge-read';
    protected $description = 'Delete read in-app notifications past their configured retention period';

    public function handle(): int
    {
        $days = max(30, (int) config('services.notification_retention_days', 180));
        $deleted = DB::table('notifications')->whereNotNull('read_at')->where('read_at', '<', now()->subDays($days))->delete();
        $this->info("Deleted {$deleted} read notifications older than {$days} days.");

        return self::SUCCESS;
    }
}
