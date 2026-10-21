<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('rider_profiles', function (Blueprint $table): void {
            $table->id(); $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('phone', 32)->nullable(); $table->string('vehicle_type', 40)->nullable(); $table->string('vehicle_plate', 24)->nullable();
            $table->boolean('is_available')->default(true); $table->timestamps();
            $table->index(['is_available', 'updated_at']);
        });
        Schema::create('deliveries', function (Blueprint $table): void {
            $table->id(); $table->foreignId('order_id')->unique()->constrained()->restrictOnDelete();
            $table->foreignId('rider_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('status', 32)->default('pending_assignment'); $table->text('failure_reason')->nullable();
            $table->timestamp('assigned_at')->nullable(); $table->timestamp('accepted_at')->nullable(); $table->timestamp('picked_up_at')->nullable();
            $table->timestamp('delivered_at')->nullable(); $table->timestamp('cancelled_at')->nullable();
            $table->timestamp('estimated_arrival_at')->nullable(); $table->timestamp('last_routed_at')->nullable(); $table->json('route_geometry')->nullable(); $table->timestamps();
            $table->index(['rider_user_id', 'status']); $table->index(['status', 'created_at']);
        });
        Schema::create('delivery_assignments', function (Blueprint $table): void {
            $table->id(); $table->foreignId('delivery_id')->constrained()->cascadeOnDelete();
            $table->foreignId('rider_user_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('assigned_by')->constrained('users')->restrictOnDelete();
            $table->string('status', 24)->default('assigned'); $table->text('reason')->nullable();
            $table->timestamp('accepted_at')->nullable(); $table->timestamp('rejected_at')->nullable(); $table->timestamp('ended_at')->nullable(); $table->timestamps();
            $table->index(['delivery_id', 'created_at']); $table->index(['rider_user_id', 'status']);
        });
        Schema::create('delivery_status_history', function (Blueprint $table): void {
            $table->id(); $table->foreignId('delivery_id')->constrained()->cascadeOnDelete();
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('from_status', 32)->nullable(); $table->string('to_status', 32); $table->text('reason')->nullable(); $table->timestamps();
            $table->index(['delivery_id', 'created_at']);
        });
        Schema::create('delivery_location_updates', function (Blueprint $table): void {
            $table->id(); $table->foreignId('delivery_id')->constrained()->cascadeOnDelete();
            $table->foreignId('rider_user_id')->constrained('users')->cascadeOnDelete();
            $table->decimal('latitude', 10, 7); $table->decimal('longitude', 10, 7);
            $table->decimal('accuracy_meters', 8, 2)->nullable(); $table->decimal('speed_mps', 8, 2)->nullable();
            $table->timestamp('recorded_at'); $table->timestamps();
            $table->index(['delivery_id', 'recorded_at']);
        });

        DB::table('users')->join('role_user', 'users.id', '=', 'role_user.user_id')->join('roles', 'roles.id', '=', 'role_user.role_id')->where('roles.slug', 'rider')->select('users.id')->orderBy('users.id')->chunk(100, function ($riders): void {
            foreach ($riders as $rider) DB::table('rider_profiles')->insertOrIgnore(['user_id' => $rider->id, 'is_available' => true, 'created_at' => now(), 'updated_at' => now()]);
        });
        DB::table('orders')->where('order_type', 'delivery')->orderBy('id')->chunk(100, function ($orders): void {
            foreach ($orders as $order) {
                DB::table('deliveries')->insertOrIgnore(['order_id' => $order->id, 'status' => 'pending_assignment', 'created_at' => now(), 'updated_at' => now()]);
                $deliveryId = DB::table('deliveries')->where('order_id', $order->id)->value('id');
                DB::table('delivery_status_history')->insertOrIgnore(['delivery_id' => $deliveryId, 'actor_id' => null, 'from_status' => null, 'to_status' => 'pending_assignment', 'created_at' => now(), 'updated_at' => now()]);
            }
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('delivery_location_updates'); Schema::dropIfExists('delivery_status_history');
        Schema::dropIfExists('delivery_assignments'); Schema::dropIfExists('deliveries'); Schema::dropIfExists('rider_profiles');
    }
};
