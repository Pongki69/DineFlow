<?php

namespace App\Http\Controllers\Api\V1;

use App\Events\DeliveryTrackingUpdated;
use App\Http\Controllers\Controller;
use App\Models\Delivery;
use App\Models\DispatchOffer;
use App\Models\RiderProfile;
use App\Services\DeliveryService;
use App\Services\DispatchGeo;
use App\Services\DispatchGuard;
use App\Services\DispatchService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class DispatchController extends Controller
{
    private function rider(Request $request): void
    {
        abort_unless($request->user()->hasRole('rider') && $request->user()->hasPermission('deliveries.assigned'), 403);
    }

    public function index(Request $request)
    {
        $this->rider($request);
        $offers = DispatchOffer::with('delivery.order')->where('rider_user_id', $request->user()->id)->where('status', 'offered')->where('expires_at', '>', now())->get();

        return response()->json(['profile' => RiderProfile::firstOrCreate(['user_id' => $request->user()->id]), 'enabled' => config('dispatch.enabled'), 'server_time' => now()->toIso8601String(), 'offers' => $offers->map(fn ($offer) => [
            'id' => $offer->id, 'delivery_id' => $offer->delivery_id, 'expires_at' => $offer->expires_at->toIso8601String(),
            'order_number' => $offer->delivery->order->order_number, 'pickup' => $offer->delivery->pickup_address,
            'destination' => $offer->delivery->order->delivery_address, 'eta_minutes' => $offer->ranking['eta_minutes'],
            'batched' => (bool) ($offer->ranking['batch_delivery_id'] ?? null),
        ])]);
    }

    public function presence(Request $request, DispatchService $dispatch)
    {
        $this->rider($request);
        $data = $request->validate(['is_online' => ['required', 'boolean'], 'start' => ['sometimes', 'boolean'], 'presence_token' => ['nullable', 'uuid'], 'latitude' => ['required_if:is_online,true', 'nullable', 'numeric', 'between:-90,90'], 'longitude' => ['required_if:is_online,true', 'nullable', 'numeric', 'between:-180,180'], 'accuracy_meters' => ['required_if:is_online,true', 'nullable', 'numeric', 'min:0', 'max:500']]);
        $profile = DB::transaction(function () use ($request, $data, $dispatch) {
            DispatchGuard::lock();
            $profile = RiderProfile::firstOrCreate(['user_id' => $request->user()->id]);
            if ($data['is_online'] && ! in_array(strtolower(trim($profile->vehicle_type ?? '')), ['bicycle', 'motorcycle', 'car'], true)) {
                throw ValidationException::withMessages(['vehicle_type' => 'Save a bicycle, motorcycle or car in your rider profile before going online.']);
            }
            $updates = ['is_online' => $data['is_online']];
            if ($data['is_online']) {
                if (! ($data['start'] ?? false) && (! $profile->is_online || ! $profile->presence_token || ! hash_equals($profile->presence_token, $data['presence_token'] ?? ''))) {
                    throw ValidationException::withMessages(['presence' => 'Go online again on this device to resume location updates.']);
                }
                $updates += ['presence_token' => ($data['start'] ?? false) ? (string) Str::uuid() : $profile->presence_token, 'latitude' => $data['latitude'], 'longitude' => $data['longitude'], 'accuracy_meters' => $data['accuracy_meters'], 'located_at' => now(), 'geohash' => DispatchGeo::hash($data['latitude'], $data['longitude'])];
            } else {
                foreach (DispatchOffer::where('active_rider_user_id', $request->user()->id)->get() as $offer) {
                    $dispatch->withdraw($offer->delivery_id);
                }
                $updates += ['presence_token' => null, 'latitude' => null, 'longitude' => null, 'accuracy_meters' => null, 'located_at' => null, 'geohash' => null];
            }
            $profile->update($updates);
            // Delivery samples are persisted after the presence transaction below.
            // The global assignment guard never covers image or map-provider work.
            DB::afterCommit(function () use ($request, $data) {
                foreach (Delivery::where('rider_user_id', $request->user()->id)->whereIn('status', ['accepted', 'arrived_at_restaurant', 'picked_up', 'in_transit'])->get() as $delivery) {
                    try {
                        if ($data['is_online'] && in_array($delivery->status, ['picked_up', 'in_transit'], true)) {
                            app(DeliveryService::class)->location($delivery, $request->user(), $data);
                        } else {
                            broadcast(new DeliveryTrackingUpdated($delivery));
                        }
                    } catch (\Throwable $exception) {
                        report($exception);
                    }
                }
            });

            return $profile;
        }, 3);

        return response()->json(['data' => $profile, 'presence_token' => $profile->presence_token]);
    }

    public function respond(Request $request, DispatchOffer $offer, DispatchService $dispatch)
    {
        $this->rider($request);
        $data = $request->validate(['response' => ['required', 'in:accept,reject']]);

        return response()->json(['data' => $dispatch->respond($offer, $request->user(), $data['response'])]);
    }

    public function retry(Request $request, Delivery $delivery, DispatchService $dispatch)
    {
        return response()->json(['data' => $dispatch->retry($delivery, $request->user())]);
    }
}
