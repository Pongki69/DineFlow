<?php

namespace App\Services;

use App\Events\DeliveryTrackingUpdated;
use App\Models\Delivery;
use App\Models\DeliveryAssignment;
use App\Models\DeliveryLocationUpdate;
use App\Models\DeliveryStatusHistory;
use App\Models\Order;
use App\Models\RiderProfile;
use App\Models\User;
use App\Notifications\DeliveryProgressNotification;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\ValidationException;

class DeliveryService
{
    public function __construct(private MapProviderService $maps) {}

    public function riderDeliveries(User $rider)
    {
        $this->assertRider($rider);
        return Delivery::with(['order.items.addons','statusHistory'])->where('rider_user_id',$rider->id)->latest()->limit(50)->get()->map(fn (Delivery $d) => $this->riderPayload($d));
    }

    public function managerDeliveries()
    {
        return Delivery::with(['order.items.addons','rider:id,name','statusHistory','locationUpdates'=>fn($q)=>$q->latest('recorded_at')->limit(1)])
            ->whereIn('status',['pending_assignment','assigned','accepted','arrived_at_restaurant','picked_up','in_transit','delivered','failed','cancelled'])->latest()->limit(200)->get();
    }

    public function availableRiders()
    {
        return RiderProfile::with('user:id,name,email')->where('is_available',true)->whereHas('user',fn($q)=>$q->where('is_active',true)->whereHas('roles',fn($r)=>$r->where('slug','rider')))->orderBy('id')->get()->map(fn($p)=>['id'=>$p->user_id,'name'=>$p->user->name,'email'=>$p->user->email,'phone'=>$p->phone,'vehicle_type'=>$p->vehicle_type,'vehicle_plate'=>$p->vehicle_plate]);
    }

    public function assign(Delivery $delivery, User $manager, int $riderId, ?string $reason = null): Delivery
    {
        $result = DB::transaction(function () use ($delivery,$manager,$riderId,$reason): Delivery {
            $locked=Delivery::whereKey($delivery->id)->lockForUpdate()->firstOrFail();
            if (in_array($locked->status,Delivery::TERMINAL,true) || in_array($locked->status,['picked_up','in_transit'],true)) throw ValidationException::withMessages(['delivery'=>'This delivery can no longer be assigned or reassigned.']);
            $rider=User::whereKey($riderId)->where('is_active',true)->whereHas('roles',fn($q)=>$q->where('slug','rider'))->lockForUpdate()->first();
            $profile=$rider?RiderProfile::where('user_id',$rider->id)->lockForUpdate()->first():null;
            if (!$rider || !$profile) throw ValidationException::withMessages(['rider_id'=>'Select an active rider account.']);
            if ($locked->rider_user_id === $rider->id && in_array($locked->status,['assigned','accepted','arrived_at_restaurant'],true)) throw ValidationException::withMessages(['rider_id'=>'This rider is already assigned to this delivery.']);
            $busy=Delivery::where('rider_user_id',$rider->id)->whereNotIn('status',Delivery::TERMINAL)->where('id','!=',$locked->id)->exists();
            if ($busy) throw ValidationException::withMessages(['rider_id'=>'This rider already has an active delivery.']);
            if (!$profile->is_available && $locked->rider_user_id !== $rider->id) throw ValidationException::withMessages(['rider_id'=>'This rider is currently unavailable.']);
            $from=$locked->status;
            if ($locked->rider_user_id) {
                DeliveryAssignment::where('delivery_id',$locked->id)->where('rider_user_id',$locked->rider_user_id)->whereIn('status',['assigned','accepted'])->latest()->first()?->update(['status'=>'reassigned','reason'=>$reason,'ended_at'=>now()]);
                RiderProfile::where('user_id',$locked->rider_user_id)->update(['is_available'=>true]);
            }
            $locked->update(['rider_user_id'=>$rider->id,'status'=>'assigned','assigned_at'=>now(),'accepted_at'=>null,'failure_reason'=>null]);
            $locked->assignments()->create(['rider_user_id'=>$rider->id,'assigned_by'=>$manager->id,'status'=>'assigned','reason'=>$reason]);
            $locked->statusHistory()->create(['actor_id'=>$manager->id,'from_status'=>$from,'to_status'=>'assigned','reason'=>$reason]);
            return $locked->fresh(['order','rider']);
        },3);
        app(AuditLogService::class)->record($manager,'delivery.assigned',$result,['rider_id'=>$riderId,'reason'=>$reason],request());
        app(RestaurantNotificationService::class)->send($result->rider, 'delivery.assigned', 'Delivery assigned', 'A delivery has been assigned to you.', ['delivery_id' => $result->id, 'order_number' => $result->order?->order_number]);
        $this->notifyCustomer($result);
        $this->broadcast($result);
        return $result;
    }

    public function respond(Delivery $delivery, User $rider, string $response, ?string $reason = null): Delivery
    {
        $this->assertRider($rider);
        $result=DB::transaction(function()use($delivery,$rider,$response,$reason):Delivery{
            $locked=Delivery::whereKey($delivery->id)->lockForUpdate()->firstOrFail();
            if($locked->rider_user_id!==$rider->id || $locked->status!=='assigned') throw new AuthorizationException('This assignment is no longer available to you.');
            $assignment=$locked->assignments()->where('rider_user_id',$rider->id)->where('status','assigned')->latest()->lockForUpdate()->firstOrFail();
            $from=$locked->status;
            if($response==='accept'){$locked->update(['status'=>'accepted','accepted_at'=>now()]);$assignment->update(['status'=>'accepted','accepted_at'=>now()]);RiderProfile::where('user_id',$rider->id)->update(['is_available'=>false]);$to='accepted';}
            else{$assignment->update(['status'=>'rejected','reason'=>$reason,'rejected_at'=>now(),'ended_at'=>now()]);$locked->update(['status'=>'pending_assignment','rider_user_id'=>null,'assigned_at'=>null]);$to='pending_assignment';}
            $locked->statusHistory()->create(['actor_id'=>$rider->id,'from_status'=>$from,'to_status'=>$to,'reason'=>$reason]);
            return $locked->fresh(['order','rider']);
        },3);
        app(AuditLogService::class)->record($rider,'delivery.assignment_'.$response,$result,['reason'=>$reason],request());
        if($response==='accept')$this->notifyCustomer($result);
        $this->broadcast($result);
        return $result;
    }

    public function transition(Delivery $delivery, User $actor, string $to, ?string $reason = null): Delivery
    {
        $isManager=$actor->hasPermission('deliveries.manage');
        if(!$isManager)$this->assertRider($actor);
        if($to==='cancelled'&&!$isManager)throw new AuthorizationException('Only a manager can cancel a delivery.');
        if(in_array($to,['failed','cancelled'],true)&&blank($reason))throw ValidationException::withMessages(['reason'=>'A reason is required.']);
        $result=DB::transaction(function()use($delivery,$actor,$to,$reason,$isManager):Delivery{
            $locked=Delivery::whereKey($delivery->id)->lockForUpdate()->firstOrFail();
            if(!$isManager&&$locked->rider_user_id!==$actor->id)throw new AuthorizationException('This delivery is not assigned to your rider account.');
            $allowed=[
                'pending_assignment'=>['cancelled'],
                'assigned'=>['cancelled'],
                'accepted'=>['arrived_at_restaurant','failed','cancelled'],
                'arrived_at_restaurant'=>['picked_up','failed','cancelled'],
                'picked_up'=>['in_transit','failed','cancelled'],
                'in_transit'=>['delivered','failed','cancelled'],
            ];
            if(!in_array($to,$allowed[$locked->status]??[],true))throw ValidationException::withMessages(['status'=>"Delivery cannot move from {$locked->status} to {$to}."]);
            if($to==='picked_up'&&$locked->order()->value('status')!=='ready_to_serve')throw ValidationException::withMessages(['status'=>'The kitchen must mark the order ready before pickup.']);
            $from=$locked->status;$updates=['status'=>$to];
            if($to==='picked_up')$updates['picked_up_at']=now();
            if($to==='delivered'){$updates['delivered_at']=now();$updates['estimated_arrival_at']=null;$updates['route_geometry']=null;}
            if($to==='failed'){$updates['failure_reason']=$reason;$updates['estimated_arrival_at']=null;$updates['route_geometry']=null;}
            if($to==='cancelled'){$updates['cancelled_at']=now();$updates['failure_reason']=$reason;$updates['estimated_arrival_at']=null;$updates['route_geometry']=null;}
            $locked->update($updates);
            if(in_array($to,Delivery::TERMINAL,true)){
                DeliveryAssignment::where('delivery_id',$locked->id)->where('rider_user_id',$locked->rider_user_id)->whereIn('status',['assigned','accepted'])->latest()->first()?->update(['status'=>$to,'reason'=>$reason,'ended_at'=>now()]);
                if($locked->rider_user_id)RiderProfile::where('user_id',$locked->rider_user_id)->update(['is_available'=>true]);
            }
            $locked->statusHistory()->create(['actor_id'=>$actor->id,'from_status'=>$from,'to_status'=>$to,'reason'=>$reason]);
            if($to==='delivered'){
                $order=Order::whereKey($locked->order_id)->lockForUpdate()->firstOrFail();
                if($order->status==='ready_to_serve'){$order->update(['status'=>'completed','completed_at'=>now()]);$order->statusHistory()->create(['actor_id'=>$actor->id,'from_status'=>'ready_to_serve','to_status'=>'completed','note'=>'Completed on delivery.']);}
            }
            return $locked->fresh(['order','rider']);
        },3);
        app(AuditLogService::class)->record($actor,'delivery.status_changed',$result,['status'=>$to,'reason'=>$reason],request());
        $this->notifyCustomer($result);$this->broadcast($result);
        return $result;
    }

    public function location(Delivery $delivery, User $rider, array $data): array
    {
        $this->assertRider($rider);
        if(isset($data['accuracy_meters'])&&$data['accuracy_meters']>500)throw ValidationException::withMessages(['accuracy_meters'=>'GPS accuracy is too low to share a reliable position.']);
        [$locked,$point]=DB::transaction(function()use($delivery,$rider,$data){
            $locked=Delivery::whereKey($delivery->id)->lockForUpdate()->firstOrFail();
            if($locked->rider_user_id!==$rider->id||!in_array($locked->status,['picked_up','in_transit'],true))throw new AuthorizationException('Location sharing is only available for your active picked-up delivery.');
            $last=$locked->locationUpdates()->latest('recorded_at')->first();
            if($last&&$last->recorded_at->gt(now()->subSeconds(5)))throw ValidationException::withMessages(['location'=>'Please wait a few seconds before sending another location.']);
            $point=$locked->locationUpdates()->create(['rider_user_id'=>$rider->id,'latitude'=>$data['latitude'],'longitude'=>$data['longitude'],'accuracy_meters'=>$data['accuracy_meters']??null,'speed_mps'=>$data['speed_mps']??null,'recorded_at'=>now()]);
            return [$locked,$point];
        },3);
        $route=[];
        if(!$locked->last_routed_at||$locked->last_routed_at->lt(now()->subSeconds(30))){
            $order=$locked->order;
            if($order->delivery_latitude!==null&&$order->delivery_longitude!==null){
                try{$route=$this->maps->route((float)$point->latitude,(float)$point->longitude,(float)$order->delivery_latitude,(float)$order->delivery_longitude,true);DB::transaction(function()use($locked,$rider,$route){$current=Delivery::whereKey($locked->id)->lockForUpdate()->firstOrFail();if($current->rider_user_id===$rider->id&&in_array($current->status,['picked_up','in_transit'],true))$current->update(['estimated_arrival_at'=>now()->addMinutes($route['duration_minutes']),'last_routed_at'=>now(),'route_geometry'=>$route['geometry']]);},3);}
                catch(\Throwable $exception){report($exception);}
            }
        }
        $locked=$locked->fresh();
        $payload=['location'=>['latitude'=>(float)$point->latitude,'longitude'=>(float)$point->longitude,'recorded_at'=>$point->recorded_at->toIso8601String(),'accuracy_meters'=>$point->accuracy_meters], 'eta'=>$locked->estimated_arrival_at?->toIso8601String(),'route'=>$locked->route_geometry];
        try { broadcast(new DeliveryTrackingUpdated($locked,$payload)); } catch (\Throwable $exception) { report($exception); }
        return $payload;
    }

    public function tracking(Delivery $delivery): array
    {
        $delivery->loadMissing('order','statusHistory');
        $last=$delivery->locationUpdates()->latest('recorded_at')->first();
        $payload=['delivery_id'=>$delivery->id,'order_number'=>$delivery->order->order_number,'status'=>$delivery->status,'failure_reason'=>$delivery->failure_reason,
            'destination'=>['address'=>$delivery->order->delivery_address,'latitude'=>$delivery->order->delivery_latitude,'longitude'=>$delivery->order->delivery_longitude,'instructions'=>$delivery->order->delivery_instructions],
            'rider'=>$delivery->rider?->only('id','name'),'location'=>$last?['latitude'=>(float)$last->latitude,'longitude'=>(float)$last->longitude,'recorded_at'=>$last->recorded_at->toIso8601String(),'accuracy_meters'=>$last->accuracy_meters]:null,
            'last_location_at'=>$last?->recorded_at?->toIso8601String(),'tracking_stale'=>$last===null||$last->recorded_at->lt(now()->subSeconds(60)),
            'map_provider'=>config('services.maps.provider'),
            'eta'=>$delivery->estimated_arrival_at?->toIso8601String(),'route'=>$delivery->route_geometry,
            'history'=>$delivery->statusHistory->map(fn($h)=>['status'=>$h->to_status,'at'=>$h->created_at?->toIso8601String()])->values()];
        return $payload;
    }

    private function riderPayload(Delivery $delivery): array
    {
        $order=$delivery->order;
        return ['id'=>$delivery->id,'status'=>$delivery->status,'order'=>['id'=>$order->id,'order_number'=>$order->order_number,'status'=>$order->status,'total'=>$order->total,'items'=>$order->items,'pickup'=>app(DeliveryQuoteService::class)->location(),'destination'=>['address'=>$order->delivery_address,'latitude'=>$order->delivery_latitude,'longitude'=>$order->delivery_longitude,'recipient_name'=>$order->delivery_recipient_name,'phone'=>$order->delivery_phone,'instructions'=>$order->delivery_instructions]],'history'=>$delivery->statusHistory];
    }

    private function assertRider(User $user): void
    {
        if(!$user->hasRole('rider')||!$user->hasPermission('deliveries.assigned'))throw new AuthorizationException('A delivery rider account is required.');
    }
    private function notifyCustomer(Delivery $delivery): void
    {
        $business = \App\Models\RestaurantSetting::where('key', 'business_profile')->value('value') ?? [];
        if (($business['notifications_enabled'] ?? true) === false) return;
        $customer=$delivery->order()->with('customer')->first()?->customer;
        if($customer)try { Notification::send($customer,new DeliveryProgressNotification($delivery->loadMissing('order'))); } catch (\Throwable $exception) { report($exception); }
    }
    private function broadcast(Delivery $delivery): void
    {
        try { broadcast(new DeliveryTrackingUpdated($delivery)); } catch (\Throwable $exception) { report($exception); }
    }
}
