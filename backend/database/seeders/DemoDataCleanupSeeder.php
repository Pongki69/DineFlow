<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/** Removes exactly the rows DemoDataSeeder created (and nothing else). */
class DemoDataCleanupSeeder extends Seeder
{
    public function run(): void
    {
        DB::transaction(function (): void {
            $orderIds = DB::table('orders')->where('order_number', 'like', 'DEMO-%')->pluck('id');
            $deliveryIds = DB::table('deliveries')->whereIn('order_id', $orderIds)->pluck('id');
            $reservationIds = DB::table('reservations')->where('reference', 'like', 'DEMO-RSV-%')->pluck('id');
            $userIds = DB::table('users')->where('email', 'like', '%@demo.dineflow.test')->pluck('id');

            DB::table('delivery_ratings')->whereIn('delivery_id', $deliveryIds)->delete();
            DB::table('delivery_status_history')->whereIn('delivery_id', $deliveryIds)->delete();
            DB::table('dispatch_offers')->whereIn('delivery_id', $deliveryIds)->delete();
            DB::table('delivery_location_updates')->whereIn('delivery_id', $deliveryIds)->delete();
            DB::table('deliveries')->whereIn('id', $deliveryIds)->delete();
            // Payments may have picked up transactions or allocations while in use.
            $sessionIds = DB::table('dining_sessions')->whereIn('opened_by', $userIds)->pluck('id');
            $paymentIds = DB::table('payments')->where('reference_number', 'like', 'DEMO-PAY-%')->orWhereIn('order_id', $orderIds)
                ->orWhereIn('dining_session_id', $sessionIds)->pluck('id');
            DB::table('payment_transactions')->whereIn('payment_id', $paymentIds)->delete();
            DB::table('payment_allocations')->whereIn('payment_id', $paymentIds)->orWhereIn('order_id', $orderIds)->delete();
            DB::table('payments')->whereIn('id', $paymentIds)->delete();
            DB::table('order_status_history')->whereIn('order_id', $orderIds)->delete();
            $itemIds = DB::table('order_items')->whereIn('order_id', $orderIds)->pluck('id');
            DB::table('order_item_addons')->whereIn('order_item_id', $itemIds)->delete();
            DB::table('order_items')->whereIn('id', $itemIds)->delete();
            DB::table('orders')->whereIn('id', $orderIds)->delete();

            // Dining bills opened by demo staff (their orders are already gone).
            $seatedTables = DB::table('dining_sessions')->whereIn('id', $sessionIds)->where('status', 'open')->pluck('table_id');
            DB::table('dining_sessions')->whereIn('id', $sessionIds)->delete();
            // Their tables are free again unless someone real is still seated there.
            DB::table('restaurant_tables')->whereIn('id', $seatedTables)->where('operational_status', 'occupied')
                ->whereNotIn('id', DB::table('dining_sessions')->where('status', 'open')->select('table_id'))
                ->update(['operational_status' => 'available']);

            DB::table('reservation_status_history')->whereIn('reservation_id', $reservationIds)->delete();
            DB::table('reservation_tables')->whereIn('reservation_id', $reservationIds)->delete();
            DB::table('reservations')->whereIn('id', $reservationIds)->delete();

            DB::table('notifications')->where('data', 'like', '%"demo":true%')->delete();
            DB::table('delivery_addresses')->where('delivery_instructions', 'like', 'Demo:%')->delete();

            // Anything the app itself attached to demo staff while they were in
            // use: dispatch offers, alerts, sign-ins and audit authorship.
            DB::table('dispatch_offers')->whereIn('rider_user_id', $userIds)->orWhereIn('active_rider_user_id', $userIds)->delete();
            DB::table('deliveries')->whereIn('rider_user_id', $userIds)->update(['rider_user_id' => null]);
            DB::table('notifications')->where('notifiable_type', 'App\\Models\\User')->whereIn('notifiable_id', $userIds)->delete();
            DB::table('audit_logs')->whereIn('actor_id', $userIds)->update(['actor_id' => null]);
            DB::table('sessions')->whereIn('user_id', $userIds)->delete();
            DB::table('personal_access_tokens')->where('tokenable_type', 'App\\Models\\User')->whereIn('tokenable_id', $userIds)->delete();
            DB::table('cash_shifts')->whereIn('user_id', $userIds)->delete();
            DB::table('rider_profiles')->whereIn('user_id', $userIds)->delete();
            DB::table('role_user')->whereIn('user_id', $userIds)->delete();
            DB::table('users')->whereIn('id', $userIds)->delete();
        });
    }
}
