<?php

use App\Models\Role;
use App\Models\User;
use App\Notifications\RestaurantUpdateNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Hash;

uses(RefreshDatabase::class);

beforeEach(fn () => $this->seed(\Database\Seeders\AuthSeeder::class));

it('persists restaurant updates as private in-app notifications for the intended user', function () {
    Notification::fake();
    $role = Role::where('slug', 'customer')->firstOrFail();
    $owner = User::create(['name' => 'Customer', 'email' => 'notify@example.test', 'password' => Hash::make('Strong-Passphrase-922!'), 'is_active' => true]);
    $other = User::create(['name' => 'Other Customer', 'email' => 'other@example.test', 'password' => Hash::make('Strong-Passphrase-922!'), 'is_active' => true]);
    $owner->roles()->attach($role);

    app(\App\Services\RestaurantNotificationService::class)->send($owner, 'order.status_changed', 'Order update', 'Your order is preparing.', ['order_id' => 42]);

    Notification::assertSentTo($owner, RestaurantUpdateNotification::class);
    Notification::assertNotSentTo($other, RestaurantUpdateNotification::class);
});

it('returns and marks only the authenticated users notifications', function () {
    $customerRole = Role::where('slug', 'customer')->firstOrFail();
    $first = User::create(['name' => 'First', 'email' => 'first@example.test', 'password' => Hash::make('Strong-Passphrase-922!'), 'is_active' => true]);
    $second = User::create(['name' => 'Second', 'email' => 'second@example.test', 'password' => Hash::make('Strong-Passphrase-922!'), 'is_active' => true]);
    $first->roles()->attach($customerRole); $second->roles()->attach($customerRole);
    $first->notify(new RestaurantUpdateNotification('order.placed', 'Order received', 'Received.', ['order_id' => 9]));
    $second->notify(new RestaurantUpdateNotification('order.placed', 'Order received', 'Received.', ['order_id' => 10]));
    $foreign = $second->notifications()->firstOrFail();

    $this->actingAs($first)->getJson('/api/v1/notifications')->assertOk()->assertJsonPath('unread_count', 1)->assertJsonMissing(['id' => $foreign->id]);
    $this->actingAs($first)->patchJson('/api/v1/notifications/'.$foreign->id.'/read')->assertNotFound();
    expect($foreign->fresh()->read_at)->toBeNull();
});
