<?php

use App\Models\Reservation;
use App\Models\User;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;

// This harness creates and removes only a randomly named local test database.
require __DIR__.'/../../vendor/autoload.php';
foreach (['APP_ENV' => 'testing', 'BROADCAST_CONNECTION' => 'log', 'MAIL_MAILER' => 'array', 'QUEUE_CONNECTION' => 'sync'] as $key => $value) {
    $_ENV[$key] = $_SERVER[$key] = $value;
    putenv($key.'='.$value);
}
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
set_exception_handler(function (Throwable $exception): void {
    fwrite(STDERR, get_class($exception).': '.$exception->getMessage().PHP_EOL);
    exit(1);
});
$connection = config('database.connections.pgsql');
$url = $connection['url'] ? parse_url($connection['url']) : [];
$host = $url['host'] ?? $connection['host'];
if (! in_array($host, ['localhost', '127.0.0.1', '::1'], true)) {
    throw new RuntimeException('Only a local PostgreSQL server is allowed. Hosted Neon is never used by this harness.');
}
$port = $url['port'] ?? $connection['port'];
$username = isset($url['user']) ? rawurldecode($url['user']) : $connection['username'];
$password = isset($url['pass']) ? rawurldecode($url['pass']) : $connection['password'];
$adminPassword = getenv('PG_TEST_ADMIN_PASSWORD') ?: @file_get_contents(base_path('../.local/postgres-admin.password'));
if (! $adminPassword) {
    throw new RuntimeException('Set PG_TEST_ADMIN_PASSWORD for the local postgres administrator.');
}
$admin = new PDO("pgsql:host=$host;port=$port;dbname=postgres", getenv('PG_TEST_ADMIN_USER') ?: 'postgres', trim($adminPassword), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$database = 'dineflow_test_'.bin2hex(random_bytes(6));
if (! preg_match('/^dineflow_test_[a-f0-9]{12}$/D', $database)) {
    throw new RuntimeException('Unsafe test database name.');
}
$owner = '"'.str_replace('"', '""', $username).'"';
$admin->exec('CREATE DATABASE "'.$database.'" OWNER '.$owner);
$php = [PHP_BINARY];
if (php_ini_loaded_file()) {
    array_push($php, '-c', php_ini_loaded_file());
}
$environment = ['APP_ENV' => 'testing', 'DB_CONNECTION' => 'pgsql', 'DB_HOST' => $host, 'DB_PORT' => (string) $port, 'DB_DATABASE' => $database,
    'DB_USERNAME' => $username, 'DB_PASSWORD' => $password, 'DB_URL' => '', 'BROADCAST_CONNECTION' => 'log', 'MAIL_MAILER' => 'array', 'QUEUE_CONNECTION' => 'sync', 'CACHE_STORE' => 'array'];
$run = function (array $command, array $env = []) use ($environment): string {
    $process = new Process($command, base_path(), $env + $environment);
    $process->setTimeout(120)->mustRun();

    return $process->getOutput();
};
$dumpFile = tempnam(sys_get_temp_dir(), 'dineflow-recovery-');
$workers = [];
try {
    $run([...$php, 'artisan', 'migrate', '--force']);
    $run([...$php, 'artisan', 'db:seed', '--class=Database\\Seeders\\AcceptanceSeeder', '--force']);
    config(['database.connections.pgsql.url' => null, 'database.connections.pgsql.database' => $database, 'database.default' => 'pgsql']);
    DB::purge('pgsql');
    $start = microtime(true) + 4;
    for ($i = 0; $i < 8; $i++) {
        $process = new Process([...$php, 'tests/Postgres/worker.php', (string) $start], base_path(), $environment);
        $process->setTimeout(60)->start();
        $workers[] = $process;
    }
    $accepted = 0;
    foreach ($workers as $process) {
        $process->wait();
        if (! $process->isSuccessful()) {
            throw new RuntimeException($process->getErrorOutput());
        }
        if (trim($process->getOutput()) === 'accepted') {
            $accepted++;
        }
    }
    if ($accepted !== 1 || Reservation::count() !== 1) {
        throw new RuntimeException('Concurrent bookings were not serialized correctly.');
    }
    echo "PASS: 8 concurrent booking attempts produced exactly 1 reservation.\n";

    $reservation = Reservation::firstOrFail();
    try {
        Reservation::create(array_merge($reservation->only($reservation->getFillable()), ['reference' => 'DIRECT-CONFLICT']));
        throw new RuntimeException('Database overlap constraint did not reject a conflicting direct write.');
    } catch (QueryException $exception) {
        if ((string) $exception->getCode() !== '23P01') {
            throw $exception;
        }
    }
    echo "PASS: PostgreSQL rejected a conflicting write that bypassed the service.\n";

    $localBin = base_path('../.local/pg17/pgsql/bin');
    $binary = fn ($name) => getenv('DINEFLOW_PG_BIN') ? rtrim(getenv('DINEFLOW_PG_BIN'), '/\\').DIRECTORY_SEPARATOR.$name : (PHP_OS_FAMILY === 'Windows' ? $localBin.'/'.$name.'.exe' : $name);
    $pgEnv = ['PGHOST' => $host, 'PGPORT' => (string) $port, 'PGUSER' => $username, 'PGPASSWORD' => $password];
    $run([$binary('pg_dump'), '--format=custom', '--no-owner', '--file='.$dumpFile, $database], $pgEnv);
    DB::purge('pgsql');
    $admin->exec('DROP DATABASE "'.$database.'" WITH (FORCE)');
    $admin->exec('CREATE DATABASE "'.$database.'" OWNER '.$owner);
    $run([$binary('pg_restore'), '--no-owner', '--exit-on-error', '--dbname='.$database, $dumpFile], $pgEnv);
    if (Reservation::count() !== 1 || User::count() !== 7) {
        throw new RuntimeException('Restored fixture record counts did not match.');
    }
    echo "PASS: PostgreSQL backup restored into a recreated scratch database with matching record counts.\n";
} finally {
    foreach ($workers as $process) {
        if ($process->isRunning()) {
            $process->stop();
        }
    }
    DB::purge('pgsql');
    $admin->exec('DROP DATABASE IF EXISTS "'.$database.'" WITH (FORCE)');
    if (is_file($dumpFile)) {
        unlink($dumpFile);
    }
}
