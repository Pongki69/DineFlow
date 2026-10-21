<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CustomerProfile extends Model
{
    protected $fillable = ['phone', 'birth_date', 'preferences'];

    protected function casts(): array
    {
        return ['birth_date' => 'date', 'preferences' => 'array'];
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
