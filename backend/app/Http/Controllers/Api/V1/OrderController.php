<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\CreateOrderRequest;
use App\Models\Order;
use App\Services\OrderService;
use App\Services\DeliveryQuoteService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OrderController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate(['order_type' => ['nullable','in:dine_in,pickup,delivery'], 'status' => ['nullable','in:pending,confirmed,preparing,ready_to_serve,served,completed,cancelled'], 'payment_status' => ['nullable','in:paid,pending,unpaid'], 'from' => ['nullable','date'], 'to' => ['nullable','date','after_or_equal:from'], 'per_page' => ['nullable','integer','min:1','max:100']]);
        $query = Order::query()->with(['items.addons', 'table:id,table_number', 'statusHistory','delivery.rider:id,name','payments:id,order_id,status,amount,method,reference_number','paymentAllocations.payment:id,status']);
        if (! $request->user()->hasPermission('orders.view') && ! $request->user()->hasPermission('orders.manage')) {
            $query->where('customer_id', $request->user()->id);
        }
        if (isset($filters['order_type'])) $query->where('order_type', $filters['order_type']);
        if (isset($filters['status'])) $query->where('status', $filters['status']);
        if (isset($filters['from'])) $query->where('created_at', '>=', $filters['from'].' 00:00:00');
        if (isset($filters['to'])) $query->where('created_at', '<=', $filters['to'].' 23:59:59');
        if (($filters['payment_status'] ?? null) === 'paid') $query->where(fn ($q) => $q->whereHas('payments', fn ($p) => $p->where('status','paid'))->orWhereHas('paymentAllocations.payment', fn ($p) => $p->where('status','paid')));
        if (($filters['payment_status'] ?? null) === 'pending') $query->whereHas('payments', fn ($p) => $p->where('status','pending'));
        if (($filters['payment_status'] ?? null) === 'unpaid') $query->whereDoesntHave('payments', fn ($p) => $p->where('status','paid'))->whereDoesntHave('paymentAllocations.payment', fn ($p) => $p->where('status','paid'));
        $page = $query->latest()->paginate((int) ($filters['per_page'] ?? 20));
        $page->getCollection()->each(function (Order $order): void { $order->setAttribute('payment_summary', app(\App\Services\PaymentService::class)->orderSummary($order)); $order->unsetRelation('payments'); $order->unsetRelation('paymentAllocations'); });
        return response()->json($page);
    }

    public function store(CreateOrderRequest $request, OrderService $orders, DeliveryQuoteService $deliveryQuotes): JsonResponse
    {
        return response()->json(['data' => $orders->create($request->user(), $request->validated(), $deliveryQuotes)], 201);
    }

    public function show(Request $request, Order $order): JsonResponse
    {
        abort_unless($order->customer_id === $request->user()->id || $request->user()->hasPermission('orders.view') || $request->user()->hasPermission('orders.manage'), 404);
        $order->load(['items.addons', 'table:id,table_number', 'statusHistory','delivery.rider:id,name','payments:id,order_id,status,amount,method,reference_number','paymentAllocations.payment:id,status']);
        $order->setAttribute('payment_summary', app(\App\Services\PaymentService::class)->orderSummary($order));
        $order->unsetRelation('payments'); $order->unsetRelation('paymentAllocations');
        return response()->json(['data' => $order]);
    }

    public function status(Request $request, Order $order, OrderService $orders): JsonResponse
    {
        $data = $request->validate(['status' => ['required', 'in:confirmed,preparing,ready_to_serve,served,completed,cancelled'], 'note' => ['nullable', 'string', 'max:500']]);
        return response()->json(['data' => $orders->transition($order, $request->user(), $data['status'], $data['note'] ?? null)]);
    }

    public function kitchenIndex(Request $request): JsonResponse
    {
        return response()->json(['data' => Order::with(['items.addons'])->whereIn('status', ['confirmed', 'preparing'])->oldest()->get()]);
    }
}
