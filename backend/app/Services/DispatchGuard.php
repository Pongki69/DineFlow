<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use LogicException;

final class DispatchGuard
{
    // A SQL row, not a process-local/cache lock: shared by all web and scheduler replicas.
    // Always acquired before delivery/rider/order rows by dispatch mutation paths.
    public static function lock(): void
    {
        if (DB::transactionLevel() < 1 || ! DB::table('dispatch_mutexes')->where('id', 1)->lockForUpdate()->first()) {
            throw new LogicException('Dispatch mutations require a migrated database and a transaction.');
        }
    }
}
