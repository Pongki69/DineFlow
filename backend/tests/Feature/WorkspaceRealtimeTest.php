<?php

use App\Events\WorkspaceUpdated;
use App\Models\RestaurantSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;

uses(RefreshDatabase::class);

it('authorizes only active accounts and broadcasts invalidation topics without records', function () {
    $authorize = Broadcast::getChannels()['workspace'];
    $user = new User(['is_active' => true]);
    expect($authorize($user))->toBeTrue();
    $user->is_active = false;
    expect($authorize($user))->toBeFalse();
    $event = new WorkspaceUpdated(['orders']);
    expect($event->broadcastOn()[0]->name)->toBe('private-workspace');
    expect($event->broadcastWith())->toBe(['topics' => ['orders']]);
});

it('announces committed changes but never rolled-back changes', function () {
    Event::fake([WorkspaceUpdated::class]);
    RestaurantSetting::create(['key' => 'business_profile', 'value' => ['restaurant_name' => 'Test restaurant']]);
    Event::assertDispatched(WorkspaceUpdated::class, fn ($event) => $event->topics === ['settings']);
    Event::fake([WorkspaceUpdated::class]);
    try {
        DB::transaction(function () {
            RestaurantSetting::create(['key' => 'test_rollback', 'value' => ['secret' => 'never broadcast']]);
            throw new RuntimeException('Rollback');
        });
    } catch (RuntimeException) {}
    Event::assertNotDispatched(WorkspaceUpdated::class);
});

it('exposes only public connection settings and disables the client when broadcasting is unavailable', function () {
    config(['broadcasting.default' => 'reverb', 'broadcasting.connections.reverb.key' => 'public-test-key', 'broadcasting.connections.reverb.secret' => 'never-publish-this']);
    $data = $this->getJson('/api/v1/realtime/config')->assertOk()->json('data');
    expect(array_keys($data))->toBe(['key', 'host', 'port', 'scheme']);
    expect($data['key'])->toBe('public-test-key');
    expect(json_encode($data))->not->toContain('never-publish-this');
    config(['broadcasting.default' => 'log']);
    $this->getJson('/api/v1/realtime/config')->assertOk()->assertJsonPath('data.key', null);
});
