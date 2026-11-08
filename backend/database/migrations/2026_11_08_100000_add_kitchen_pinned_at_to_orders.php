<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            // Set when the pass pins a ticket to the top of the kitchen board;
            // cleared once the ticket leaves the kitchen.
            $table->timestamp('kitchen_pinned_at')->nullable()->after('prep_ready_at');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->dropColumn('kitchen_pinned_at');
        });
    }
};
