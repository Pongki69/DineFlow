<?php

namespace App\Services;

use App\Models\Delivery;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class RiderReviewService
{
    public const CATEGORIES = ['delivery_time' => 'On-time delivery', 'communication' => 'Good communication', 'handling' => 'Careful handling', 'professionalism' => 'Friendly service'];

    public static function maskedName(string $name): string
    {
        $first = preg_split('/\s+/u', trim($name))[0] ?? '';
        if ($first === '') {
            return 'Customer';
        }
        if (mb_strlen($first) <= 3) {
            return mb_substr($first, 0, 1).'*****';
        }

        return mb_substr($first, 0, 2).'*****'.mb_substr($first, -1);
    }

    public function save(Delivery $delivery, User $customer, array $data, bool $editing = false): array
    {
        return DB::transaction(function () use ($delivery, $customer, $data, $editing) {
            DispatchGuard::lock();
            $locked = Delivery::whereKey($delivery->id)->lockForUpdate()->firstOrFail();
            abort_unless($locked->status === 'delivered' && $locked->rider_user_id && $locked->order()->where('customer_id', $customer->id)->exists(), 404);
            $existing = DB::table('delivery_ratings')->where('delivery_id', $locked->id)->first();
            if ($existing && ! $editing) {
                throw ValidationException::withMessages(['rating' => 'You have already rated this delivery.']);
            }
            if ($editing && (! $existing || $existing->customer_id !== $customer->id)) {
                abort(404);
            }
            $values = ['rating' => $data['rating'], 'comment' => trim($data['comment'] ?? '') ?: null, 'categories' => json_encode(array_values($data['categories'] ?? [])), 'show_name' => $data['show_name'] ?? false, 'updated_at' => now()];
            if ($existing) {
                DB::table('delivery_ratings')->where('id', $existing->id)->update($values);
            } else {
                DB::table('delivery_ratings')->insert($values + ['delivery_id' => $locked->id, 'rider_user_id' => $locked->rider_user_id, 'customer_id' => $customer->id, 'created_at' => now()]);
            }

            return $this->ownReview($locked->id);
        }, 3);
    }

    public function ownReview(int $deliveryId): ?array
    {
        $review = DB::table('delivery_ratings')->where('delivery_id', $deliveryId)->first();

        return $review ? ['rating' => (int) $review->rating, 'comment' => $review->comment, 'categories' => json_decode($review->categories ?? '[]', true) ?: [], 'show_name' => (bool) $review->show_name] : null;
    }

    public function profile(User $rider, User $viewer): array
    {
        abort_unless($rider->is_active && $rider->hasRole('rider'), 404);
        abort_unless($viewer->hasRole('customer') || $viewer->id === $rider->id || $viewer->hasPermission('deliveries.manage'), 404);
        $ratings = DB::table('delivery_ratings')->where('rider_user_id', $rider->id);
        $breakdown = (clone $ratings)->selectRaw('rating, count(*) as total')->groupBy('rating')->pluck('total', 'rating');
        $reviews = (clone $ratings)->join('users', 'users.id', '=', 'delivery_ratings.customer_id')
            ->select(['delivery_ratings.id', 'delivery_ratings.rating', 'delivery_ratings.comment', 'delivery_ratings.categories', 'delivery_ratings.show_name', 'delivery_ratings.created_at', 'users.name as reviewer_name'])
            ->orderByDesc('delivery_ratings.created_at')->orderByDesc('delivery_ratings.id')->paginate(10);

        return [
            'rider' => ['id' => $rider->id, 'name' => $rider->name, 'vehicle_type' => $rider->riderProfile?->vehicle_type, 'joined_at' => $rider->created_at?->format('Y-m'), 'delivered_total' => Delivery::where('rider_user_id', $rider->id)->where('status', 'delivered')->count()],
            'summary' => ['average' => (clone $ratings)->avg('rating'), 'count' => (clone $ratings)->count(), 'breakdown' => collect(range(5, 1))->map(fn ($stars) => ['stars' => $stars, 'count' => (int) ($breakdown[$stars] ?? 0)])->all()],
            'categories' => self::CATEGORIES,
            'reviews' => $reviews->getCollection()->map(fn ($review) => ['id' => $review->id, 'display_name' => $review->show_name ? $review->reviewer_name : self::maskedName($review->reviewer_name), 'name_hidden' => ! (bool) $review->show_name, 'rating' => (int) $review->rating, 'comment' => $review->comment, 'categories' => json_decode($review->categories ?? '[]', true) ?: [], 'created_at' => Carbon::parse($review->created_at)->toIso8601String()])->all(),
            'meta' => ['current_page' => $reviews->currentPage(), 'last_page' => $reviews->lastPage(), 'total' => $reviews->total()],
        ];
    }
}
