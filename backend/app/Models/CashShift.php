<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** A cashier's drawer session: starting float, then the counted cash at close. */
class CashShift extends Model
{
    protected $fillable = ['user_id', 'opened_at', 'opening_float', 'closed_at', 'expected_cash', 'counted_cash', 'notes'];

    protected function casts(): array
    {
        return [
            'opened_at' => 'datetime', 'closed_at' => 'datetime',
            'opening_float' => 'decimal:2', 'expected_cash' => 'decimal:2', 'counted_cash' => 'decimal:2',
        ];
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
