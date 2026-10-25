<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('rider_profiles', fn (Blueprint $table) => $table->json('planned_delivery_ids')->nullable());
    }

    public function down(): void
    {
        Schema::table('rider_profiles', fn (Blueprint $table) => $table->dropColumn('planned_delivery_ids'));
    }
};
