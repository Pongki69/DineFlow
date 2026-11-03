<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payments', function (Blueprint $table): void {
            // Cash handed over at the counter; change = tendered - amount.
            $table->decimal('cash_tendered', 12, 2)->nullable()->after('amount');
        });
        Schema::table('orders', function (Blueprint $table): void {
            // Senior Citizen / PWD discount, with the ID shown at the counter.
            $table->string('special_discount_type', 16)->nullable()->after('item_discount_total');
            $table->string('special_discount_id_number', 40)->nullable()->after('special_discount_type');
            $table->string('special_discount_name', 120)->nullable()->after('special_discount_id_number');
            $table->decimal('special_discount_amount', 12, 2)->default(0)->after('special_discount_name');
        });
        Schema::table('dining_sessions', function (Blueprint $table): void {
            $table->timestamp('bill_requested_at')->nullable()->after('opened_at');
        });
        Schema::create('cash_shifts', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->timestamp('opened_at');
            $table->decimal('opening_float', 12, 2)->default(0);
            $table->timestamp('closed_at')->nullable();
            $table->decimal('expected_cash', 12, 2)->nullable();
            $table->decimal('counted_cash', 12, 2)->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->index(['user_id', 'closed_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cash_shifts');
        Schema::table('dining_sessions', fn (Blueprint $table) => $table->dropColumn('bill_requested_at'));
        Schema::table('orders', fn (Blueprint $table) => $table->dropColumn(['special_discount_type', 'special_discount_id_number', 'special_discount_name', 'special_discount_amount']));
        Schema::table('payments', fn (Blueprint $table) => $table->dropColumn('cash_tendered'));
    }
};
