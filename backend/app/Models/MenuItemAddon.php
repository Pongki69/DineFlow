<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MenuItemAddon extends Model
{
    protected $fillable = ['menu_item_id', 'name', 'price', 'is_active', 'sort_order'];

    protected function casts(): array
    {
        return ['price' => 'decimal:2', 'is_active' => 'boolean', 'sort_order' => 'integer'];
    }

    public function menuItem()
    {
        return $this->belongsTo(MenuItem::class);
    }
}
