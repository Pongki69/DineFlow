<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MenuItemVariant extends Model
{
    protected $fillable = ['menu_item_id', 'name', 'price_adjustment', 'is_active', 'sort_order'];

    protected function casts(): array
    {
        return ['price_adjustment' => 'decimal:2', 'is_active' => 'boolean', 'sort_order' => 'integer'];
    }

    public function menuItem()
    {
        return $this->belongsTo(MenuItem::class);
    }
}
