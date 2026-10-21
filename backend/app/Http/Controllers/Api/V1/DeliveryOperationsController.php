<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Delivery;
use App\Models\RiderProfile;
use App\Services\DeliveryService;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DeliveryOperationsController extends Controller
{
    public function riderIndex(Request $request, DeliveryService $service): JsonResponse
    {
        abort_unless($request->user()->hasRole('rider') && $request->user()->hasPermission('deliveries.assigned'),403);
        return response()->json(['data'=>$service->riderDeliveries($request->user())]);
    }

    public function respond(Request $request, Delivery $delivery, DeliveryService $service, string $response): JsonResponse
    {
        $data=$request->validate(['reason'=>['nullable','string','max:1000']]);
        return response()->json(['data'=>$service->respond($delivery,$request->user(),$response,$data['reason']??null)]);
    }

    public function status(Request $request, Delivery $delivery, DeliveryService $service): JsonResponse
    {
        $data=$request->validate(['status'=>['required','in:arrived_at_restaurant,picked_up,in_transit,delivered,failed'],'reason'=>['nullable','string','max:1000']]);
        return response()->json(['data'=>$service->transition($delivery,$request->user(),$data['status'],$data['reason']??null)]);
    }

    public function location(Request $request, Delivery $delivery, DeliveryService $service): JsonResponse
    {
        $data=$request->validate(['latitude'=>['required','numeric','between:-90,90'],'longitude'=>['required','numeric','between:-180,180'],'accuracy_meters'=>['nullable','numeric','min:0','max:10000'],'speed_mps'=>['nullable','numeric','min:0','max:80']]);
        return response()->json(['data'=>$service->location($delivery,$request->user(),$data)]);
    }

    public function tracking(Request $request, Delivery $delivery, DeliveryService $service): JsonResponse
    {
        abort_unless($delivery->order()->where('customer_id',$request->user()->id)->where('order_type','delivery')->exists(),404);
        return response()->json(['data'=>$service->tracking($delivery)]);
    }

    public function managerIndex(DeliveryService $service): JsonResponse
    {
        return response()->json(['data'=>$service->managerDeliveries(),'riders'=>$service->availableRiders()]);
    }

    public function assign(Request $request, Delivery $delivery, DeliveryService $service): JsonResponse
    {
        $data=$request->validate(['rider_id'=>['required','integer','exists:users,id'],'reason'=>['nullable','string','max:1000']]);
        return response()->json(['data'=>$service->assign($delivery,$request->user(),(int)$data['rider_id'],$data['reason']??null)]);
    }

    public function cancel(Request $request, Delivery $delivery, DeliveryService $service): JsonResponse
    {
        $data=$request->validate(['reason'=>['required','string','min:3','max:1000']]);
        return response()->json(['data'=>$service->transition($delivery,$request->user(),'cancelled',$data['reason'])]);
    }

    public function updateRiderProfile(Request $request, AuditLogService $audit): JsonResponse
    {
        abort_unless($request->user()->hasRole('rider') && $request->user()->hasPermission('deliveries.assigned'),403);
        $data=$request->validate(['phone'=>['nullable','string','max:32'],'vehicle_type'=>['nullable','string','max:40'],'vehicle_plate'=>['nullable','string','max:24']]);
        $profile=RiderProfile::updateOrCreate(['user_id'=>$request->user()->id],$data);
        $audit->record($request->user(),'rider.profile_updated',$profile,$data,$request);
        return response()->json(['data'=>$profile]);
    }

    public function riderProfile(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasRole('rider') && $request->user()->hasPermission('deliveries.assigned'),403);
        return response()->json(['data'=>RiderProfile::firstOrCreate(['user_id'=>$request->user()->id])]);
    }

    public function notifications(Request $request): JsonResponse
    {
        $notifications = $request->user()->notifications()->latest()->limit(30)->get();
        return response()->json(['data'=>$notifications, 'unread_count'=>$request->user()->unreadNotifications()->count()]);
    }

    public function readNotification(Request $request, string $notification): JsonResponse
    {
        $record=$request->user()->notifications()->whereKey($notification)->firstOrFail();
        $record->markAsRead();
        return response()->json(['data'=>['read_at'=>$record->read_at]]);
    }
}
