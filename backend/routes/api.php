<?php

use App\Http\Controllers\Api\V1\AccessDemoController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\DeliveryController;
use App\Http\Controllers\Api\V1\DeliveryOperationsController;
use App\Http\Controllers\Api\V1\DiningController;
use App\Http\Controllers\Api\V1\HealthController;
use App\Http\Controllers\Api\V1\MenuController;
use App\Http\Controllers\Api\V1\OperationsController;
use App\Http\Controllers\Api\V1\OrderController;
use App\Http\Controllers\Api\V1\PaymentController;
use App\Http\Controllers\Api\V1\ReservationController;
use App\Http\Controllers\Api\V1\StaffAccountController;
use Illuminate\Support\Facades\Route;

Route::post('/v1/webhooks/paymongo', [PaymentController::class, 'webhook'])->middleware('throttle:120,1');

Route::prefix('v1')->group(function (): void {
    Route::get('/health', HealthController::class)->middleware('throttle:30,1');
    Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:6,1');
    Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:6,1');
    Route::post('/forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:3,1');
    Route::post('/reset-password', [AuthController::class, 'resetPassword'])->middleware('throttle:6,1');

    Route::get('/menu/categories', [MenuController::class, 'categories']);
    Route::get('/menu/items', [MenuController::class, 'index']);
    Route::get('/menu/items/{item}', [MenuController::class, 'show']);
    Route::get('/floor-plan/floors', [ReservationController::class, 'floors']);
    Route::get('/reservations/availability', [ReservationController::class, 'availability']);
    Route::get('/restaurant/location', [DeliveryController::class, 'restaurant']);
    Route::get('/restaurant/branding', [DeliveryController::class, 'branding']);

    Route::middleware(['auth:sanctum', 'account.active'])->group(function (): void {
        Route::middleware('permission:menu.manage')->prefix('menu')->group(function (): void {
            Route::post('/categories', [MenuController::class, 'storeCategory']);
            Route::put('/categories/{category}', [MenuController::class, 'updateCategory']);
            Route::post('/items', [MenuController::class, 'storeItem']);
            Route::put('/items/{item}', [MenuController::class, 'updateItem']);
            Route::patch('/items/{item}/active', [MenuController::class, 'deactivateItem']);
            Route::patch('/items/{item}/availability', [MenuController::class, 'availability']);
        });
    });

    Route::middleware(['auth:sanctum', 'account.active'])->group(function (): void {
        Route::post('/logout', [AuthController::class, 'logout']);
        Route::get('/me', [AuthController::class, 'me']);
        Route::patch('/me', [AuthController::class, 'update'])->middleware('throttle:10,1');

        Route::get('/maps/search', [DeliveryController::class, 'search'])->middleware('throttle:20,1');
        Route::post('/delivery/quote', [DeliveryController::class, 'quote'])->middleware('throttle:30,1');
        Route::get('/addresses', [DeliveryController::class, 'addresses']);
        Route::post('/addresses', [DeliveryController::class, 'saveAddress']);
        Route::put('/addresses/{address}', [DeliveryController::class, 'saveAddress']);
        Route::delete('/addresses/{address}', [DeliveryController::class, 'deleteAddress']);
        Route::get('/admin/delivery-policy', [DeliveryController::class, 'showPolicy'])->middleware('permission:settings.manage');
        Route::put('/admin/delivery-policy', [DeliveryController::class, 'savePolicy'])->middleware('permission:settings.manage');
        Route::put('/admin/restaurant/location', [DeliveryController::class, 'saveLocation'])->middleware('permission:settings.manage');

        Route::get('/notifications', [DeliveryOperationsController::class, 'notifications']);
        Route::patch('/notifications/{notification}/read', [DeliveryOperationsController::class, 'readNotification']);
        Route::get('/my/deliveries/{delivery}', [DeliveryOperationsController::class, 'tracking'])->middleware('permission:orders.view_own');
        Route::get('/rider/assignments', [DeliveryOperationsController::class, 'riderIndex'])->middleware('permission:deliveries.assigned');
        Route::get('/rider/profile', [DeliveryOperationsController::class, 'riderProfile'])->middleware('permission:deliveries.assigned');
        Route::put('/rider/profile', [DeliveryOperationsController::class, 'updateRiderProfile'])->middleware('permission:deliveries.assigned');
        Route::post('/rider/deliveries/{delivery}/{response}', [DeliveryOperationsController::class, 'respond'])->whereIn('response', ['accept', 'reject'])->middleware('permission:deliveries.assigned');
        Route::patch('/rider/deliveries/{delivery}/status', [DeliveryOperationsController::class, 'status'])->middleware('permission:deliveries.assigned');
        Route::post('/rider/deliveries/{delivery}/locations', [DeliveryOperationsController::class, 'location'])->middleware(['permission:deliveries.assigned', 'throttle:12,1']);
        Route::get('/admin/deliveries', [DeliveryOperationsController::class, 'managerIndex'])->middleware('permission:deliveries.manage');
        Route::post('/admin/deliveries/{delivery}/assign', [DeliveryOperationsController::class, 'assign'])->middleware('permission:deliveries.manage');
        Route::post('/admin/deliveries/{delivery}/cancel', [DeliveryOperationsController::class, 'cancel'])->middleware('permission:deliveries.manage');

        Route::post('/orders/{order}/payments/checkout', [PaymentController::class, 'orderCheckout'])->middleware('throttle:10,1');
        Route::post('/orders/{order}/payments/cash', [PaymentController::class, 'cashOrder'])->middleware('permission:payments.manage');
        Route::post('/dining-sessions/{session}/payments/checkout', [PaymentController::class, 'sessionCheckout'])->middleware('permission:payments.manage');
        Route::post('/dining-sessions/{session}/payments/cash', [PaymentController::class, 'cashSession'])->middleware('permission:payments.manage');
        Route::post('/reservations/{reservation}/deposit/checkout', [PaymentController::class, 'reservationCheckout'])->middleware(['permission:reservations.view_own', 'throttle:10,1']);
        Route::post('/reservations/{reservation}/deposit/cash', [PaymentController::class, 'cashReservation'])->middleware('permission:payments.manage');
        Route::get('/payments', [PaymentController::class, 'index']);
        Route::get('/dining-sessions/open-bills', [PaymentController::class, 'openBills'])->middleware('permission:payments.manage');
        Route::get('/cashier/payment-queue', [PaymentController::class, 'cashierQueue'])->middleware('permission:payments.manage');
        Route::get('/payments/{payment}', [PaymentController::class, 'show']);
        Route::get('/payments/{payment}/receipt', [PaymentController::class, 'receipt']);
        Route::post('/payments/{payment}/cancel', [PaymentController::class, 'cancel']);
        Route::post('/admin/payments/{payment}/refund', [PaymentController::class, 'refund'])->middleware('permission:payments.refund');
        Route::get('/admin/payment-policy', [PaymentController::class, 'policy'])->middleware('permission:settings.manage');
        Route::put('/admin/payment-policy', [PaymentController::class, 'policy'])->middleware('permission:settings.manage');

        Route::middleware('permission:users.manage')->prefix('admin')->group(function (): void {
            Route::get('/users', [StaffAccountController::class, 'index']);
            Route::get('/roles', [StaffAccountController::class, 'roles']);
            Route::post('/users', [StaffAccountController::class, 'store']);
            Route::patch('/users/{user}/active', [StaffAccountController::class, 'setActive']);
        });
        Route::middleware(['permission:users.manage', 'permission:roles.assign'])->prefix('admin')->group(function (): void {
            Route::put('/users/{user}/role', [StaffAccountController::class, 'assignRole']);
        });
        Route::get('/admin/audit-logs', [StaffAccountController::class, 'auditLogs'])->middleware('permission:audit.view');

        Route::get('/orders', [OrderController::class, 'index']);
        Route::post('/orders', [OrderController::class, 'store'])->middleware(['throttle:20,1', 'idempotent']);
        Route::get('/orders/{order}', [OrderController::class, 'show']);
        Route::patch('/orders/{order}/status', [OrderController::class, 'status']);

        Route::get('/reservations', [ReservationController::class, 'index']);
        Route::post('/reservations', [ReservationController::class, 'store'])->middleware(['throttle:10,1', 'idempotent']);
        Route::get('/reservations/{reservation}', [ReservationController::class, 'show']);
        Route::patch('/reservations/{reservation}/status', [ReservationController::class, 'updateStatus']);
        Route::post('/reservations/{reservation}/reschedule', [ReservationController::class, 'reschedule'])->middleware(['throttle:10,1', 'idempotent']);
        Route::patch('/service/tables/{table}/occupancy', [ReservationController::class, 'occupancy'])->middleware('permission:tables.occupancy.manage');
        Route::put('/admin/reservation-policy', [ReservationController::class, 'policy'])->middleware('permission:settings.manage');
        Route::get('/admin/reservation-policy', [ReservationController::class, 'showPolicy'])->middleware('permission:settings.manage');
        Route::middleware('permission:floorplan.manage')->prefix('admin/floor-plan')->group(function (): void {
            Route::get('/floors', [ReservationController::class, 'adminFloors']);
            Route::get('/presets', [ReservationController::class, 'presets']);
            Route::post('/presets', [ReservationController::class, 'storePreset']);
            Route::delete('/presets/{preset}', [ReservationController::class, 'deletePreset']);
            Route::post('/floors', [ReservationController::class, 'createFloor']);
            Route::delete('/floors/{floor}', [ReservationController::class, 'deleteDraftFloor']);
            Route::post('/floors/{floor}/tables', [ReservationController::class, 'createFloorTable']);
            Route::put('/tables/{table}', [ReservationController::class, 'updateFloorTable']);
            Route::put('/floors/{floor}/layout', [ReservationController::class, 'saveLayout']);
            Route::post('/floors/{floor}/publish', [ReservationController::class, 'publish']);
            Route::delete('/objects/{object}', [ReservationController::class, 'deleteLayoutObject']);
        });

        Route::get('/service/tables', [DiningController::class, 'tables'])->middleware('permission:service.tables.view');
        Route::post('/service/tables', [DiningController::class, 'createTable'])->middleware('permission:floorplan.manage');
        Route::post('/service/tables/{table}/sessions', [DiningController::class, 'openSession'])->middleware('permission:service.sessions.manage');
        Route::patch('/service/dining-sessions/{session}/close', [DiningController::class, 'closeSession'])->middleware('permission:service.sessions.manage');

        Route::get('/kitchen/orders', [OrderController::class, 'kitchenIndex'])->middleware('permission:kitchen.orders.view');
        Route::get('/dashboard', [OperationsController::class, 'dashboard'])->middleware('permission:dashboard.view');
        Route::get('/reports', [OperationsController::class, 'report']);
        Route::get('/reports/financial', [OperationsController::class, 'report'])->middleware('permission:reports.financial');
        Route::get('/reports/export', [OperationsController::class, 'export']);
        Route::get('/cashier/payments', [AccessDemoController::class, 'cashierPayments'])->middleware('permission:payments.manage');
        Route::get('/cashier/summary', [OperationsController::class, 'cashierSummary'])->middleware('permission:reports.daily_transactions');
        Route::get('/operations', [OperationsController::class, 'dashboard'])->middleware('permission:reports.operations');
        Route::get('/admin/settings', [OperationsController::class, 'settings'])->middleware('permission:settings.manage');
        Route::put('/admin/settings', [OperationsController::class, 'settings'])->middleware('permission:settings.manage');
    });
});
