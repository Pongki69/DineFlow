<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use RuntimeException;

class PayMongoGateway
{
    private function request()
    {
        $secret = config('services.paymongo.secret');
        if (! $secret) throw new RuntimeException('Online payments are not configured. Add a PayMongo test key to the server environment.');
        return Http::baseUrl('https://api.paymongo.com')->withBasicAuth($secret, '')->acceptJson()->asJson()->timeout(15);
    }

    public function checkout(array $attributes, string $idempotencyKey): array
    {
        $response = $this->request()->withHeaders(['Idempotency-Key' => $idempotencyKey])->post('/v2/checkout_sessions', ['data' => ['attributes' => $attributes]]);
        if (! $response->successful()) throw new RuntimeException('PayMongo could not create a checkout session. Review the enabled payment methods and try again.');
        return $response->json('data', []);
    }

    public function expire(string $sessionId): array
    {
        $response = $this->request()->post('/v2/checkout_sessions/'.rawurlencode($sessionId).'/expire', ['data' => ['attributes' => (object) []]]);
        if (! $response->successful()) throw new RuntimeException('PayMongo did not confirm that this checkout could be cancelled. Its payment status remains pending until verified.');
        return $response->json('data', []);
    }

    public function retrieve(string $sessionId): array
    {
        $response = $this->request()->get('/v2/checkout_sessions/'.rawurlencode($sessionId));
        if (! $response->successful()) throw new RuntimeException('PayMongo could not verify this checkout session.');
        return $response->json('data', []);
    }

    public function refund(string $providerPaymentId, int $amountCents, string $reason, string $idempotencyKey): array
    {
        $response = $this->request()->withHeaders(['Idempotency-Key' => $idempotencyKey])->post('/v1/refunds', ['data' => ['attributes' => [
            'payment_id' => $providerPaymentId, 'amount' => $amountCents, 'currency' => 'PHP', 'reason' => $reason,
        ]]]);
        if (! $response->successful()) throw new RuntimeException('PayMongo did not accept the refund request. The payment remains paid.');
        return $response->json('data', []);
    }

    public function verifySignature(string $rawBody, ?string $header, bool $liveMode): bool
    {
        $secret = config('services.paymongo.webhook_secret');
        if (! $secret || ! $header) return false;
        $parts = [];
        foreach (explode(',', $header) as $part) {
            [$key, $value] = array_pad(explode('=', trim($part), 2), 2, '');
            $parts[$key] = $value;
        }
        $timestamp = $parts['t'] ?? '';
        $actual = $parts[$liveMode ? 'li' : 'te'] ?? '';
        if (! ctype_digit($timestamp) || abs(time() - (int) $timestamp) > 300 || ! preg_match('/^[a-f0-9]{64}$/i', $actual)) return false;
        $expected = hash_hmac('sha256', $timestamp.'.'.$rawBody, $secret);
        return hash_equals(strtolower($expected), strtolower($actual));
    }
}
