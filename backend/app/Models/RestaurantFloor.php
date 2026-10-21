<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RestaurantFloor extends Model
{
    protected $fillable = ['name', 'slug', 'sort_order', 'is_active', 'is_published'];
    protected function casts(): array { return ['sort_order' => 'integer', 'is_active' => 'boolean', 'is_published' => 'boolean']; }
    public function tables() { return $this->hasMany(RestaurantTable::class, 'floor_id'); }
    public function objects() { return $this->hasMany(FloorPlanObject::class, 'floor_id')->orderBy('sort_order'); }
}
