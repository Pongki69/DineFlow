<?php

namespace App\Services;

use App\Models\Delivery;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Reservation;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class CustomerAccountDeletion
{
    public function delete(User $actor, string $password, Request $request): void
    {
        DB::transaction(function () use ($actor, $password, $request): void {
            // The user lock also serializes new records referencing this account.
            $user = User::whereKey($actor->id)->lockForUpdate()->firstOrFail();
            abort_unless($user->is_active && $user->roles()->pluck('slug')->all() === ['customer'], 403, 'Self-service deletion is available for customer accounts only.');
            if (! Hash::check($password, $user->password)) {
                throw ValidationException::withMessages(['current_password' => 'Your current password is incorrect.']);
            }
            $orders = Order::where('customer_id', $user->id);
            $reservations = Reservation::where('customer_id', $user->id);
            if ((clone $orders)->whereNotIn('status', ['completed', 'cancelled'])->exists()
                || (clone $reservations)->whereNotIn('status', ['completed', 'cancelled', 'no_show'])->exists()
                || Delivery::whereIn('order_id', (clone $orders)->select('id'))->whereNotIn('status', Delivery::TERMINAL)->exists()) {
                throw ValidationException::withMessages(['account' => 'Finish or cancel your active orders and reservations before deleting your account.']);
            }
            $payments = Payment::where(function ($query) use ($orders, $reservations): void {
                $query->whereIn('order_id', (clone $orders)->select('id'))
                    ->orWhereIn('reservation_id', (clone $reservations)->select('id'))
                    ->orWhereIn('dining_session_id', (clone $orders)->whereNotNull('dining_session_id')->select('dining_session_id'))
                    ->orWhereHas('allocations', fn ($query) => $query->whereIn('order_id', (clone $orders)->select('id')));
            });
            if ((clone $payments)->where('status', 'pending')->exists()
                || (clone $payments)->whereHas('transactions', fn ($query) => $query->where('transaction_type', 'refund')->where('status', 'pending'))->exists()) {
                throw ValidationException::withMessages(['account' => 'Wait for pending payments or refunds to finish before deleting your account.']);
            }

            // Preserve transaction amounts and operational history, removing contact snapshots.
            $orders->update([
                'customer_name_snapshot' => 'Deleted customer', 'customer_email_snapshot' => null,
                'delivery_recipient_name' => null, 'delivery_phone' => null, 'delivery_address' => null,
                'delivery_latitude' => null, 'delivery_longitude' => null, 'delivery_instructions' => null,
                'customer_notes' => null,
            ]);
            $reservations->update(['guest_name' => 'Deleted customer', 'guest_email' => null, 'guest_phone' => null, 'notes' => null]);
            $user->tokens()->delete();
            $user->notifications()->delete();
            DB::table('sessions')->where('user_id', $user->id)->delete();
            DB::table('password_reset_tokens')->where('email', $user->email)->delete();
            app(AuditLogService::class)->record($user, 'account.deleted', $user, [], $request);
            $user->delete();
        });
    }
}
