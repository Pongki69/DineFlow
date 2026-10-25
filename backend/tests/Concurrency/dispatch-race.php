<?php

// Explicitly isolated, destructive PostgreSQL integration harness. Never uses DB_URL/.env credentials.
use App\Models\Delivery;
use App\Models\DispatchOffer;
use App\Models\Order;
use App\Models\Payment;
use App\Models\RestaurantSetting;
use App\Models\RiderProfile;
use App\Models\Role;
use App\Models\User;
use App\Services\DeliveryProofService;
use App\Services\DeliveryService;
use App\Services\DispatchGeo;
use App\Services\DispatchService;
use App\Services\MapProviderService;
use Database\Seeders\AuthSeeder;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Tests\Support\DeliveryPhoto;

require __DIR__.'/../../vendor/autoload.php';
$database = getenv('DISPATCH_TEST_DATABASE') ?: 'dineflow_dispatch_test';
$port = (int) (getenv('DISPATCH_TEST_PORT') ?: 55433);
if (! preg_match('/^dineflow_dispatch_test[a-z0-9_]*$/', $database) || $port < 1024 || $port === 5432) {
    throw new RuntimeException('Use a disposable dispatch test database and a non-application local port.');
}
$user = getenv('DISPATCH_TEST_USER') ?: 'dispatch_test';
$password = getenv('DISPATCH_TEST_PASSWORD') ?: '';
$dsn = "pgsql:host=127.0.0.1;port={$port};dbname=";
if (($argv[1] ?? '') !== '--worker') {
    $admin = new PDO($dsn.'postgres', $user, $password, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $exists = $admin->prepare('SELECT 1 FROM pg_database WHERE datname = ?');
    $exists->execute([$database]);
    if (! $exists->fetchColumn()) {
        $admin->exec('CREATE DATABASE "'.$database.'"');
    }
}
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
config(['database.default' => 'pgsql', 'database.connections.pgsql.url' => null, 'database.connections.pgsql.host' => '127.0.0.1', 'database.connections.pgsql.port' => $port,
    'database.connections.pgsql.database' => $database, 'database.connections.pgsql.username' => $user, 'database.connections.pgsql.password' => $password,
    'database.connections.pgsql.sslmode' => 'disable', 'cache.default' => 'array', 'broadcasting.default' => 'null', 'dispatch.enabled' => true]);
DB::purge('pgsql');
$app->instance(MapProviderService::class, new class extends MapProviderService
{
    public function route(float $fromLat, float $fromLng, float $toLat, float $toLng, bool $includeGeometry = false): array
    {
        usleep(100000); // Two workers can compute the same candidate before the final SQL reservation.

        return ['duration_minutes' => 4, 'distance_km' => 1, 'geometry' => []];
    }
});

if (($argv[1] ?? '') === '--worker') {
    $barrier = getenv('DISPATCH_RACE_BARRIER');
    $until = microtime(true) + 10;
    while (! is_file($barrier) && microtime(true) < $until) {
        usleep(10000);
    }
    if (! is_file($barrier)) {
        exit(2);
    }
    if ($argv[2] === 'offer') {
        app(DispatchService::class)->step((int) $argv[3]);
    }
    if ($argv[2] === 'accept') {
        app(DispatchService::class)->respond(DispatchOffer::findOrFail($argv[3]), User::findOrFail($argv[4]), 'accept');
    }
    if (in_array($argv[2], ['gps', 'proof', 'fail', 'recover'], true)) {
        $delivery = Delivery::findOrFail($argv[3]);
        $actor = User::findOrFail($argv[4]);
        try {
            match ($argv[2]) {
                'gps' => app(DeliveryService::class)->location($delivery, $actor, ['latitude' => 14.61, 'longitude' => 120.98, 'accuracy_meters' => 10]),
                'proof' => app(DeliveryProofService::class)->upload($delivery, $actor, DeliveryPhoto::file()),
                'fail' => app(DeliveryService::class)->transition($delivery, $actor, 'failed', 'Concurrency check'),
                'recover' => app(DeliveryService::class)->recover($delivery, $actor, 'Custody checked for concurrency test'),
            };
        } catch (AuthorizationException|ValidationException $exception) {
            // A winning transition correctly rejects later telemetry/proof or duplicate recovery.
        }
    }
    exit(0);
}

function race(array $jobs): void
{
    $barrier = tempnam(sys_get_temp_dir(), 'dispatch-race-');
    unlink($barrier);
    putenv('DISPATCH_RACE_BARRIER='.$barrier);
    $processes = [];
    try {
        foreach ($jobs as $job) {
            $pipes = [];
            $process = proc_open([PHP_BINARY, __FILE__, '--worker', ...array_map('strval', $job)], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, dirname(__DIR__, 2));
            if (! is_resource($process)) {
                throw new RuntimeException('Could not spawn race worker.');
            }
            fclose($pipes[0]);
            $processes[] = [$process, $pipes];
        }
        touch($barrier);
        foreach ($processes as [$process, $pipes]) {
            $output = stream_get_contents($pipes[1]).stream_get_contents($pipes[2]);
            fclose($pipes[1]);
            fclose($pipes[2]);
            if (proc_close($process) !== 0) {
                throw new RuntimeException('Race worker failed: '.$output);
            }
        }
    } finally {
        if (is_file($barrier)) {
            unlink($barrier);
        }
    }
}

function ensure(bool $ok, string $message): void
{
    if (! $ok) {
        throw new RuntimeException($message);
    }
}

Artisan::call('migrate:fresh', ['--force' => true]);
Artisan::call('db:seed', ['--class' => AuthSeeder::class, '--force' => true]);
RestaurantSetting::create(['key' => 'business_profile', 'value' => ['notifications_enabled' => false]]);
$rider = User::create(['name' => 'Race rider', 'email' => 'race-rider@example.test', 'password' => 'Race-Test-Password-123!', 'is_active' => true]);
$rider->roles()->attach(Role::where('slug', 'rider')->first());
RiderProfile::create(['user_id' => $rider->id, 'vehicle_type' => 'motorcycle', 'is_online' => true, 'is_available' => true, 'latitude' => 14.601, 'longitude' => 120.98, 'located_at' => now(), 'accuracy_meters' => 10, 'geohash' => DispatchGeo::hash(14.601, 120.98)]);
$deliveries = [];
for ($i = 0; $i < 2; $i++) {
    $order = Order::create(['order_number' => 'RACE-'.$i, 'customer_id' => $rider->id, 'customer_name_snapshot' => 'Race', 'order_type' => 'delivery', 'status' => 'confirmed', 'total' => 100, 'subtotal' => 100, 'currency' => 'PHP', 'prep_ready_at' => now(), 'delivery_vehicle_class' => 'motorcycle', 'delivery_latitude' => 14.62, 'delivery_longitude' => 120.98]);
    Payment::create(['order_id' => $order->id, 'purpose' => 'order', 'method' => 'cash', 'status' => 'paid', 'amount' => 100, 'currency' => 'PHP']);
    $deliveries[] = Delivery::create(['order_id' => $order->id, 'status' => 'pending_assignment', 'pickup_latitude' => 14.6, 'pickup_longitude' => 120.98]);
}
race([['offer', $deliveries[0]->id], ['offer', $deliveries[0]->id], ['offer', $deliveries[1]->id], ['offer', $deliveries[1]->id], ['offer', $deliveries[0]->id], ['offer', $deliveries[1]->id]]);
ensure(DispatchOffer::where('status', 'offered')->count() === 1, 'A rider was reserved for multiple concurrent offers.');
$offer = DispatchOffer::sole();
race(array_fill(0, 6, ['accept', $offer->id, $rider->id]));
ensure($offer->fresh()->status === 'accepted', 'Offer not accepted.');
ensure($offer->delivery->assignments()->count() === 1, 'Duplicate assignment created during simultaneous accepts.');
ensure(Delivery::whereNotNull('rider_user_id')->count() === 1, 'Two deliveries were incorrectly accepted.');
// Verify PostgreSQL unique reservations independently of service checks.
$row = ['delivery_id' => $deliveries[1]->id, 'rider_user_id' => $rider->id, 'active_delivery_id' => $deliveries[1]->id, 'active_rider_user_id' => $rider->id, 'expires_at' => now()->addSeconds(25), 'ranking' => [], 'status' => 'offered'];
DispatchOffer::create($row);
$rejected = false;
try {
    DispatchOffer::create($row);
} catch (QueryException $exception) {
    $rejected = $exception->getCode() === '23505';
}
ensure($rejected, 'PostgreSQL did not reject duplicate reservations.');
// Delivery-local locks must not revive a terminal delivery or duplicate recovery.
app(DispatchService::class)->withdraw($deliveries[1]->id);
$active = $offer->delivery->fresh();
$active->order->update(['status' => 'ready_to_serve']);
$active->update(['status' => 'in_transit']);
race([['gps', $active->id, $rider->id], ['proof', $active->id, $rider->id], ['fail', $active->id, $rider->id], ['gps', $active->id, $rider->id]]);
ensure($active->fresh()->status === 'failed', 'Telemetry/proof race changed the terminal status.');
$sampleCount = $active->locationUpdates()->count();
try {
    app(DeliveryService::class)->location($active->fresh(), $rider, ['latitude' => 14.61, 'longitude' => 120.98]);
    throw new RuntimeException('Terminal delivery accepted a late GPS update.');
} catch (AuthorizationException $exception) {
    ensure($active->locationUpdates()->count() === $sampleCount, 'Terminal delivery persisted late GPS.');
}
$manager = User::create(['name' => 'Race manager', 'email' => 'race-manager@example.test', 'password' => 'Race-Test-Password-123!', 'is_active' => true]);
$manager->roles()->attach(Role::where('slug', 'manager')->first());
race([['recover', $active->id, $manager->id], ['recover', $active->id, $manager->id]]);
ensure($active->fresh()->status === 'in_transit', 'Manager recovery did not restore the previous stage.');
ensure($active->statusHistory()->where('from_status', 'failed')->count() === 1, 'Concurrent recovery created duplicate history.');
echo "PASS: concurrent offers/acceptance, SQL reservations, GPS/proof versus terminal transition, and duplicate recovery.\n";
