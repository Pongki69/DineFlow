<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DeliveryAddress;
use App\Models\Order;
use App\Models\Reservation;
use App\Models\User;
use App\Services\CustomerAccountDeletion;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Customer accounts as administrators see them: who they are and what they've done. */
class AdminCustomerController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'search' => ['nullable', 'string', 'max:120'],
            'status' => ['nullable', 'in:active,inactive'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ]);
        $search = trim((string) ($data['search'] ?? ''));
        $orders = fn (Builder $query) => $query->where('status', '!=', 'cancelled');

        $customers = User::whereHas('roles', fn ($query) => $query->where('slug', 'customer'))
            ->when($search !== '', function ($query) use ($search) {
                $like = '%'.mb_strtolower($search).'%';
                $query->where(fn ($match) => $match->whereRaw('LOWER(name) LIKE ?', [$like])->orWhereRaw('LOWER(email) LIKE ?', [$like]));
            })
            ->when(($data['status'] ?? null) === 'active', fn ($query) => $query->where('is_active', true))
            ->when(($data['status'] ?? null) === 'inactive', fn ($query) => $query->where('is_active', false))
            ->withCount(['orders as orders_count' => $orders, 'reservations as reservations_count'])
            ->withSum(['orders as total_spent' => $orders], 'total')
            ->withMax('orders as last_order_at', 'created_at')
            ->with('customerProfile:id,user_id,phone')
            ->orderBy('name')
            ->paginate($data['per_page'] ?? 25, ['id', 'name', 'email', 'is_active', 'created_at']);

        $customers->getCollection()->transform(fn (User $user) => $this->summary($user));

        return response()->json($customers);
    }

    public function show(User $user): JsonResponse
    {
        abort_unless($user->hasRole('customer'), 404);
        $orders = fn (Builder $query) => $query->where('status', '!=', 'cancelled');
        $user->loadCount(['orders as orders_count' => $orders, 'reservations as reservations_count'])
            ->loadSum(['orders as total_spent' => $orders], 'total')
            ->loadMax('orders as last_order_at', 'created_at')
            ->load('customerProfile:id,user_id,phone');

        return response()->json(['data' => [
            ...$this->summary($user),
            'recent_orders' => Order::where('customer_id', $user->id)->latest()->limit(8)
                ->get(['id', 'order_number', 'order_type', 'status', 'total', 'created_at']),
            'reservations' => Reservation::where('customer_id', $user->id)->orderByDesc('starts_at')->limit(5)
                ->get(['id', 'reference', 'status', 'guest_count', 'starts_at']),
            'addresses' => DeliveryAddress::where('user_id', $user->id)->orderByDesc('is_default')->limit(5)
                ->get(['id', 'label', 'formatted_address', 'is_default']),
        ]]);
    }

    /** Deletes the account; orders and payments stay, without contact details. */
    public function destroy(Request $request, User $user, CustomerAccountDeletion $deletion): JsonResponse
    {
        abort_unless($user->hasRole('customer'), 404);
        $deletion->deleteByAdministrator($request->user(), $user, $request);

        return response()->json(['message' => 'Customer account deleted.']);
    }

    private function summary(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->customerProfile?->phone,
            'is_active' => (bool) $user->is_active,
            'joined_at' => $user->created_at?->toIso8601String(),
            'orders_count' => (int) $user->orders_count,
            'reservations_count' => (int) $user->reservations_count,
            'total_spent' => round((float) $user->total_spent, 2),
            'last_order_at' => $user->last_order_at ? \Illuminate\Support\Carbon::parse($user->last_order_at)->toIso8601String() : null,
        ];
    }
}
