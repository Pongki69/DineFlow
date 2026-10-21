<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class MenuItem extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'category_id', 'name', 'slug', 'sku', 'description', 'image_path', 'base_price',
        'discount_percent', 'is_active', 'is_available', 'is_sold_out', 'available_from',
        'available_until', 'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'base_price' => 'decimal:2', 'discount_percent' => 'decimal:2',
            'is_active' => 'boolean', 'is_available' => 'boolean', 'is_sold_out' => 'boolean',
            'available_from' => 'datetime', 'available_until' => 'datetime', 'sort_order' => 'integer',
        ];
    }

    public function category()
    {
        return $this->belongsTo(MenuCategory::class, 'category_id');
    }

    public function variants()
    {
        return $this->hasMany(MenuItemVariant::class)->orderBy('sort_order')->orderBy('id');
    }

    public function addons()
    {
        return $this->hasMany(MenuItemAddon::class)->orderBy('sort_order')->orderBy('id');
    }

    public function scopeOrderable(Builder $query): Builder
    {
        return $query->where('is_active', true)->where('is_available', true)->where('is_sold_out', false)
            ->where(fn (Builder $q) => $q->whereNull('available_from')->orWhere('available_from', '<=', now()))
            ->where(fn (Builder $q) => $q->whereNull('available_until')->orWhere('available_until', '>=', now()));
    }

    public function getIsCurrentlyAvailableAttribute(): bool
    {
        return $this->is_active && $this->is_available && ! $this->is_sold_out
            && (! $this->available_from || $this->available_from->lte(now()))
            && (! $this->available_until || $this->available_until->gte(now()));
    }
}
