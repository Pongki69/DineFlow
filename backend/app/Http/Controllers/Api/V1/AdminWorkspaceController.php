<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Delivery;
use App\Models\Order;
use App\Models\RestaurantSetting;
use App\Models\User;
use App\Services\AuditLogService;
use App\Services\DeliveryQuoteService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class AdminWorkspaceController extends Controller
{
    public function overview(DeliveryQuoteService $quotes): JsonResponse
    {
        $active = Delivery::whereNotIn('status', Delivery::TERMINAL);
        $workloads = (clone $active)->whereNotNull('rider_user_id')->selectRaw('rider_user_id, COUNT(*) as total')->groupBy('rider_user_id')->pluck('total', 'rider_user_id');
        $freshAfter = now()->subSeconds((int) config('dispatch.gps_fresh_seconds', 120));
        $fleet = User::whereHas('roles', fn ($query) => $query->where('slug', 'rider'))
            ->with('riderProfile')->orderBy('name')->get(['id', 'name', 'is_active'])
            ->map(function ($user) use ($workloads, $freshAfter) {
                $profile = $user->riderProfile;
                $online = $user->is_active && $profile?->is_online;
                $fresh = $online && $profile?->located_at?->gte($freshAfter)
                    && $profile->latitude !== null && $profile->longitude !== null
                    && $profile->accuracy_meters !== null && $profile->accuracy_meters <= 500;
                $jobs = (int) ($workloads[$user->id] ?? 0);
                return ['id' => $user->id, 'name' => $user->name, 'is_active' => $user->is_active,
                    'status' => ! $online ? 'offline' : (! $fresh ? 'location_stale' : ($jobs > 0 ? 'on_delivery' : 'available')),
                    'active_deliveries' => $jobs, 'vehicle_type' => $profile?->vehicle_type,
                    'latitude' => $fresh ? (float) $profile->latitude : null,
                    'longitude' => $fresh ? (float) $profile->longitude : null,
                    'located_at' => $profile?->located_at?->toIso8601String()];
            });
        $timezone = RestaurantSetting::where('key', 'business_profile')->value('value')['timezone'] ?? config('restaurant.timezone', 'Asia/Manila');
        $dayStart = now($timezone)->startOfDay()->utc();
        $completed = Delivery::where('delivered_at', '>=', $dayStart)->whereNotNull('picked_up_at')->get(['picked_up_at', 'delivered_at']);
        $deliveries = (clone $active)->with(['order:id,order_number,customer_name_snapshot,delivery_address,total', 'rider:id,name'])
            ->orderByRaw('estimated_arrival_at IS NULL')->orderBy('estimated_arrival_at')->limit(100)
            ->get(['id', 'order_id', 'rider_user_id', 'status', 'estimated_arrival_at', 'created_at']);
        return response()->json(['data' => [
            'metrics' => [
                'active_orders' => Order::whereNotIn('status', ['completed', 'cancelled'])->count(),
                'available_riders' => $fleet->where('status', 'available')->count(),
                'average_minutes' => $completed->isEmpty() ? null : round($completed->avg(fn ($delivery) => $delivery->picked_up_at->diffInMinutes($delivery->delivered_at)), 1),
                'delayed_deliveries' => (clone $active)->where('estimated_arrival_at', '<', now())->count(),
                'active_deliveries' => (clone $active)->count(),
                'awaiting_rider' => (clone $active)->whereNull('rider_user_id')->count(),
                'delivered_today' => Delivery::where('delivered_at', '>=', $dayStart)->count(),
            ],
            'fleet' => $fleet, 'deliveries' => $deliveries,
            'location' => $quotes->location(), 'radius_km' => $quotes->policy()['radius_km'] ?? 8,
            'server_time' => now()->toIso8601String(),
        ]])->header('Cache-Control', 'private, no-store');
    }

    public function saveOutlet(Request $request, AuditLogService $audit): JsonResponse
    {
        $data = $request->validate([
            'location' => ['required', 'array:name,address,latitude,longitude,phone,contact_email,opening_hours,is_active'],
            'location.name' => ['required', 'string', 'max:120'],
            'location.address' => ['required', 'string', 'max:500'],
            'location.latitude' => ['required', 'numeric', 'between:-90,90'],
            'location.longitude' => ['required', 'numeric', 'between:-180,180'],
            'location.phone' => ['nullable', 'string', 'max:32'],
            'location.contact_email' => ['nullable', 'email', 'max:254'],
            'location.is_active' => ['required', 'boolean'],
            'location.opening_hours' => ['required', 'array:monday,tuesday,wednesday,thursday,friday,saturday,sunday'],
            'location.opening_hours.*' => ['array:open,close,closed'],
            'location.opening_hours.*.open' => ['nullable', 'date_format:H:i'],
            'location.opening_hours.*.close' => ['nullable', 'date_format:H:i'],
            'location.opening_hours.*.closed' => ['required', 'boolean'],
            'radius_km' => ['required', 'numeric', 'gt:0', 'max:100'],
        ]);
        foreach ($data['location']['opening_hours'] as $day => $hours) {
            if (! $hours['closed'] && (empty($hours['open']) !== empty($hours['close']))) {
                throw ValidationException::withMessages(["location.opening_hours.$day" => 'Set both opening and closing times, or leave both blank.']);
            }
        }
        DB::transaction(function () use ($data, $audit, $request) {
            $location = RestaurantSetting::firstOrCreate(['key' => 'restaurant_location'], ['value' => []]);
            $policy = RestaurantSetting::firstOrCreate(['key' => 'delivery_policy'], ['value' => ['minimum_order' => 0, 'base_fee' => 40, 'per_km_fee' => 5]]);
            $location = RestaurantSetting::whereKey($location->id)->lockForUpdate()->firstOrFail();
            $policy = RestaurantSetting::whereKey($policy->id)->lockForUpdate()->firstOrFail();
            $location->update(['value' => array_replace($location->value ?? [], $data['location'])]);
            $policy->update(['value' => array_replace($policy->value ?? [], ['radius_km' => $data['radius_km']])]);
            $audit->record($request->user(), 'restaurant.outlet_updated', null, ['radius_km' => $data['radius_km'], 'is_active' => $data['location']['is_active']], $request);
        });
        return response()->json(['data' => $data]);
    }
}
