<?php

use App\Http\Middleware\EnsureAccountIsActive;
use App\Http\Middleware\RequirePermission;
use App\Console\Commands\CreateAdministrator;
use App\Console\Commands\PurgeDeliveryLocations;
use App\Console\Commands\ExpirePendingPayments;
use App\Console\Commands\SendReservationReminders;
use App\Console\Commands\PurgeReadNotifications;
use App\Console\Commands\PrepareDeployment;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(web: __DIR__.'/../routes/web.php', api: __DIR__.'/../routes/api.php', commands: __DIR__.'/../routes/console.php', health: '/up')
    ->withBroadcasting(__DIR__.'/../routes/channels.php', ['prefix'=>'api/v1','middleware'=>['api','auth:sanctum','account.active']])
    ->withCommands([CreateAdministrator::class, PrepareDeployment::class, PurgeDeliveryLocations::class, ExpirePendingPayments::class, SendReservationReminders::class, PurgeReadNotifications::class])
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->statefulApi();
        if (env('RENDER') === 'true') {
            $middleware->trustProxies(at: '*', headers: Request::HEADER_X_FORWARDED_FOR | Request::HEADER_X_FORWARDED_PROTO | Request::HEADER_X_FORWARDED_PORT);
        }
        $middleware->redirectGuestsTo(fn (Request $request) => $request->is('api/*') ? null : route('login'));
        $middleware->alias([
            'account.active' => EnsureAccountIsActive::class,
            'permission' => RequirePermission::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(fn (Request $request, \Throwable $exception): bool => $request->is('api/*') || $request->expectsJson());
    })->create();
