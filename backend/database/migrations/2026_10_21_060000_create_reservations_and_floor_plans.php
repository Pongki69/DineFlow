<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('restaurant_floors', function (Blueprint $table): void {
            $table->id();
            $table->string('name', 100);
            $table->string('slug', 120)->unique();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->boolean('is_published')->default(false);
            $table->timestamps();
            $table->index(['is_active', 'is_published', 'sort_order']);
        });

        Schema::table('restaurant_tables', function (Blueprint $table): void {
            $table->foreignId('floor_id')->nullable()->after('id')->constrained('restaurant_floors')->nullOnDelete();
            $table->string('zone', 60)->nullable();
            $table->string('operational_status', 24)->default('available');
            $table->timestamp('expected_available_at')->nullable();
            $table->index(['floor_id', 'operational_status', 'is_active']);
        });
        \Illuminate\Support\Facades\DB::table('restaurant_tables')->whereIn('id', function ($query): void {
            $query->select('table_id')->from('dining_sessions')->where('status', 'open');
        })->update(['operational_status' => 'occupied']);

        Schema::create('floor_plan_objects', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('floor_id')->constrained('restaurant_floors')->cascadeOnDelete();
            $table->foreignId('table_id')->nullable()->constrained('restaurant_tables')->nullOnDelete();
            $table->string('object_type', 32);
            $table->string('label', 100)->nullable();
            $table->json('position');
            $table->json('rotation')->nullable();
            $table->json('dimensions')->nullable();
            $table->json('properties')->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
            $table->index(['floor_id', 'object_type', 'sort_order']);
            $table->unique(['floor_id', 'table_id']);
        });

        Schema::create('reservations', function (Blueprint $table): void {
            $table->id();
            $table->string('reference', 24)->unique();
            $table->foreignId('customer_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('table_id')->nullable()->constrained('restaurant_tables')->nullOnDelete();
            $table->foreignId('floor_id')->nullable()->constrained('restaurant_floors')->nullOnDelete();
            $table->string('guest_name', 120);
            $table->string('guest_email', 254)->nullable();
            $table->string('guest_phone', 32)->nullable();
            $table->unsignedSmallInteger('guest_count');
            $table->timestamp('starts_at');
            $table->timestamp('ends_at');
            $table->unsignedSmallInteger('duration_minutes');
            $table->string('status', 24)->default('confirmed');
            $table->text('notes')->nullable();
            $table->timestamp('checked_in_at')->nullable();
            $table->timestamp('seated_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->timestamps();
            $table->index(['table_id', 'starts_at', 'ends_at', 'status']);
            $table->index(['customer_id', 'starts_at']);
            $table->index(['status', 'starts_at']);
        });
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE reservations ADD CONSTRAINT reservations_interval_check CHECK (ends_at > starts_at)');
        }

        Schema::create('reservation_status_history', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('reservation_id')->constrained()->cascadeOnDelete();
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('from_status', 24)->nullable();
            $table->string('to_status', 24);
            $table->text('note')->nullable();
            $table->timestamps();
            $table->index(['reservation_id', 'created_at']);
        });

        Schema::create('table_occupancy_history', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('table_id')->constrained('restaurant_tables')->cascadeOnDelete();
            $table->foreignId('dining_session_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('from_status', 24)->nullable();
            $table->string('to_status', 24);
            $table->timestamp('expected_available_at')->nullable();
            $table->text('note')->nullable();
            $table->timestamps();
            $table->index(['table_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('table_occupancy_history');
        Schema::dropIfExists('reservation_status_history');
        Schema::dropIfExists('reservations');
        Schema::dropIfExists('floor_plan_objects');
        Schema::table('restaurant_tables', function (Blueprint $table): void {
            $table->dropIndex(['floor_id', 'operational_status', 'is_active']);
            $table->dropConstrainedForeignId('floor_id');
            $table->dropColumn(['zone', 'operational_status', 'expected_available_at']);
        });
        Schema::dropIfExists('restaurant_floors');
    }
};
