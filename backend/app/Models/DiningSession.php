<?php

namespace App\Models;

use App\Services\PaymentService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Validation\ValidationException;

class DiningSession extends Model
{
    protected $fillable = ['table_id', 'reservation_id', 'opened_by', 'closed_by', 'guest_count', 'status', 'opened_at', 'closed_at'];

    public function ensureBillSettled(): void
    {
        if ($this->payments()->where('status', 'pending')->exists()) {
            throw ValidationException::withMessages(['session' => 'Cancel or finish the active checkout before closing this table.']);
        }
        foreach ($this->orders()->where('status', '!=', 'cancelled')->with(['payments', 'paymentAllocations.payment'])->lockForUpdate()->get() as $order) {
            $summary = app(PaymentService::class)->orderSummary($order);
            if ((float) $summary['balance_due'] > 0 || (float) $summary['pending'] > 0) {
                throw ValidationException::withMessages(['session' => 'Settle the dining bill before closing this table.']);
            }
        }
    }

    protected function casts(): array
    {
        return ['guest_count' => 'integer', 'opened_at' => 'datetime', 'closed_at' => 'datetime'];
    }

    public function table()
    {
        return $this->belongsTo(RestaurantTable::class, 'table_id');
    }

    public function orders()
    {
        return $this->hasMany(Order::class);
    }

    public function payments()
    {
        return $this->hasMany(Payment::class);
    }

    public function openedBy()
    {
        return $this->belongsTo(User::class, 'opened_by');
    }
}
