<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PaymentAllocation extends Model
{
    protected $fillable = ['payment_id', 'order_id', 'amount'];
    protected function casts(): array { return ['amount' => 'decimal:2']; }
    public function payment() { return $this->belongsTo(Payment::class); }
    public function order() { return $this->belongsTo(Order::class); }
}
