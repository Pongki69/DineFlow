<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Delivery;
use App\Models\User;
use App\Services\RiderReviewService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class RiderReviewController extends Controller
{
    public function save(Request $request, Delivery $delivery, RiderReviewService $service)
    {
        $data = $request->validate(['rating' => ['required', 'integer', 'between:1,5'], 'comment' => ['nullable', 'string', 'max:1000'], 'categories' => ['sometimes', 'array', 'max:4'], 'categories.*' => ['required', 'string', 'distinct', Rule::in(array_keys(RiderReviewService::CATEGORIES))], 'show_name' => ['sometimes', 'boolean']]);

        return response()->json(['message' => $request->isMethod('PATCH') ? 'Review updated.' : 'Thank you for rating your rider.', 'data' => $service->save($delivery, $request->user(), $data, $request->isMethod('PATCH'))]);
    }

    public function profile(Request $request, User $rider, RiderReviewService $service)
    {
        $request->validate(['page' => ['sometimes', 'integer', 'between:1,10000']]);

        return response()->json(['data' => $service->profile($rider, $request->user())]);
    }

    public function own(Request $request, RiderReviewService $service)
    {
        abort_unless($request->user()->hasRole('rider') && $request->user()->hasPermission('deliveries.assigned'), 403);
        $request->validate(['page' => ['sometimes', 'integer', 'between:1,10000']]);

        return response()->json(['data' => $service->profile($request->user(), $request->user())]);
    }
}
