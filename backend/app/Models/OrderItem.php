<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OrderItem extends Model
{
    protected $fillable = [
        'order_id', 'menu_item_id', 'category_id', 'item_name_snapshot', 'category_name_snapshot',
        'variant_name_snapshot', 'base_unit_price', 'variant_price_adjustment', 'discount_percent',
        'discount_total', 'quantity', 'line_total', 'special_instructions',
    ];

    protected function casts(): array
    {
        return [
            'base_unit_price' => 'decimal:2', 'variant_price_adjustment' => 'decimal:2',
            'discount_percent' => 'decimal:2', 'discount_total' => 'decimal:2',
            'quantity' => 'integer', 'line_total' => 'decimal:2',
        ];
    }

    public function order()
    {
        return $this->belongsTo(Order::class);
    }

    public function addons()
    {
        return $this->hasMany(OrderItemAddon::class);
    }
}
