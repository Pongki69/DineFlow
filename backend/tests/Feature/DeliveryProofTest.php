<?php

use App\Models\Delivery;
use App\Models\Order;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\AuthSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Tests\Support\DeliveryPhoto;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->seed(AuthSeeder::class);
    $makeUser = function ($role) {
        $user = User::create(['name' => $role, 'email' => uniqid().'@example.test', 'password' => 'Delivery-Test-123!', 'is_active' => true]);
        $user->roles()->attach(Role::where('slug', $role)->firstOrFail());

        return $user;
    };
    $this->customer = $makeUser('customer');
    $this->rider = $makeUser('rider');
    $this->otherRider = $makeUser('rider');
    $this->stranger = $makeUser('customer');
    $this->order = Order::create(['order_number' => 'PHOTO'.uniqid(), 'customer_id' => $this->customer->id, 'customer_name_snapshot' => 'Customer', 'order_type' => 'delivery', 'status' => 'ready_to_serve', 'total' => 100, 'subtotal' => 100, 'currency' => 'PHP']);
    $this->delivery = Delivery::create(['order_id' => $this->order->id, 'rider_user_id' => $this->rider->id, 'status' => 'in_transit']);
    $this->uploadUrl = '/api/v1/rider/deliveries/'.$this->delivery->id.'/proof';
    $this->viewUrl = '/api/v1/deliveries/'.$this->delivery->id.'/proof';
    $this->statusUrl = '/api/v1/rider/deliveries/'.$this->delivery->id.'/status';
});

it('requires a persisted photo before delivery and makes it privately viewable after completion', function () {
    $this->actingAs($this->rider)->patchJson($this->statusUrl, ['status' => 'delivered'])->assertUnprocessable()->assertJsonValidationErrors('photo');
    expect($this->delivery->fresh()->status)->toBe('in_transit');
    expect($this->order->fresh()->status)->toBe('ready_to_serve');
    $this->postJson($this->uploadUrl, ['photo' => DeliveryPhoto::file()])->assertOk()->assertJsonPath('data.uploaded', true);
    $this->getJson('/api/v1/rider/assignments')->assertJsonPath('data.0.proof_uploaded', true)->assertJsonMissingPath('data.0.image_data');
    $this->actingAs($this->customer)->getJson($this->viewUrl)->assertNotFound();
    $this->actingAs($this->rider)->patchJson($this->statusUrl, ['status' => 'delivered'])->assertOk();
    expect($this->order->fresh()->status)->toBe('completed');
    $image = $this->actingAs($this->customer)->getJson($this->viewUrl)->assertOk()->assertHeader('Cache-Control', 'no-store, private')->json('data.image');
    expect($image)->toStartWith('data:image/jpeg;base64,');
    expect(getimagesizefromstring(base64_decode(explode(',', $image, 2)[1]))['mime'])->toBe('image/jpeg');
    $this->getJson('/api/v1/my/deliveries/'.$this->delivery->id)->assertJsonPath('data.proof_available', true);
    $this->actingAs($this->stranger)->getJson($this->viewUrl)->assertNotFound();
    $this->actingAs($this->otherRider)->getJson($this->viewUrl)->assertNotFound();
    $this->actingAs($this->rider)->postJson($this->uploadUrl, ['photo' => DeliveryPhoto::file()])->assertUnprocessable();
});

it('re-encodes direct uploads and strips embedded metadata', function () {
    $image = imagecreatetruecolor(4, 4);
    ob_start();
    imagejpeg($image);
    $bytes = ob_get_clean();
    imagedestroy($image);
    $metadata = "Exif\0\0Private GPS coordinates";
    $bytes = substr($bytes, 0, 2)."\xFF\xE1".pack('n', strlen($metadata) + 2).$metadata.substr($bytes, 2);
    $photo = UploadedFile::fake()->createWithContent('private.jpg', $bytes);
    $this->actingAs($this->rider)->postJson($this->uploadUrl, ['photo' => $photo])->assertOk();
    $stored = DB::table('delivery_proofs')->where('delivery_id', $this->delivery->id)->first();
    expect($stored->mime_type)->toBe('image/jpeg');
    expect(base64_decode($stored->image_data))->not->toContain('Private GPS coordinates')->not->toBe($bytes);
});

it('rejects missing invalid oversized and unauthorized uploads', function () {
    $this->actingAs($this->rider)->postJson($this->uploadUrl)->assertUnprocessable();
    $this->postJson($this->uploadUrl, ['photo' => UploadedFile::fake()->createWithContent('fake.jpg', '<script>bad</script>')])->assertUnprocessable();
    $this->postJson($this->uploadUrl, ['photo' => DeliveryPhoto::file()->size(1025)])->assertUnprocessable();
    $this->actingAs($this->otherRider)->postJson($this->uploadUrl, ['photo' => DeliveryPhoto::file()])->assertForbidden();
    $this->actingAs($this->customer)->postJson($this->uploadUrl, ['photo' => DeliveryPhoto::file()])->assertForbidden();
    $this->assertDatabaseCount('delivery_proofs', 0);
});

it('allows replacement only in transit and never accepts a previous riders proof', function () {
    $this->delivery->update(['status' => 'picked_up']);
    $this->actingAs($this->rider)->postJson($this->uploadUrl, ['photo' => DeliveryPhoto::file()])->assertUnprocessable();
    $this->delivery->update(['status' => 'in_transit']);
    $this->postJson($this->uploadUrl, ['photo' => DeliveryPhoto::file()])->assertOk();
    $this->postJson($this->uploadUrl, ['photo' => DeliveryPhoto::file()])->assertOk();
    $this->assertDatabaseCount('delivery_proofs', 1);
    $this->delivery->update(['rider_user_id' => $this->otherRider->id]);
    $this->actingAs($this->otherRider)->patchJson($this->statusUrl, ['status' => 'delivered'])->assertUnprocessable()->assertJsonValidationErrors('photo');
});
