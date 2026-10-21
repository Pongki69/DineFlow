<?php

use App\Models\User;
use App\Services\ReservationService;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Validation\ValidationException;

require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
while (microtime(true) < (float) $argv[1]) {
    usleep(10000);
}
try {
    $customer = User::where('email', 'customer@example.test')->firstOrFail();
    app(ReservationService::class)->create($customer, [
        'guest_name' => 'Concurrency fixture', 'guest_count' => 2, 'table_id' => 1,
        'starts_at' => now()->addDays(2)->setTime(14, 0)->toIso8601String(),
    ]);
    echo 'accepted';
} catch (ValidationException) {
    echo 'conflict';
} catch (Throwable $exception) {
    fwrite(STDERR, get_class($exception).': '.$exception->getMessage());
    exit(1);
}
