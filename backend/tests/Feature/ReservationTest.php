<?php

use App\Models\FloorPlanObject;
use App\Models\RestaurantFloor;
use App\Models\RestaurantTable;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

beforeEach(function () { $this->seed(\Database\Seeders\AuthSeeder::class); });

function reservationUser(string $role): User
{
    $user = User::create(['name' => ucfirst($role).' Test', 'email' => $role.'-'.uniqid().'@example.test', 'password' => Hash::make('Strong-Passphrase-922!'), 'is_active' => true]);
    $user->roles()->attach(Role::where('slug', $role)->firstOrFail());
    return $user;
}

function publishedFloorWithTable(int $capacity = 4): array
{
    $floor = RestaurantFloor::create(['name' => 'Main Floor', 'slug' => 'main-floor', 'is_active' => true, 'is_published' => true]);
    $table = RestaurantTable::create(['floor_id' => $floor->id, 'table_number' => 'R-'.Str::upper(Str::random(4)), 'qr_code' => (string) Str::uuid(), 'capacity' => $capacity, 'is_active' => true, 'operational_status' => 'available']);
    FloorPlanObject::create(['floor_id' => $floor->id, 'table_id' => $table->id, 'object_type' => 'table', 'label' => $table->table_number, 'position' => ['x' => 0, 'z' => 0], 'dimensions' => ['width' => 1.4, 'depth' => 1.2]]);
    return [$floor, $table];
}

it('rechecks a selected table and rejects an overlapping reservation', function () {
    [$floor, $table] = publishedFloorWithTable();
    $guestOne = reservationUser('customer');
    $guestTwo = reservationUser('customer');
    $start = now()->addDays(2)->setTime(18, 0)->toIso8601String();
    $payload = ['starts_at' => $start, 'guest_count' => 3, 'table_id' => $table->id, 'floor_id' => $floor->id, 'guest_name' => 'Guest', 'guest_email' => 'guest@example.test'];

    $this->actingAs($guestOne)->postJson('/api/v1/reservations', $payload)->assertCreated()->assertJsonPath('data.table_id', $table->id);
    $this->actingAs($guestTwo)->postJson('/api/v1/reservations', $payload)->assertUnprocessable();
    $this->actingAs($guestTwo)->getJson('/api/v1/reservations/availability?starts_at='.urlencode($start).'&guest_count=3&floor_id='.$floor->id)->assertOk()->assertJsonPath('data.0.available', false);
});

it('keeps reservations private and permits the owner to cancel within policy', function () {
    [$floor, $table] = publishedFloorWithTable();
    $owner = reservationUser('customer');
    $other = reservationUser('customer');
    $start = now()->addDays(3)->setTime(17, 0)->toIso8601String();
    $response = $this->actingAs($owner)->postJson('/api/v1/reservations', ['starts_at' => $start, 'guest_count' => 2, 'table_id' => $table->id, 'floor_id' => $floor->id, 'guest_name' => $owner->name])->assertCreated();
    $id = $response->json('data.id');
    $this->actingAs($other)->getJson('/api/v1/reservations/'.$id)->assertNotFound();
    $this->actingAs($owner)->patchJson('/api/v1/reservations/'.$id.'/status', ['status' => 'cancelled'])->assertOk()->assertJsonPath('data.status', 'cancelled');
});

it('reschedules a booking atomically and releases the original slot', function () {
    [$floor, $table] = publishedFloorWithTable();
    $owner = reservationUser('customer');
    $start = now()->addDays(3)->setTime(17, 0)->toIso8601String();
    $original = $this->actingAs($owner)->postJson('/api/v1/reservations', ['starts_at' => $start, 'guest_count' => 2, 'table_id' => $table->id, 'floor_id' => $floor->id, 'guest_name' => $owner->name])->assertCreated();
    $this->actingAs($owner)->postJson('/api/v1/reservations/'.$original->json('data.id').'/reschedule', ['starts_at' => now()->addDays(4)->setTime(18, 0)->toIso8601String(), 'table_id' => $table->id])->assertCreated();
    expect(\App\Models\Reservation::where('status', 'cancelled')->count())->toBe(1)
        ->and(\App\Models\Reservation::where('status', 'confirmed')->count())->toBe(1);
});

it('allows service staff to record occupancy and an uncertain departure estimate', function () {
    [, $table] = publishedFloorWithTable();
    $waiter = reservationUser('waiter');
    $estimate = now()->addMinutes(85)->toIso8601String();
    $this->actingAs($waiter)->patchJson('/api/v1/service/tables/'.$table->id.'/occupancy', ['status' => 'occupied', 'expected_available_at' => $estimate])->assertOk()->assertJsonPath('data.operational_status', 'occupied');
    expect($table->fresh()->currentSession)->not->toBeNull();
    expect(\App\Models\TableOccupancyHistory::where('table_id', $table->id)->count())->toBe(1);
});

it('lets authorized managers draft and publish a floor plan', function () {
    $manager = reservationUser('manager');
    $floorId = $this->actingAs($manager)->postJson('/api/v1/admin/floor-plan/floors', ['name' => 'Patio'])->assertCreated()->json('data.id');
    $tableId = $this->actingAs($manager)->postJson('/api/v1/admin/floor-plan/floors/'.$floorId.'/tables', ['table_number' => 'P-01', 'capacity' => 4, 'position' => ['x' => 1, 'z' => 2]])->assertCreated()->json('data.id');
    $layout = $this->actingAs($manager)->getJson('/api/v1/admin/floor-plan/floors')->assertOk()->json('data.0.objects');
    expect($layout)->toHaveCount(1);
    $this->actingAs($manager)->postJson('/api/v1/admin/floor-plan/floors/'.$floorId.'/publish')->assertOk();
    $this->getJson('/api/v1/floor-plan/floors')->assertOk()->assertJsonPath('data.0.objects.0.table_id', $tableId);
});

