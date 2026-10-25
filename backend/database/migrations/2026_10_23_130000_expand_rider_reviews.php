<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('delivery_ratings', function (Blueprint $table) {
            $table->text('comment')->nullable();
            $table->json('categories')->nullable();
            $table->boolean('show_name')->default(false);
            $table->index(['rider_user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::table('delivery_ratings', function (Blueprint $table) {
            $table->dropIndex(['rider_user_id', 'created_at']);
            $table->dropColumn(['comment', 'categories', 'show_name']);
        });
    }
};
