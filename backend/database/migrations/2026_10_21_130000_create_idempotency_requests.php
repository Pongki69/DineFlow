<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('idempotency_requests', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('scope', 64);
            $table->string('key', 128);
            $table->string('request_hash', 64);
            $table->unsignedSmallInteger('status')->nullable();
            $table->text('response_body')->nullable();
            $table->timestamp('expires_at')->index();
            $table->unique(['user_id', 'scope', 'key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('idempotency_requests');
    }
};
