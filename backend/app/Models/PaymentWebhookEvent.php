<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PaymentWebhookEvent extends Model
{
    protected $fillable = ['provider', 'provider_event_id', 'event_type', 'resource_id', 'payment_id', 'outcome', 'processed_at'];
    protected function casts(): array { return ['processed_at' => 'datetime']; }
}
