<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TableOccupancyHistory extends Model
{
    protected $table = 'table_occupancy_history';
    protected $fillable = ['table_id', 'dining_session_id', 'actor_id', 'from_status', 'to_status', 'expected_available_at', 'note'];
    protected function casts(): array { return ['expected_available_at' => 'datetime']; }
}
