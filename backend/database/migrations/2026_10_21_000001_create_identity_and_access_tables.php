<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table): void {
            $table->id(); $table->string('name', 120); $table->string('email', 254)->unique();
            $table->timestamp('email_verified_at')->nullable(); $table->string('password');
            $table->boolean('is_active')->default(true)->index(); $table->rememberToken(); $table->timestamps();
        });
        Schema::create('password_reset_tokens', function (Blueprint $table): void {
            $table->string('email')->primary(); $table->string('token'); $table->timestamp('created_at')->nullable();
        });
        Schema::create('roles', function (Blueprint $table): void {
            $table->id(); $table->string('name'); $table->string('slug')->unique(); $table->boolean('is_system')->default(true); $table->timestamps();
        });
        Schema::create('permissions', function (Blueprint $table): void {
            $table->id(); $table->string('name'); $table->string('slug')->unique(); $table->timestamps();
        });
        Schema::create('role_user', function (Blueprint $table): void {
            $table->foreignId('role_id')->constrained()->cascadeOnDelete(); $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamps(); $table->primary(['role_id', 'user_id']);
        });
        Schema::create('permission_role', function (Blueprint $table): void {
            $table->foreignId('permission_id')->constrained()->cascadeOnDelete(); $table->foreignId('role_id')->constrained()->cascadeOnDelete();
            $table->timestamps(); $table->primary(['permission_id', 'role_id']);
        });
        Schema::create('audit_logs', function (Blueprint $table): void {
            $table->id(); $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('event', 120)->index(); $table->string('subject_type')->nullable(); $table->unsignedBigInteger('subject_id')->nullable();
            $table->json('metadata')->nullable(); $table->string('ip_address', 45)->nullable(); $table->timestamps();
            $table->index(['subject_type', 'subject_id']);
        });
        Schema::create('sessions', function (Blueprint $table): void {
            $table->string('id')->primary(); $table->foreignId('user_id')->nullable()->index(); $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable(); $table->longText('payload'); $table->integer('last_activity')->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sessions'); Schema::dropIfExists('audit_logs');
        Schema::dropIfExists('permission_role'); Schema::dropIfExists('role_user'); Schema::dropIfExists('permissions');
        Schema::dropIfExists('roles'); Schema::dropIfExists('password_reset_tokens'); Schema::dropIfExists('users');
    }
};
