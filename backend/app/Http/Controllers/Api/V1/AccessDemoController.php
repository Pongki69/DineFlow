<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AccessDemoController extends Controller
{
    public function kitchenQueue(Request $request): JsonResponse
    {
        return response()->json(['data' => [], 'actor' => $request->user()->only('id', 'name')]);
    }

    public function financialSummary(Request $request): JsonResponse
    {
        return response()->json(['data' => [], 'actor' => $request->user()->only('id', 'name')]);
    }

    public function riderAssignments(Request $request): JsonResponse
    {
        return response()->json(['data' => [], 'actor' => $request->user()->only('id', 'name')]);
    }

    public function cashierPayments(Request $request): JsonResponse
    {
        return response()->json(['data' => [], 'actor' => $request->user()->only('id', 'name')]);
    }

    public function cashierSummary(Request $request): JsonResponse
    {
        return response()->json(['data' => [], 'actor' => $request->user()->only('id', 'name')]);
    }

    public function serviceTables(Request $request): JsonResponse
    {
        return response()->json(['data' => [], 'actor' => $request->user()->only('id', 'name')]);
    }

    public function operations(Request $request): JsonResponse
    {
        return response()->json(['data' => [], 'actor' => $request->user()->only('id', 'name')]);
    }

    public function adminSettings(Request $request): JsonResponse
    {
        return response()->json(['data' => [], 'actor' => $request->user()->only('id', 'name')]);
    }
}
