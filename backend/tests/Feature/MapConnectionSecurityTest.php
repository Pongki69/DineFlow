<?php

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;

uses(RefreshDatabase::class);

it('returns safe address-search and reverse-lookup errors instead of key-bearing transport exceptions', function () {
    config(['services.maps.provider' => 'geoapify', 'services.maps.geoapify_key' => 'test-private-provider-key']);
    Http::preventStrayRequests();
    Http::fake(fn () => Http::failedConnection('cURL error 60: https://api.geoapify.com/v1/geocode/search?apiKey=test-private-provider-key'));
    $user = User::create(['name' => 'Map test user', 'email' => 'map-test@example.test', 'password' => 'Test-Password-123!', 'is_active' => true]);
    $this->actingAs($user);
    foreach (['/api/v1/maps/search?q=Bay%20Laguna', '/api/v1/maps/reverse?latitude=14.18&longitude=121.23'] as $url) {
        $response = $this->getJson($url)->assertServiceUnavailable()
            ->assertJsonPath('message', 'The map service could not connect securely. Please try again, or enter the address manually.');
        expect($response->getContent())->not->toContain('apiKey', 'test-private-provider-key', 'cURL', 'https://');
    }
});
