<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FloorPlanPreset extends Model
{
    protected $fillable = ['created_by', 'name', 'definition'];

    protected function casts(): array
    {
        return ['definition' => 'array'];
    }
}
