<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ApiErrorCode
{
    public function handle(Request $request, Closure $next): Response
    {
        return self::normalize($next($request));
    }

    public static function normalize(Response $response): Response
    {
        $status = $response->getStatusCode();
        if ($status < 400) {
            return $response;
        }
        $body = json_decode($response->getContent(), true) ?? [];
        $body['message'] ??= Response::$statusTexts[$status] ?? 'Request failed.';
        $body['code'] ??= match ($status) {
            401 => 'unauthenticated', 403 => 'forbidden', 404 => 'not_found', 409 => 'conflict',
            419 => 'session_expired', 422 => 'validation_failed', 429 => 'rate_limited', default => 'request_failed',
        };
        $response->setContent(json_encode($body));
        $response->headers->set('Content-Type', 'application/json');

        return $response;
    }
}
