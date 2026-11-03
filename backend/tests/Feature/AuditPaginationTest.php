<?php

use App\Models\AuditLog;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('paginates audit history with stable ordering and bounded page sizes', function () {
    $this->seed(\Database\Seeders\AuthSeeder::class);
    $admin = User::create(['name' => 'Audit Admin', 'email' => 'audit@example.test', 'password' => 'Strong-Password-123!', 'is_active' => true]);
    $admin->roles()->attach(Role::where('slug', 'administrator')->firstOrFail());
    for ($i = 0; $i < 21; $i++) AuditLog::create(['event' => 'test.event', 'actor_id' => $admin->id]);
    $first = $this->actingAs($admin)->getJson('/api/v1/admin/audit-logs?per_page=20')->assertOk();
    $first->assertJsonCount(20, 'data')->assertJsonPath('total', 21)->assertJsonPath('last_page', 2);
    $second = $this->getJson('/api/v1/admin/audit-logs?page=2&per_page=20')->assertOk();
    $second->assertJsonCount(1, 'data')->assertJsonPath('from', 21)->assertJsonPath('to', 21);
    expect(array_intersect(array_column($first->json('data'), 'id'), array_column($second->json('data'), 'id')))->toBe([]);
    $this->getJson('/api/v1/admin/audit-logs?per_page=101')->assertUnprocessable();
});
