<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Delivery;
use App\Models\MenuItem;
use App\Models\RiderProfile;
use App\Services\AuditLogService;
use App\Services\DeliveryProofService;
use App\Services\DeliveryQuoteService;
use App\Services\DeliveryService;
use App\Services\MapProviderService;
use App\Services\RiderRoutePlanner;
use App\Services\RiderWorkOrder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class DeliveryOperationsController extends Controller
{
    public function saveRouteOrder(Request $request, RiderWorkOrder $work): JsonResponse
    {
        abort_unless($request->user()->hasRole('rider'), 403);
        $data = $request->validate(['delivery_ids' => ['present', 'array', 'max:25'], 'delivery_ids.*' => ['required', 'integer', 'distinct']]);

        return response()->json(['delivery_order' => $work->save($request->user(), $data['delivery_ids'])]);
    }

    public function routePlan(Request $request, RiderRoutePlanner $planner): JsonResponse
    {
        abort_unless($request->user()->hasRole('rider'), 403);
        $data = $request->validate([
            'delivery_ids' => ['present', 'array', 'max:25'],
            'return_to_store' => ['sometimes', 'boolean'],
            'return_store_key' => ['nullable', 'string', 'max:64'],
            'navigation_delivery_id' => ['nullable', 'integer', 'min:1'],
            'delivery_ids.*' => ['required', 'integer', 'distinct'],
            'origin' => ['nullable', 'array:latitude,longitude'],
            'origin.latitude' => ['required_with:origin', 'numeric', 'between:-90,90'],
            'origin.longitude' => ['required_with:origin', 'numeric', 'between:-180,180'],
        ]);

        return response()->json(['data' => $planner->plan($request->user(), $data['delivery_ids'], $data['origin'] ?? null, $data['return_to_store'] ?? false, $data['return_store_key'] ?? null, $data['navigation_delivery_id'] ?? null)])->header('Cache-Control', 'private, no-store');
    }

    public function uploadProof(Request $request, Delivery $delivery, DeliveryProofService $service): JsonResponse
    {
        abort_unless($request->user()->hasRole('rider') && $delivery->rider_user_id === $request->user()->id, 403);
        $request->validate(['photo' => ['required', 'file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:1024', 'dimensions:max_width=6000,max_height=6000']]);

        return response()->json(['data' => $service->upload($delivery, $request->user(), $request->file('photo'))]);
    }

    public function proof(Request $request, Delivery $delivery, DeliveryProofService $service): JsonResponse
    {
        return response()->json(['data' => $service->show($delivery, $request->user())])->header('Cache-Control', 'private, no-store');
    }

    public function riderIndex(Request $request, DeliveryService $service): JsonResponse
    {
        abort_unless($request->user()->hasRole('rider') && $request->user()->hasPermission('deliveries.assigned'), 403);
        $data = $request->validate(['scope' => ['sometimes', 'in:active,history'], 'status' => ['nullable', 'in:delivered,failed,cancelled'], 'page' => ['sometimes', 'integer', 'min:1'], 'q' => ['nullable', 'string', 'max:120'], 'per_page' => ['sometimes', 'integer', 'in:10,20,50']]);
        if (isset($data['scope'])) {
            $page = $service->riderPage($request->user(), $data['scope'], $data['scope'] === 'history' ? ($data['status'] ?? null) : null, $data['q'] ?? null, (int) ($data['per_page'] ?? 20));

            return response()->json(['data' => $page->items(), 'delivery_order' => app(RiderWorkOrder::class)->ids($request->user()), 'next_delivery_id' => $data['scope'] === 'active' ? app(RiderWorkOrder::class)->next($request->user())?->id : null, 'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total(), 'per_page' => $page->perPage(), 'from' => $page->firstItem(), 'to' => $page->lastItem()]]);
        }

        return response()->json(['data' => $service->riderDeliveries($request->user())]);
    }

    public function riderSummary(Request $request, DeliveryService $service): JsonResponse
    {
        return response()->json(['data' => $service->riderSummary($request->user())]);
    }

    public function riderDetails(Request $request, Delivery $delivery): JsonResponse
    {
        abort_unless($request->user()->hasRole('rider') && $delivery->rider_user_id === $request->user()->id, 404);
        $delivery->load(['order.items.addons', 'statusHistory']);
        $catalog = MenuItem::withTrashed()->whereIn('id', $delivery->order->items->pluck('menu_item_id')->filter())->get(['id', 'description', 'image_path', 'image_source_url'])->keyBy('id');
        $items = $delivery->order->items->map(function ($item) use ($catalog) {
            $menuItem = $catalog->get($item->menu_item_id);

            return $item->toArray() + ['description' => $menuItem?->description, 'image_url' => $menuItem?->image_source_url ?: ($menuItem?->image_path ? Storage::disk('public')->url($menuItem->image_path) : null)];
        });

        return response()->json(['data' => ['id' => $delivery->id, 'status' => $delivery->status, 'order' => $delivery->order->only(['order_number', 'subtotal', 'delivery_fee', 'service_charge', 'tax', 'item_discount_total', 'total', 'currency', 'delivery_address', 'delivery_recipient_name', 'delivery_phone', 'delivery_instructions', 'customer_notes', 'created_at']), 'items' => $items, 'history' => $delivery->statusHistory, 'proof_available' => DB::table('delivery_proofs')->where('delivery_id', $delivery->id)->where('rider_user_id', $delivery->rider_user_id)->exists(), 'pickup' => ($delivery->pickup_latitude !== null && $delivery->pickup_longitude !== null ? ['address' => $delivery->pickup_address, 'latitude' => $delivery->pickup_latitude, 'longitude' => $delivery->pickup_longitude] : app(DeliveryQuoteService::class)->location()), 'destination' => ['address' => $delivery->order->delivery_address, 'latitude' => $delivery->order->delivery_latitude, 'longitude' => $delivery->order->delivery_longitude]]]);
    }

    public function respond(Request $request, Delivery $delivery, DeliveryService $service, string $response): JsonResponse
    {
        $data = $request->validate(['reason' => ['nullable', 'string', 'max:1000']]);

        return response()->json(['data' => $service->respond($delivery, $request->user(), $response, $data['reason'] ?? null)]);
    }

    public function status(Request $request, Delivery $delivery, DeliveryService $service): JsonResponse
    {
        $data = $request->validate(['status' => ['required', 'in:arrived_at_restaurant,picked_up,in_transit,delivered,failed'], 'reason' => ['nullable', 'string', 'max:1000']]);

        return response()->json(['data' => $service->transition($delivery, $request->user(), $data['status'], $data['reason'] ?? null)]);
    }

    public function location(Request $request, Delivery $delivery, DeliveryService $service): JsonResponse
    {
        $data = $request->validate(['latitude' => ['required', 'numeric', 'between:-90,90'], 'longitude' => ['required', 'numeric', 'between:-180,180'], 'accuracy_meters' => ['nullable', 'numeric', 'min:0', 'max:10000'], 'speed_mps' => ['nullable', 'numeric', 'min:0', 'max:80']]);

        return response()->json(['data' => $service->location($delivery, $request->user(), $data)]);
    }

    public function tracking(Request $request, Delivery $delivery, DeliveryService $service): JsonResponse
    {
        abort_unless($delivery->order()->where('customer_id', $request->user()->id)->where('order_type', 'delivery')->exists(), 404);

        return response()->json(['data' => $service->tracking($delivery)]);
    }

    public function routePreview(Request $request, Delivery $delivery, MapProviderService $maps): JsonResponse
    {
        abort_unless($delivery->order()->where('customer_id', $request->user()->id)->where('order_type', 'delivery')->exists(), 404);

        return $this->suggestedRoute($delivery, $maps);
    }

    public function riderRoute(Request $request, Delivery $delivery, MapProviderService $maps): JsonResponse
    {
        abort_unless($request->user()->hasRole('rider') && $delivery->rider_user_id === $request->user()->id, 404);

        return $this->suggestedRoute($delivery, $maps);
    }

    private function suggestedRoute(Delivery $delivery, MapProviderService $maps): JsonResponse
    {
        $pickup = $delivery->pickup_latitude !== null ? ['latitude' => $delivery->pickup_latitude, 'longitude' => $delivery->pickup_longitude] : app(DeliveryQuoteService::class)->location();
        $order = $delivery->order;
        $coordinates = [$pickup['latitude'] ?? null, $pickup['longitude'] ?? null, $order->delivery_latitude, $order->delivery_longitude];
        foreach ($coordinates as $index => $coordinate) {
            abort_unless(is_numeric($coordinate) && abs((float) $coordinate) <= ($index % 2 === 0 ? 90 : 180), 422, 'Route coordinates are unavailable.');
        }
        try {
            $route = Cache::remember('delivery-route-preview:'.$delivery->id.':'.sha1(json_encode($coordinates)), now()->addMinutes(30), fn () => $maps->route((float) $coordinates[0], (float) $coordinates[1], (float) $coordinates[2], (float) $coordinates[3], true));
        } catch (\Throwable $exception) {
            report($exception);

            return response()->json(['message' => 'A suggested route is currently unavailable.'], 503);
        }

        return response()->json(['data' => ['kind' => 'suggested_route', 'provider' => config('services.maps.provider'), 'geometry' => $route['geometry'] ?? [], 'duration_minutes' => $route['duration_minutes'] ?? null]]);
    }

    public function managerIndex(Request $request, DeliveryService $service): JsonResponse
    {
        $data = $request->validate(['queue' => ['sometimes', 'in:attention,waiting,pickup,road,finished'], 'q' => ['nullable', 'string', 'max:120'], 'page' => ['sometimes', 'integer', 'min:1'], 'per_page' => ['sometimes', 'integer', 'in:10,20,50']]);
        $result = $service->managerPage($data['queue'] ?? 'attention', $data['q'] ?? null, (int) ($data['per_page'] ?? 20));
        $page = $result['page'];

        return response()->json(['data' => $page->items(), 'riders' => $service->availableRiders(), 'counts' => $result['counts'], 'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total(), 'per_page' => $page->perPage(), 'from' => $page->firstItem(), 'to' => $page->lastItem()]])->header('Cache-Control', 'private, no-store');
    }

    public function recover(Request $request, Delivery $delivery, DeliveryService $service): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'min:3', 'max:1000'], 'custody_confirmed' => ['required', 'accepted']]);

        return response()->json(['data' => $service->recover($delivery, $request->user(), $data['reason'])]);
    }

    public function assign(Request $request, Delivery $delivery, DeliveryService $service): JsonResponse
    {
        $data = $request->validate(['rider_id' => ['required', 'integer', 'exists:users,id'], 'reason' => ['nullable', 'string', 'max:1000']]);

        return response()->json(['data' => $service->assign($delivery, $request->user(), (int) $data['rider_id'], $data['reason'] ?? null)]);
    }

    public function cancel(Request $request, Delivery $delivery, DeliveryService $service): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'min:3', 'max:1000']]);

        return response()->json(['data' => $service->transition($delivery, $request->user(), 'cancelled', $data['reason'])]);
    }

    public function updateRiderProfile(Request $request, AuditLogService $audit): JsonResponse
    {
        abort_unless($request->user()->hasRole('rider') && $request->user()->hasPermission('deliveries.assigned'), 403);
        if (is_string($request->input('vehicle_type'))) {
            $request->merge(['vehicle_type' => RiderProfile::normalizeVehicle($request->input('vehicle_type'))]);
        }
        $data = $request->validate(['phone' => ['nullable', 'string', 'max:32'], 'vehicle_type' => ['nullable', 'string', 'in:bicycle,motorcycle,car'], 'vehicle_plate' => ['nullable', 'string', 'max:24']]);
        $profile = RiderProfile::updateOrCreate(['user_id' => $request->user()->id], $data);
        $audit->record($request->user(), 'rider.profile_updated', $profile, $data, $request);

        return response()->json(['data' => $profile]);
    }

    public function riderProfile(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasRole('rider') && $request->user()->hasPermission('deliveries.assigned'), 403);

        return response()->json(['data' => RiderProfile::firstOrCreate(['user_id' => $request->user()->id])]);
    }

    public function notifications(Request $request): JsonResponse
    {
        $notifications = $request->user()->notifications()->latest()->limit(30)->get();

        return response()->json(['data' => $notifications, 'unread_count' => $request->user()->unreadNotifications()->count()]);
    }

    public function readNotification(Request $request, string $notification): JsonResponse
    {
        $record = $request->user()->notifications()->whereKey($notification)->firstOrFail();
        $record->markAsRead();

        return response()->json(['data' => ['read_at' => $record->read_at]]);
    }
}
