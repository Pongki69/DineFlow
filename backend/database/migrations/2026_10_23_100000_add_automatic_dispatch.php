<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dispatch_mutexes', function (Blueprint $table) {
            $table->unsignedInteger('id')->primary();
        });
        DB::table('dispatch_mutexes')->insert(['id' => 1]);
        Schema::table('orders', function (Blueprint $table) {
            $table->unsignedSmallInteger('prep_minutes')->nullable();
            $table->timestamp('prep_ready_at')->nullable();
            $table->string('delivery_vehicle_class', 20)->default('motorcycle');
        });
        Schema::table('deliveries', function (Blueprint $table) {
            $table->decimal('pickup_latitude', 10, 7)->nullable();
            $table->decimal('pickup_longitude', 10, 7)->nullable();
            $table->string('pickup_address', 500)->nullable();
            $table->string('dispatch_status', 32)->default('waiting_merchant');
            $table->timestamp('next_dispatch_at')->nullable()->index();
            $table->timestamp('search_stage_started_at')->nullable();
            $table->unsignedSmallInteger('dispatch_stage')->default(0);
            $table->unsignedSmallInteger('dispatch_attempts')->default(0);
            $table->unsignedInteger('dispatch_round')->default(1);
            $table->uuid('batch_key')->nullable()->index();
            $table->unsignedSmallInteger('batch_sequence')->nullable();
        });
        Schema::table('rider_profiles', function (Blueprint $table) {
            $table->boolean('is_online')->default(false);
            $table->uuid('presence_token')->nullable();
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            $table->decimal('accuracy_meters', 8, 2)->nullable();
            $table->timestamp('located_at')->nullable();
            $table->string('geohash', 4)->nullable();
            $table->index(['is_online', 'geohash', 'located_at']);
        });
        Schema::table('delivery_assignments', function (Blueprint $table) {
            $table->unsignedBigInteger('assigned_by')->nullable()->change();
        });
        Schema::create('dispatch_offers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('delivery_id')->constrained()->cascadeOnDelete();
            $table->foreignId('rider_user_id')->constrained('users')->cascadeOnDelete();
            // Nullable unique reservations are released atomically on every terminal outcome.
            $table->foreignId('active_delivery_id')->nullable()->unique()->constrained('deliveries')->cascadeOnDelete();
            $table->foreignId('active_rider_user_id')->nullable()->unique()->constrained('users')->cascadeOnDelete();
            $table->string('status', 20)->default('offered');
            $table->timestamp('expires_at')->index();
            $table->unsignedInteger('round')->default(1);
            $table->timestamp('responded_at')->nullable();
            $table->json('ranking');
            $table->timestamps();
            $table->index(['delivery_id', 'rider_user_id']);
            $table->index(['rider_user_id', 'status']);
        });
        Schema::create('delivery_ratings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('delivery_id')->unique()->constrained()->cascadeOnDelete();
            $table->foreignId('rider_user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('customer_id')->constrained('users')->cascadeOnDelete();
            $table->unsignedTinyInteger('rating');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('delivery_ratings');
        Schema::dropIfExists('dispatch_offers');
        Schema::table('rider_profiles', function (Blueprint $table) {
            $table->dropIndex(['is_online', 'geohash', 'located_at']);
            $table->dropColumn(['is_online', 'presence_token', 'latitude', 'longitude', 'accuracy_meters', 'located_at', 'geohash']);
        });
        Schema::table('deliveries', function (Blueprint $table) {
            $table->dropColumn(['pickup_latitude', 'pickup_longitude', 'pickup_address', 'dispatch_status', 'next_dispatch_at', 'search_stage_started_at', 'dispatch_stage', 'dispatch_attempts', 'dispatch_round', 'batch_key', 'batch_sequence']);
        });
        Schema::table('orders', fn (Blueprint $table) => $table->dropColumn(['prep_minutes', 'prep_ready_at', 'delivery_vehicle_class']));
        // assigned_by stays nullable so existing automatic assignment audit rows remain valid.
        Schema::dropIfExists('dispatch_mutexes');
    }
};
