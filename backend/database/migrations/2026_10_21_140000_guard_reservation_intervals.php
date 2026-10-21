<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('reservations', fn (Blueprint $table) => $table->unsignedSmallInteger('buffer_minutes')->default(0));
        Schema::table('dining_sessions', fn (Blueprint $table) => $table->foreignId('reservation_id')->nullable()->constrained('reservations')->nullOnDelete());
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }
        DB::statement('CREATE EXTENSION IF NOT EXISTS btree_gist');
        DB::statement("ALTER TABLE reservations ADD CONSTRAINT reservations_no_overlap EXCLUDE USING gist (table_id WITH =, tsrange(starts_at, ends_at + buffer_minutes * interval '1 minute', '[)') WITH &&) WHERE (status IN ('pending', 'confirmed', 'checked_in', 'seated'))");
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_no_overlap');
        }
        Schema::table('dining_sessions', fn (Blueprint $table) => $table->dropConstrainedForeignId('reservation_id'));
        Schema::table('reservations', fn (Blueprint $table) => $table->dropColumn('buffer_minutes'));
    }
};
