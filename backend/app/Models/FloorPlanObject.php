<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FloorPlanObject extends Model
{
    protected $fillable = ['floor_id', 'table_id', 'object_type', 'label', 'position', 'rotation', 'dimensions', 'properties', 'sort_order'];
    protected function casts(): array { return ['position' => 'array', 'rotation' => 'array', 'dimensions' => 'array', 'properties' => 'array', 'sort_order' => 'integer']; }
    public function floor() { return $this->belongsTo(RestaurantFloor::class, 'floor_id'); }
    public function table() { return $this->belongsTo(RestaurantTable::class); }
}
