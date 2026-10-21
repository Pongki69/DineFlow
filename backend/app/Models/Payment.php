<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Payment extends Model
{
    protected $fillable = ['order_id', 'reservation_id', 'dining_session_id', 'purpose', 'method', 'status', 'amount', 'currency', 'provider', 'provider_reference', 'provider_payment_id', 'reference_number', 'checkout_session_id', 'idempotency_key', 'checkout_url', 'expires_at', 'failure_reason', 'refunded_at', 'received_by', 'paid_at'];

    protected function casts(): array
    {
        return ['amount' => 'decimal:2', 'paid_at' => 'datetime', 'expires_at' => 'datetime', 'refunded_at' => 'datetime'];
    }

    public function order()
    {
        return $this->belongsTo(Order::class);
    }

    public function transactions()
    {
        return $this->hasMany(PaymentTransaction::class);
    }

    public function reservation() { return $this->belongsTo(Reservation::class); }
    public function diningSession() { return $this->belongsTo(DiningSession::class); }
    public function allocations() { return $this->hasMany(PaymentAllocation::class); }
    public function receivedBy() { return $this->belongsTo(User::class, 'received_by'); }
}
