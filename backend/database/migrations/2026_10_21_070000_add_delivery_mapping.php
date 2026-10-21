<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('delivery_addresses', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('label', 60)->default('Home');
            $table->string('recipient_name', 120);
            $table->string('phone', 32);
            $table->string('formatted_address', 500);
            $table->decimal('latitude', 10, 7);
            $table->decimal('longitude', 10, 7);
            $table->text('delivery_instructions')->nullable();
            $table->boolean('is_default')->default(false);
            $table->timestamps();
            $table->index(['user_id', 'is_default']);
        });

        Schema::table('orders', function (Blueprint $table): void {
            $table->foreignId('delivery_address_id')->nullable()->after('delivery_address')->constrained('delivery_addresses')->nullOnDelete();
            $table->decimal('delivery_latitude', 10, 7)->nullable();
            $table->decimal('delivery_longitude', 10, 7)->nullable();
            $table->text('delivery_instructions')->nullable();
            $table->decimal('delivery_distance_km', 8, 2)->nullable();
            $table->unsignedSmallInteger('delivery_duration_minutes')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('delivery_address_id');
            $table->dropColumn(['delivery_latitude', 'delivery_longitude', 'delivery_instructions', 'delivery_distance_km', 'delivery_duration_minutes']);
        });
        Schema::dropIfExists('delivery_addresses');
    }
};
