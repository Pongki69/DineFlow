<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Order extends Model
{
    public const STATUSES = ['pending', 'confirmed', 'preparing', 'ready_to_serve', 'served', 'completed', 'cancelled'];

    protected $fillable = [
        'order_number', 'customer_id', 'customer_name_snapshot', 'customer_email_snapshot', 'order_type', 'status',
        'table_id', 'table_number_snapshot', 'dining_session_id', 'delivery_address', 'delivery_address_id', 'delivery_latitude', 'delivery_longitude', 'delivery_instructions', 'delivery_recipient_name', 'delivery_phone', 'delivery_distance_km', 'delivery_duration_minutes', 'customer_notes', 'subtotal',
        'item_discount_total', 'service_charge', 'delivery_fee', 'tax', 'total', 'currency', 'confirmed_at',
        'completed_at', 'cancelled_at', 'prep_minutes', 'prep_ready_at', 'delivery_vehicle_class',
    ];

    protected function casts(): array
    {
        return [
            'subtotal' => 'decimal:2', 'item_discount_total' => 'decimal:2', 'service_charge' => 'decimal:2',
            'delivery_fee' => 'decimal:2', 'tax' => 'decimal:2', 'total' => 'decimal:2',
            'delivery_latitude' => 'decimal:7', 'delivery_longitude' => 'decimal:7', 'delivery_distance_km' => 'decimal:2',
            'confirmed_at' => 'datetime', 'completed_at' => 'datetime', 'cancelled_at' => 'datetime',
            'prep_ready_at' => 'datetime',
        ];
    }

    public function customer()
    {
        return $this->belongsTo(User::class, 'customer_id');
    }

    public function items()
    {
        return $this->hasMany(OrderItem::class);
    }

    public function table()
    {
        return $this->belongsTo(RestaurantTable::class, 'table_id');
    }

    public function diningSession()
    {
        return $this->belongsTo(DiningSession::class);
    }

    public function payments()
    {
        return $this->hasMany(Payment::class);
    }

    public function paymentAllocations()
    {
        return $this->hasMany(PaymentAllocation::class);
    }

    public function delivery()
    {
        return $this->hasOne(Delivery::class);
    }

    public function statusHistory()
    {
        return $this->hasMany(OrderStatusHistory::class);
    }
}
