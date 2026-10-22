<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Delivery;
use App\Models\DiningSession;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Payment;
use App\Models\Reservation;
use App\Models\RestaurantSetting;
use App\Models\RestaurantTable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\StreamedResponse;

class OperationsController extends Controller
{
    public function dashboard(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasPermission('dashboard.view'), 403);
        [$from, $to] = $this->period($request);
        $user = $request->user();
        $now = Carbon::now($this->timezone());
        $data = ['range' => ['from' => $from->toDateString(), 'to' => $to->toDateString()]];

        if ($user->hasPermission('orders.view') || $user->hasPermission('orders.manage')) {
            $orders = Order::whereBetween('created_at', [$from, $to]);
            $data['orders'] = [
                'count' => (clone $orders)->count(),
                'active' => (clone $orders)->whereIn('status', ['pending', 'confirmed', 'preparing', 'ready_to_serve', 'served'])->count(),
                'cancelled' => (clone $orders)->where('status', 'cancelled')->count(),
                'revenue' => (clone $orders)->whereNotIn('status', ['cancelled'])->sum('total'),
                'pending' => (clone $orders)->where('status', 'pending')->count(),
            ];
        }
        if ($user->hasPermission('reservations.manage')) {
            $data['reservations'] = [
                'upcoming' => Reservation::with(['table:id,table_number', 'tables:id,table_number'])->whereIn('status', ['pending', 'confirmed', 'checked_in', 'seated'])->whereBetween('starts_at', [$now, $now->copy()->addDays(7)])->orderBy('starts_at')->limit(8)->get(['id','reference','table_id','guest_name','guest_count','starts_at','status']),
                'cancelled' => Reservation::whereBetween('starts_at', [$from, $to])->where('status', 'cancelled')->count(),
                'no_show' => Reservation::whereBetween('starts_at', [$from, $to])->where('status', 'no_show')->count(),
                'today' => Reservation::whereBetween('starts_at', [$now->copy()->startOfDay(), $now->copy()->endOfDay()])->whereNotIn('status', ['cancelled', 'no_show'])->count(),
            ];
        }
        if ($user->hasPermission('service.tables.view') || $user->hasPermission('tables.occupancy.manage')) {
            $data['tables'] = ['total' => RestaurantTable::count(), 'active' => RestaurantTable::where('is_active', true)->count(), 'statuses' => RestaurantTable::where('is_active', true)->select('operational_status', DB::raw('count(*) as total'))->groupBy('operational_status')->pluck('total', 'operational_status')];
            $data['open_sessions'] = DiningSession::with('table:id,table_number')->where('status', 'open')->latest('opened_at')->limit(8)->get(['id','table_id','guest_count','opened_at']);
        }
        if ($user->hasPermission('deliveries.manage')) {
            $data['deliveries'] = ['active' => Delivery::whereNotIn('status', Delivery::TERMINAL)->count(), 'unassigned' => Delivery::where('status', 'pending_assignment')->count(), 'delivered' => Delivery::whereBetween('delivered_at', [$from, $to])->count(), 'failed' => Delivery::whereBetween('updated_at', [$from, $to])->where('status', 'failed')->count()];
        }
        if ($user->hasPermission('payments.manage') || $user->hasPermission('payments.refund')) {
            $data['recent_payments'] = Payment::with(['order:id,order_number','reservation:id,reference','receivedBy:id,name'])->latest()->limit(8)->get(['id','order_id','reservation_id','dining_session_id','purpose','method','status','amount','currency','reference_number','received_by','paid_at','created_at']);
            $data['payments'] = ['paid' => Payment::where('status', 'paid')->whereBetween('paid_at', [$from, $to])->sum('amount'), 'refunded' => Payment::where('status', 'refunded')->whereBetween('refunded_at', [$from, $to])->sum('amount'), 'pending' => Payment::where('status', 'pending')->count()];
        }
        if ($user->hasPermission('reports.operations') || $user->hasPermission('reports.financial') || $user->hasPermission('reports.daily_transactions')) {
            $data['popular_items'] = OrderItem::whereHas('order', fn ($q) => $q->whereNotIn('status', ['cancelled'])->whereBetween('created_at', [$from, $to]))
                ->select('item_name_snapshot', DB::raw('sum(quantity) as quantity'), DB::raw('sum(line_total) as sales'))->groupBy('item_name_snapshot')->orderByDesc('quantity')->limit(5)->get();
        }
        return response()->json(['data' => $data]);
    }

    public function report(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasPermission('reports.operations') || $request->user()->hasPermission('reports.financial') || $request->user()->hasPermission('reports.daily_transactions'), 403);
        [$from, $to] = $this->period($request);
        $user = $request->user();
        $data = ['range' => ['from' => $from->toDateString(), 'to' => $to->toDateString()]];
        if ($user->hasPermission('reports.operations') || $user->hasPermission('reports.financial')) {
            $orders = Order::whereBetween('created_at', [$from, $to])->whereNotIn('status', ['cancelled']);
            $data['sales'] = ['orders' => (clone $orders)->count(), 'gross' => (clone $orders)->sum('total'), 'discounts' => (clone $orders)->sum('item_discount_total'), 'tax' => (clone $orders)->sum('tax'), 'service_charges' => (clone $orders)->sum('service_charge'), 'delivery_fees' => (clone $orders)->sum('delivery_fee')];
            $dailySales = [];
            (clone $orders)->select(['id','created_at','total'])->orderBy('id')->chunk(1000, function ($rows) use (&$dailySales): void {
                foreach ($rows as $order) {
                    $date = $order->created_at->timezone($this->timezone())->toDateString();
                    $dailySales[$date] ??= ['date' => $date, 'orders' => 0, 'gross' => 0.0];
                    $dailySales[$date]['orders']++;
                    $dailySales[$date]['gross'] += (float) $order->total;
                }
            });
            ksort($dailySales);
            $data['sales_by_day'] = array_values($dailySales);
            $data['orders_by_type'] = (clone $orders)->select('order_type', DB::raw('count(*) as orders'), DB::raw('sum(total) as total'))->groupBy('order_type')->get();
            $data['orders_by_status'] = Order::whereBetween('created_at', [$from, $to])->select('status', DB::raw('count(*) as total'))->groupBy('status')->get();
            $data['popular_items'] = OrderItem::whereHas('order', fn ($q) => $q->whereNotIn('status', ['cancelled'])->whereBetween('created_at', [$from, $to]))->select('item_name_snapshot', DB::raw('sum(quantity) as quantity'), DB::raw('sum(line_total) as sales'))->groupBy('item_name_snapshot')->orderByDesc('quantity')->limit(10)->get();
            $data['reservations'] = ['total' => Reservation::whereBetween('starts_at', [$from, $to])->count(), 'cancelled' => Reservation::whereBetween('starts_at', [$from, $to])->where('status', 'cancelled')->count(), 'no_show' => Reservation::whereBetween('starts_at', [$from, $to])->where('status', 'no_show')->count(), 'completed' => Reservation::whereBetween('starts_at', [$from, $to])->where('status', 'completed')->count()];
            $data['deliveries'] = Delivery::whereHas('order', fn ($q) => $q->whereBetween('created_at', [$from, $to]))->select('status', DB::raw('count(*) as total'))->groupBy('status')->get();
            $delivered = Delivery::with(['order:id,created_at','rider:id,name'])->whereNotNull('delivered_at')->whereHas('order', fn ($q) => $q->whereBetween('created_at', [$from, $to]))->get();
            $measuredTrips = $delivered->filter(fn ($delivery) => $delivery->picked_up_at !== null);
            $data['delivery_performance'] = ['completed' => $delivered->count(), 'average_minutes' => $measuredTrips->isEmpty() ? null : round($measuredTrips->avg(fn ($delivery) => $delivery->picked_up_at->diffInMinutes($delivery->delivered_at)), 1), 'by_rider' => $delivered->groupBy(fn ($delivery) => $delivery->rider?->name ?? 'Unassigned')->map(fn ($rows,$rider) => ['rider'=>$rider,'delivered'=>$rows->count()])->values()];
            $data['table_occupancy'] = ['total_tables' => RestaurantTable::count(), 'active_tables' => RestaurantTable::where('is_active', true)->count(), 'current' => RestaurantTable::where('is_active', true)->select('operational_status', DB::raw('count(*) as total'))->groupBy('operational_status')->get()];
            $data['table_occupancy']['changes'] = DB::table('table_occupancy_history')->whereBetween('created_at', [$from,$to])->select('to_status', DB::raw('count(*) as total'))->groupBy('to_status')->get();
        }
        if ($user->hasPermission('reports.financial') || $user->hasPermission('reports.daily_transactions')) {
            $data['payments'] = ['by_status' => Payment::whereBetween('created_at', [$from, $to])->select('status', DB::raw('count(*) as count'), DB::raw('sum(amount) as amount'))->groupBy('status')->get(), 'by_method' => Payment::where('status', 'paid')->whereBetween('paid_at', [$from, $to])->select('method', DB::raw('count(*) as count'), DB::raw('sum(amount) as amount'))->groupBy('method')->get(), 'refunds' => Payment::where('status', 'refunded')->whereBetween('refunded_at', [$from, $to])->sum('amount')];
        }
        return response()->json(['data' => $data]);
    }

    public function cashierSummary(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasPermission('reports.daily_transactions'), 403);
        $to = Carbon::now($this->timezone()); $from = $to->copy()->startOfDay();
        return response()->json(['data' => ['date' => $from->toDateString(), 'paid_total' => Payment::where('status', 'paid')->whereBetween('paid_at', [$from, $to])->sum('amount'), 'refund_total' => Payment::where('status', 'refunded')->whereBetween('refunded_at', [$from, $to])->sum('amount'), 'payment_count' => Payment::where('status', 'paid')->whereBetween('paid_at', [$from, $to])->count(), 'recent' => Payment::with(['order:id,order_number','reservation:id,reference','receivedBy:id,name'])->whereBetween('created_at', [$from, $to])->latest()->limit(50)->get(['id','order_id','reservation_id','dining_session_id','method','status','amount','currency','reference_number','received_by','paid_at','created_at'])]]);
    }

    public function export(Request $request): StreamedResponse
    {
        $dataset = $request->validate(['dataset' => ['required', 'in:orders,payments,reservations,deliveries'], 'from' => ['nullable','date'], 'to' => ['nullable','date','after_or_equal:from']])['dataset'];
        $permissions = ['orders' => ['reports.operations','orders.manage'], 'payments' => ['reports.financial','reports.daily_transactions','payments.manage'], 'reservations' => ['reports.operations','reservations.manage'], 'deliveries' => ['reports.operations','deliveries.manage']];
        abort_unless(collect($permissions[$dataset])->contains(fn ($permission) => $request->user()->hasPermission($permission)), 403);
        $businessToday = Carbon::now($this->timezone())->toDateString();
        $from = Carbon::parse($request->input('from', $businessToday), $this->timezone())->startOfDay();
        $to = Carbon::parse($request->input('to', $businessToday), $this->timezone())->endOfDay();
        return response()->streamDownload(function () use ($dataset, $from, $to): void {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF");
            $sets = [
                'orders' => [Order::whereBetween('created_at', [$from,$to])->with('delivery:id,order_id,status')->orderBy('created_at'), ['Order','Created at','Type','Status','Customer','Total PHP','Payment status','Delivery status'], fn ($r) => [$r->order_number,$r->created_at?->toIso8601String(),$r->order_type,$r->status,$r->customer_name_snapshot,$r->total,$r->payments()->where('status','paid')->exists()?'paid':'unpaid',$r->delivery?->status]],
                'payments' => [Payment::with(['order:id,order_number','reservation:id,reference','receivedBy:id,name'])->whereBetween('created_at', [$from,$to])->orderBy('created_at'), ['Reference','Created at','Purpose','Method','Status','Amount','Currency','Order','Reservation','Received by'], fn ($r) => [$r->reference_number,$r->created_at?->toIso8601String(),$r->purpose,$r->method,$r->status,$r->amount,$r->currency,$r->order?->order_number,$r->reservation?->reference,$r->receivedBy?->name]],
                'reservations' => [Reservation::with(['table:id,table_number', 'tables:id,table_number'])->whereBetween('starts_at', [$from,$to])->orderBy('starts_at'), ['Reference','Starts at','Status','Guest','Guest count','Tables'], fn ($r) => [$r->reference,$r->starts_at?->toIso8601String(),$r->status,$r->guest_name,$r->guest_count,$r->tables->pluck('table_number')->join(', ') ?: $r->table?->table_number]],
                'deliveries' => [Delivery::with(['order:id,order_number,created_at','rider:id,name'])->whereHas('order', fn ($q) => $q->whereBetween('created_at', [$from,$to]))->orderBy('created_at'), ['Order','Created at','Status','Rider','Delivered at','Failure reason'], fn ($r) => [$r->order?->order_number,$r->created_at?->toIso8601String(),$r->status,$r->rider?->name,$r->delivered_at?->toIso8601String(),$r->failure_reason]],
            ];
            [$query,$headers,$row] = $sets[$dataset];
            fputcsv($out, $headers);
            $query->chunk(500, function ($records) use ($out,$row): void { foreach ($records as $record) { $cells = array_map(fn ($value) => is_string($value) && preg_match('/^[=+@\-\t\r]/', $value) ? "'".$value : $value, $row($record)); fputcsv($out, $cells); } });
            fclose($out);
        }, 'dineflow-'.$dataset.'-'.$from->toDateString().'-to-'.$to->toDateString().'.csv', ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    public function settings(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasPermission('settings.manage'), 403);
        if ($request->isMethod('get')) {
            $settings = RestaurantSetting::whereIn('key', ['business_profile','tax_percent','service_charge_percent'])->pluck('value','key');
            return response()->json(['data' => ['business_profile' => $settings['business_profile'] ?? ['restaurant_name'=>'DineFlow','timezone'=>'Asia/Manila','brand_color'=>'#2e5a43','notifications_enabled'=>true], 'tax_percent' => (float) ($settings['tax_percent']['rate'] ?? 0), 'service_charge_percent' => (float) ($settings['service_charge_percent']['rate'] ?? 0)]]);
        }
        $data = $request->validate(['restaurant_name'=>['required','string','max:120'],'timezone'=>['required','timezone'],'brand_color'=>['required','regex:/^#[0-9a-fA-F]{6}$/'],'notifications_enabled'=>['required','boolean'],'tax_percent'=>['required','numeric','min:0','max:100'],'service_charge_percent'=>['required','numeric','min:0','max:100']]);
        RestaurantSetting::updateOrCreate(['key'=>'business_profile'],['value'=>array_intersect_key($data,array_flip(['restaurant_name','timezone','brand_color','notifications_enabled']))]);
        RestaurantSetting::updateOrCreate(['key'=>'tax_percent'],['value'=>['rate'=>(float)$data['tax_percent']]]);
        RestaurantSetting::updateOrCreate(['key'=>'service_charge_percent'],['value'=>['rate'=>(float)$data['service_charge_percent']]]);
        app(\App\Services\AuditLogService::class)->record($request->user(),'business.settings_updated',null,['keys'=>['business_profile','tax_percent','service_charge_percent']],$request);
        return response()->json(['data'=>['business_profile'=>array_intersect_key($data,array_flip(['restaurant_name','timezone','brand_color','notifications_enabled'])),'tax_percent'=>(float)$data['tax_percent'],'service_charge_percent'=>(float)$data['service_charge_percent']]]);
    }

    private function period(Request $request): array
    {
        $data = $request->validate(['from'=>['nullable','date'],'to'=>['nullable','date','after_or_equal:from']]);
        $businessToday = Carbon::now($this->timezone())->toDateString();
        $from = Carbon::parse($data['from'] ?? $businessToday, $this->timezone())->startOfDay();
        $to = Carbon::parse($data['to'] ?? $businessToday, $this->timezone())->endOfDay();
        abort_if($from->diffInDays($to) > 366, 422, 'Choose a report range of 366 days or less.');
        return [$from,$to];
    }

    private function timezone(): string
    {
        $profile = RestaurantSetting::where('key', 'business_profile')->value('value') ?? [];
        return $profile['timezone'] ?? config('app.timezone', 'Asia/Manila');
    }
}
