<?php

use App\Console\Commands\CreateAdministrator;
use App\Console\Commands\ExpirePendingPayments;
use App\Console\Commands\PrepareDeployment;
use App\Console\Commands\PurgeDeliveryLocations;
use App\Console\Commands\PurgeReadNotifications;
use App\Console\Commands\SendReservationReminders;
use App\Http\Middleware\ApiErrorCode;
use App\Http\Middleware\EnsureAccountIsActive;
use App\Http\Middleware\IdempotentSubmission;
use App\Http\Middleware\RequirePermission;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(web: __DIR__.'/../routes/web.php', api: __DIR__.'/../routes/api.php', commands: __DIR__.'/../routes/console.php', health: '/up')
    ->withBroadcasting(__DIR__.'/../routes/channels.php', ['prefix' => 'api/v1', 'middleware' => ['api', 'auth:sanctum', 'account.active']])
    ->withCommands([CreateAdministrator::class, PrepareDeployment::class, PurgeDeliveryLocations::class, ExpirePendingPayments::class, SendReservationReminders::class, PurgeReadNotifications::class])
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->statefulApi();
        $middleware->appendToGroup('api', ApiErrorCode::class);
        if (env('RENDER') === 'true') {
            $middleware->trustProxies(at: '*', headers: Request::HEADER_X_FORWARDED_FOR | Request::HEADER_X_FORWARDED_PROTO | Request::HEADER_X_FORWARDED_PORT);
        }
        $middleware->redirectGuestsTo(fn (Request $request) => $request->is('api/*') ? null : route('login'));
        $middleware->alias([
            'account.active' => EnsureAccountIsActive::class,
            'permission' => RequirePermission::class,
            'idempotent' => IdempotentSubmission::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->render(function (QueryException $exception, Request $request) {
            if ($request->is('api/*') && (string) $exception->getCode() === '23P01') {
                return response()->json(['code' => 'reservation_conflict', 'message' => 'That table or time is no longer available. Choose another table or time.'], 409);
            }
        });
        $exceptions->shouldRenderJsonWhen(fn (Request $request, Throwable $exception): bool => $request->is('api/*') || $request->expectsJson());
        $exceptions->respond(function ($response) {
            return request()->is('api/*') ? ApiErrorCode::normalize($response) : $response;
        });
    })->create();
