<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PaymentTransaction extends Model
{
    protected $fillable = ['payment_id', 'transaction_type', 'status', 'amount', 'provider_transaction_id', 'provider_event_id', 'idempotency_key', 'response_payload', 'notes'];

    protected function casts(): array
    {
        return ['amount' => 'decimal:2', 'response_payload' => 'array'];
    }

    public function payment()
    {
        return $this->belongsTo(Payment::class);
    }
}
