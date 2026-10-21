<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

class IdempotentSubmission
{
    public function handle(Request $request, Closure $next): Response
    {
        $key = $request->header('Idempotency-Key');
        if ($key === null) {
            return $next($request);
        }
        if (! preg_match('/^[A-Za-z0-9._:-]{8,128}$/D', $key)) {
            return response()->json(['code' => 'invalid_idempotency_key', 'message' => 'Idempotency-Key must contain 8–128 letters, numbers, dots, colons, underscores or hyphens.'], 422);
        }
        $identity = ['user_id' => $request->user()->id, 'scope' => hash('sha256', $request->method().' '.$request->path()), 'key' => $key];
        $hash = hash('sha256', json_encode($this->canonical($request->all()), JSON_THROW_ON_ERROR));

        return DB::transaction(function () use ($request, $next, $identity, $hash): Response {
            DB::table('idempotency_requests')->insertOrIgnore($identity + ['request_hash' => $hash, 'expires_at' => now()->addDay()]);
            $record = DB::table('idempotency_requests')->where($identity)->lockForUpdate()->first();
            if ($record->expires_at <= now()->toDateTimeString()) {
                DB::table('idempotency_requests')->where('id', $record->id)->update(['request_hash' => $hash, 'status' => null, 'response_body' => null, 'expires_at' => now()->addDay()]);
                $record->request_hash = $hash;
                $record->status = null;
            }
            if (! hash_equals($record->request_hash, $hash)) {
                return response()->json(['code' => 'idempotency_conflict', 'message' => 'This submission key was already used with different details. Start a new submission.'], 409);
            }
            if ($record->status !== null) {
                return response($record->response_body, $record->status, ['Content-Type' => 'application/json', 'Idempotency-Replayed' => 'true']);
            }
            $response = $next($request);
            if ($response->isSuccessful()) {
                DB::table('idempotency_requests')->where('id', $record->id)->update(['status' => $response->getStatusCode(), 'response_body' => $response->getContent()]);
            } else {
                DB::table('idempotency_requests')->where('id', $record->id)->delete();
            }

            return $response;
        }, 3);
    }

    private function canonical(array $data): array
    {
        if (! array_is_list($data)) {
            ksort($data);
        }
        foreach ($data as &$value) {
            if (is_array($value)) {
                $value = $this->canonical($value);
            }
        }

        return $data;
    }
}
