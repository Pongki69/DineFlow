<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Delivery;
use App\Models\DiningSession;
use App\Models\MenuCategory;
use App\Models\MenuItem;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Reservation;
use App\Models\RestaurantFloor;
use App\Models\RestaurantTable;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * Turns audit rows into plain sentences ("Recorded ₱1,285.00 cash for Table 2")
 * grouped by workspace area, so anyone can see who did what, and when.
 */
class ActivityLogPresenter
{
    /** Areas in the order they are checked; the first match wins. */
    public const AREAS = [
        'kitchen' => ['order.recalled_to_kitchen', 'kitchen.%', 'menu.item_sold_out_changed'],
        'orders' => ['order.%'],
        'cashier' => ['payment.%', 'cashier.%'],
        'tables' => ['dining_session.%', 'bill.%', 'table.%'],
        'bookings' => ['reservation.%'],
        'delivery' => ['delivery.%', 'rider.%'],
        'menu' => ['menu.%'],
        'setup' => ['floor_plan.%', 'restaurant.%', 'business.%'],
        'accounts' => ['account.%', 'auth.%', 'staff.%', 'customer.%'],
    ];

    public static function areaOf(string $event): string
    {
        foreach (self::AREAS as $area => $patterns) {
            foreach ($patterns as $pattern) {
                if (str_ends_with($pattern, '%') ? str_starts_with($event, rtrim($pattern, '%')) : $event === $pattern) {
                    return $area;
                }
            }
        }

        return 'other';
    }

    /** Limits a query to one area, leaving out events an earlier area claims. */
    public static function whereArea(Builder $query, string $area): Builder
    {
        $areas = array_keys(self::AREAS);
        $index = array_search($area, $areas, true);
        if ($index === false) {
            return $query;
        }
        $like = fn (Builder $q, array $patterns) => $q->where(function ($match) use ($patterns) {
            foreach ($patterns as $pattern) {
                str_ends_with($pattern, '%') ? $match->orWhere('event', 'like', $pattern) : $match->orWhere('event', $pattern);
            }
        });
        $like($query, self::AREAS[$area]);
        foreach (array_slice($areas, 0, $index) as $earlier) {
            $query->whereNot(fn ($q) => $like($q, self::AREAS[$earlier]));
        }

        return $query;
    }

    /** @param  Collection<int, AuditLog>  $logs */
    public function present(Collection $logs): array
    {
        $labels = $this->labels($logs);

        return $logs->map(function (AuditLog $log) use ($labels) {
            $label = $labels[$log->subject_type][$log->subject_id] ?? null;
            $role = $log->actor?->roles?->first();

            return [
                'id' => $log->id,
                'event' => $log->event,
                'area' => self::areaOf($log->event),
                'summary' => $this->summary($log, $label),
                'subject_label' => $label,
                'actor' => $log->actor ? ['id' => $log->actor->id, 'name' => $log->actor->name, 'role' => $role?->name] : null,
                'ip_address' => $log->ip_address,
                'created_at' => $log->created_at?->toIso8601String(),
            ];
        })->all();
    }

    /** One query per subject type for readable names: order numbers, tables, dishes. */
    private function labels(Collection $logs): array
    {
        $resolvers = [
            Order::class => fn ($ids) => Order::whereIn('id', $ids)->pluck('order_number', 'id'),
            Payment::class => fn ($ids) => Payment::with('order:id,order_number')->whereIn('id', $ids)->get()
                ->mapWithKeys(fn ($p) => [$p->id => $p->order?->order_number ?? $p->reference_number]),
            Delivery::class => fn ($ids) => Delivery::with('order:id,order_number')->whereIn('id', $ids)->get()
                ->mapWithKeys(fn ($d) => [$d->id => $d->order?->order_number]),
            DiningSession::class => fn ($ids) => DiningSession::with('table:id,table_number')->whereIn('id', $ids)->get()
                ->mapWithKeys(fn ($s) => [$s->id => $s->table?->table_number]),
            Reservation::class => fn ($ids) => Reservation::whereIn('id', $ids)->pluck('reference', 'id'),
            RestaurantTable::class => fn ($ids) => RestaurantTable::whereIn('id', $ids)->pluck('table_number', 'id'),
            MenuItem::class => fn ($ids) => MenuItem::withTrashed()->whereIn('id', $ids)->pluck('name', 'id'),
            MenuCategory::class => fn ($ids) => MenuCategory::whereIn('id', $ids)->pluck('name', 'id'),
            RestaurantFloor::class => fn ($ids) => RestaurantFloor::whereIn('id', $ids)->pluck('name', 'id'),
            User::class => fn ($ids) => User::whereIn('id', $ids)->pluck('name', 'id'),
        ];
        $labels = [];
        foreach ($logs->whereNotNull('subject_type')->groupBy('subject_type') as $type => $rows) {
            $type = $this->modelClass($type);
            if (! isset($resolvers[$type])) {
                continue;
            }
            try {
                $found = $resolvers[$type]($rows->pluck('subject_id')->unique()->values())->all();
            } catch (\Throwable) {
                $found = [];
            }
            foreach ($rows as $row) {
                $labels[$row->subject_type][$row->subject_id] = $found[$row->subject_id] ?? null;
            }
        }

        return $labels;
    }

    private function modelClass(string $type): string
    {
        return \Illuminate\Database\Eloquent\Relations\Relation::getMorphedModel($type) ?? $type;
    }

    private function summary(AuditLog $log, ?string $label): string
    {
        $m = $log->metadata ?? [];
        $thing = $label ?: ($m['order_number'] ?? $m['name'] ?? null);
        $peso = fn ($value) => '₱'.number_format((float) $value, 2);
        $nice = fn ($value) => ucfirst(str_replace('_', ' ', (string) $value));
        $for = $thing ? " for {$thing}" : '';

        return match ($log->event) {
            'auth.login' => 'Signed in',
            'auth.logout' => 'Signed out',
            'order.placed' => 'Placed order '.($thing ?? ''),
            'order.status_changed' => 'Marked '.($thing ?? 'an order').' '.strtolower($nice($m['status'] ?? 'updated')),
            'order.recalled_to_kitchen' => 'Sent '.($thing ?? 'an order').' back to the kitchen',
            'kitchen.item_prepared' => 'Ticked off '.($m['quantity'] ?? 1).'× '.($m['dish'] ?? 'a dish').($thing ? " on {$thing}" : ''),
            'kitchen.item_unprepared' => 'Unticked '.($m['quantity'] ?? 1).'× '.($m['dish'] ?? 'a dish').($thing ? " on {$thing}" : ''),
            'payment.cash_received' => 'Recorded '.$peso($m['amount'] ?? 0).' cash'.$for,
            'payment.checkout_created' => 'Started an online payment of '.$peso($m['amount'] ?? 0).$for,
            'payment.refunded' => 'Refunded a payment'.$for.(! empty($m['reason']) ? ' · '.$nice($m['reason']) : ''),
            'payment.cancelled' => 'Cancelled a payment'.$for,
            'payment.special_discount_applied' => 'Applied a Senior/PWD discount'.$for,
            'payment.special_discount_removed' => 'Removed a Senior/PWD discount'.$for,
            'cashier.shift_opened' => 'Opened the cash drawer with '.$peso($m['opening_float'] ?? 0),
            'cashier.shift_closed' => 'Closed the cash drawer · counted '.$peso($m['counted_cash'] ?? 0).', expected '.$peso($m['expected_cash'] ?? 0),
            'dining_session.opened' => 'Seated guests at '.($thing ?? 'a table'),
            'dining_session.closed' => 'Cleared '.($thing ?? 'a table'),
            'bill.requested' => 'Asked the cashier for the bill'.$for,
            'table.occupancy_changed' => 'Set '.($thing ?? 'a table').' to '.strtolower($nice($m['operational_status'] ?? $m['status'] ?? 'updated')),
            'reservation.created' => 'Created booking '.($thing ?? ''),
            'reservation.status_changed' => 'Changed booking '.($thing ?? '').' to '.strtolower($nice($m['to'] ?? 'updated')),
            'delivery.status_changed' => 'Marked delivery '.($thing ?? '').' '.strtolower($nice($m['status'] ?? 'updated')),
            'delivery.assigned' => 'Assigned delivery '.($thing ?? '').' to a rider',
            'delivery.recovered' => 'Took back delivery '.($thing ?? '').' from its rider',
            'delivery.assignment_accept', 'delivery.offer_accepted' => 'Accepted delivery '.($thing ?? ''),
            'delivery.assignment_reject', 'delivery.offer_declined' => 'Declined delivery '.($thing ?? ''),
            'rider.went_online' => 'Went online for delivery offers',
            'rider.went_offline' => 'Went offline',
            'menu.item_sold_out_changed' => 'Marked '.($thing ?? 'a dish').' '.(! empty($m['is_sold_out']) ? 'sold out' : 'back in stock'),
            'menu.item_created' => 'Added dish '.($thing ?? ''),
            'menu.item_updated' => 'Edited dish '.($thing ?? ''),
            'menu.item_deleted' => 'Removed dish '.($thing ?? ''),
            'account.activated' => 'Reactivated the account of '.($thing ?? 'a user'),
            'account.deactivated' => 'Deactivated the account of '.($thing ?? 'a user'),
            'account.role_assigned' => 'Changed the role of '.($thing ?? 'a user').' to '.strtolower($nice($m['role'] ?? '')),
            'staff.created' => 'Created a staff account for '.($thing ?? 'someone'),
            'customer.deleted' => 'Deleted a customer account',
            'account.updated' => ! empty($m['password_changed']) ? 'Changed their password' : 'Updated their profile',
            default => $nice(str_replace('.', ' · ', $log->event)).($thing ? " · {$thing}" : ''),
        };
    }
}
