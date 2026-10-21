<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DeliveryAddress;
use App\Models\MenuItem;
use App\Models\RestaurantSetting;
use App\Services\AuditLogService;
use App\Services\DeliveryQuoteService;
use App\Services\MapProviderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use RuntimeException;

class DeliveryController extends Controller
{
    public function restaurant(DeliveryQuoteService $quotes): JsonResponse
    {
        $location = $quotes->location();
        return response()->json(['map_provider' => config('services.maps.provider'), 'data' => $location ? $location + ['navigation_url' => isset($location['latitude'], $location['longitude']) ? 'https://www.google.com/maps/dir/?api=1&destination='.$location['latitude'].','.$location['longitude'] : null] : null]);
    }

    public function branding(): JsonResponse
    {
        $profile = RestaurantSetting::where('key', 'business_profile')->value('value') ?? [];
        return response()->json(['data' => ['name' => $profile['restaurant_name'] ?? 'DineFlow', 'brand_color' => $profile['brand_color'] ?? '#2e5a43']]);
    }

    public function search(Request $request, MapProviderService $maps): JsonResponse
    {
        $data = $request->validate(['q' => ['required', 'string', 'min:3', 'max:180']]);
        try { return response()->json(['data' => $maps->search($data['q'])]); }
        catch (RuntimeException $exception) { return response()->json(['message' => $exception->getMessage()], 503); }
    }

    public function addresses(Request $request): JsonResponse
    {
        return response()->json(['data' => DeliveryAddress::where('user_id', $request->user()->id)->orderByDesc('is_default')->latest()->get()]);
    }

    public function saveAddress(Request $request, AuditLogService $audit, ?DeliveryAddress $address = null): JsonResponse
    {
        if ($address) abort_unless($address->user_id === $request->user()->id, 404);
        $data = $request->validate(['label' => ['required', 'string', 'max:60'], 'recipient_name' => ['required', 'string', 'max:120'], 'phone' => ['required', 'string', 'max:32'], 'formatted_address' => ['required', 'string', 'max:500'], 'latitude' => ['required', 'numeric', 'between:-90,90'], 'longitude' => ['required', 'numeric', 'between:-180,180'], 'delivery_instructions' => ['nullable', 'string', 'max:1000'], 'is_default' => ['sometimes', 'boolean']]);
        $saved = DB::transaction(function () use ($request, $data, $address) {
            if (! empty($data['is_default'])) DeliveryAddress::where('user_id', $request->user()->id)->update(['is_default' => false]);
            if ($address) { $address->update($data); return $address->fresh(); }
            return DeliveryAddress::create($data + ['user_id' => $request->user()->id]);
        });
        $audit->record($request->user(), $address ? 'delivery_address.updated' : 'delivery_address.created', $saved, [], $request);
        return response()->json(['data' => $saved], $address ? 200 : 201);
    }

    public function deleteAddress(Request $request, DeliveryAddress $address, AuditLogService $audit): JsonResponse
    {
        abort_unless($address->user_id === $request->user()->id, 404);
        $address->delete();
        $audit->record($request->user(), 'delivery_address.deleted', null, ['address_id' => $address->id], $request);
        return response()->json([], 204);
    }

    public function quote(Request $request, DeliveryQuoteService $quotes): JsonResponse
    {
        $data = $request->validate(['latitude' => ['required', 'numeric', 'between:-90,90'], 'longitude' => ['required', 'numeric', 'between:-180,180'], 'items' => ['required', 'array', 'min:1', 'max:50'], 'items.*.menu_item_id' => ['required', 'integer', 'exists:menu_items,id'], 'items.*.variant_id' => ['nullable', 'integer'], 'items.*.addon_ids' => ['sometimes', 'array', 'max:20'], 'items.*.quantity' => ['required', 'integer', 'min:1', 'max:99']]);
        $subtotal = $this->subtotalCents($data['items']);
        return response()->json(['data' => $quotes->quote((float) $data['latitude'], (float) $data['longitude'], $subtotal)]);
    }

    public function showPolicy(DeliveryQuoteService $quotes): JsonResponse
    {
        return response()->json(['data' => ['policy' => $quotes->policy(), 'location' => $quotes->location()]]);
    }

    public function savePolicy(Request $request, AuditLogService $audit): JsonResponse
    {
        abort_unless($request->user()->hasPermission('settings.manage'), 403);
        $data = $request->validate(['radius_km' => ['required', 'numeric', 'gt:0', 'max:100'], 'minimum_order' => ['required', 'numeric', 'min:0', 'max:100000'], 'base_fee' => ['required', 'numeric', 'min:0', 'max:100000'], 'per_km_fee' => ['required', 'numeric', 'min:0', 'max:10000'], 'free_delivery_over' => ['nullable', 'numeric', 'gt:0', 'max:100000'], 'operating_hours' => ['nullable', 'array'], 'operating_hours.*.open' => ['nullable', 'date_format:H:i'], 'operating_hours.*.close' => ['nullable', 'date_format:H:i'], 'operating_hours.*.closed' => ['sometimes', 'boolean']]);
        RestaurantSetting::updateOrCreate(['key' => 'delivery_policy'], ['value' => $data]);
        $audit->record($request->user(), 'delivery.policy_updated', null, $data, $request);
        return response()->json(['data' => $data]);
    }

    public function saveLocation(Request $request, AuditLogService $audit): JsonResponse
    {
        abort_unless($request->user()->hasPermission('settings.manage'), 403);
        $data = $request->validate(['name' => ['nullable', 'string', 'max:120'], 'address' => ['required', 'string', 'max:500'], 'latitude' => ['required', 'numeric', 'between:-90,90'], 'longitude' => ['required', 'numeric', 'between:-180,180'], 'phone' => ['nullable', 'string', 'max:32'], 'contact_email' => ['nullable', 'email', 'max:254'], 'opening_hours' => ['nullable', 'array']]);
        RestaurantSetting::updateOrCreate(['key' => 'restaurant_location'], ['value' => $data]);
        $audit->record($request->user(), 'restaurant.location_updated', null, $data, $request);
        return response()->json(['data' => $data]);
    }

    private function subtotalCents(array $lines): int
    {
        $total = 0;
        foreach ($lines as $line) {
            $item = MenuItem::with(['variants', 'addons'])->find($line['menu_item_id']);
            if (! $item || ! $item->is_currently_available || ! $item->category?->is_active) throw ValidationException::withMessages(['items' => 'One or more selected menu items are unavailable.']);
            $variant = empty($line['variant_id']) ? null : $item->variants->firstWhere('id', (int) $line['variant_id']);
            if (! empty($line['variant_id']) && (! $variant || ! $variant->is_active)) throw ValidationException::withMessages(['items' => 'A selected menu option is unavailable.']);
            $ids = $line['addon_ids'] ?? []; $addons = $item->addons->whereIn('id', $ids)->where('is_active', true);
            if ($addons->count() !== count($ids)) throw ValidationException::withMessages(['items' => 'A selected menu add-on is unavailable.']);
            $qty = (int) $line['quantity']; $price = (int) round(((float) $item->base_price + (float) ($variant?->price_adjustment ?? 0)) * 100);
            $gross = $price * $qty + (int) round($addons->sum(fn ($a) => (float) $a->price) * 100) * $qty;
            $discount = (int) round(($price * $qty) * (float) $item->discount_percent / 100);
            $total += $gross - $discount;
        }
        return $total;
    }
}
