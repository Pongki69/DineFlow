<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('payments', function (Blueprint $table): void {
            $table->foreignId('reservation_id')->nullable()->after('order_id')->constrained()->restrictOnDelete();
            $table->foreignId('dining_session_id')->nullable()->after('reservation_id')->constrained()->restrictOnDelete();
            $table->string('purpose', 32)->default('order')->after('method');
            $table->string('reference_number', 80)->nullable()->unique();
            $table->string('checkout_session_id', 100)->nullable()->unique();
            $table->string('provider_payment_id', 100)->nullable()->index();
            $table->string('idempotency_key', 100)->nullable()->unique();
            $table->text('checkout_url')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('refunded_at')->nullable();
            $table->text('failure_reason')->nullable();
            $table->index(['reservation_id', 'status']);
            $table->index(['dining_session_id', 'status']);
            $table->index(['status', 'expires_at']);
            $table->foreignId('order_id')->nullable()->change();
        });

        Schema::table('payment_transactions', function (Blueprint $table): void {
            $table->string('provider_event_id', 120)->nullable()->unique();
            $table->string('idempotency_key', 120)->nullable()->unique();
            $table->text('notes')->nullable();
        });

        Schema::create('payment_allocations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('payment_id')->constrained()->restrictOnDelete();
            $table->foreignId('order_id')->constrained()->restrictOnDelete();
            $table->decimal('amount', 12, 2);
            $table->timestamps();
            $table->unique(['payment_id', 'order_id']);
            $table->index(['order_id', 'created_at']);
        });

        Schema::create('payment_webhook_events', function (Blueprint $table): void {
            $table->id();
            $table->string('provider', 40);
            $table->string('provider_event_id', 120)->unique();
            $table->string('event_type', 100);
            $table->string('resource_id', 120)->nullable();
            $table->foreignId('payment_id')->nullable()->constrained()->nullOnDelete();
            $table->string('outcome', 32)->default('received');
            $table->timestamp('processed_at')->nullable();
            $table->timestamps();
            $table->index(['provider', 'event_type', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payment_webhook_events');
        Schema::dropIfExists('payment_allocations');
        Schema::table('payment_transactions', function (Blueprint $table): void {
            $table->dropUnique(['provider_event_id']);
            $table->dropUnique(['idempotency_key']);
            $table->dropColumn(['provider_event_id', 'idempotency_key', 'notes']);
        });
        Schema::table('payments', function (Blueprint $table): void {
            $table->dropIndex(['reservation_id', 'status']);
            $table->dropIndex(['dining_session_id', 'status']);
            $table->dropIndex(['status', 'expires_at']);
            $table->dropForeign(['reservation_id']);
            $table->dropForeign(['dining_session_id']);
            $table->dropUnique(['reference_number']);
            $table->dropUnique(['checkout_session_id']);
            $table->dropUnique(['idempotency_key']);
            $table->dropColumn(['reservation_id', 'dining_session_id', 'purpose', 'reference_number', 'checkout_session_id', 'provider_payment_id', 'idempotency_key', 'checkout_url', 'expires_at', 'refunded_at', 'failure_reason']);
            $table->foreignId('order_id')->nullable(false)->change();
        });
    }
};
