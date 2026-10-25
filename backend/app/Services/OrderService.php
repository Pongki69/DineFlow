<?php

namespace App\Services;

use App\Models\DiningSession;
use App\Models\DeliveryAddress;
use App\Models\Delivery;
use App\Models\DeliveryStatusHistory;
use App\Models\MenuItem;
use App\Models\Order;
use App\Models\OrderStatusHistory;
use App\Models\RestaurantSetting;
use App\Models\RestaurantTable;
use App\Models\Reservation;
use App\Models\RiderProfile;
use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class OrderService
{
    public function create(User $actor, array $data, DeliveryQuoteService $deliveryQuotes): Order
    {
        $delivery = null;
        if ($data['order_type'] === 'delivery') {
            $address = null;
            if (! empty($data['delivery_address_id'])) {
                $address = DeliveryAddress::where('user_id', $actor->id)->find($data['delivery_address_id']);
                if (! $address) throw ValidationException::withMessages(['delivery_address_id' => 'That saved delivery address does not belong to your account.']);
                $data['delivery_address'] = $address->formatted_address;
                $data['delivery_latitude'] = $address->latitude;
                $data['delivery_longitude'] = $address->longitude;
                $data['delivery_instructions'] = $data['delivery_instructions'] ?? $address->delivery_instructions;
                $data['delivery_recipient_name'] = $data['delivery_recipient_name'] ?? $address->recipient_name;
                $data['delivery_phone'] = $data['delivery_phone'] ?? $address->phone;
            }
            $delivery = $deliveryQuotes->quote((float) $data['delivery_latitude'], (float) $data['delivery_longitude'], 0);
        }

        $order = DB::transaction(function () use ($actor, $data, $delivery, $deliveryQuotes): Order {
            $session = null;
            $table = null;
            if ($data['order_type'] === 'dine_in') {
                $code = trim($data['table_code']);
                $reservation = null;
                if (! \Illuminate\Support\Str::isUuid($code)) {
                    $reservation = Reservation::where('reference', strtoupper($code))
                        ->where('customer_id', $actor->id)->lockForUpdate()->first();
                    if (! $reservation) {
                        throw ValidationException::withMessages(['table_code' => 'Choose your reservation or enter the table code supplied by staff.']);
                    }
                    if ($reservation->status !== 'seated') {
                        $message = in_array($reservation->status, ['pending', 'confirmed', 'checked_in'], true)
                            ? 'Your reservation is not seated yet. Ask staff to seat your party before placing a dine-in order.'
                            : 'This reservation is no longer active. Choose your current booking or ask staff for your table code.';
                        throw ValidationException::withMessages(['table_code' => $message]);
                    }
                }
                $tableQuery = RestaurantTable::query()->where('is_active', true);
                $table = ($reservation ? $tableQuery->whereKey($reservation->table_id) : $tableQuery->where('qr_code', $code))->lockForUpdate()->first();
                if (! $table) {
                    throw ValidationException::withMessages(['table_code' => 'This table code is invalid or inactive.']);
                }
                $session = DiningSession::query()->where('table_id', $table->id)->where('status', 'open')->lockForUpdate()->first();
                if (! $session || ($reservation && $session->reservation_id !== $reservation->id)) {
                    throw ValidationException::withMessages(['table_code' => 'This table does not have an open dining session. Ask a staff member for help.']);
                }
            }

            $rows = [];
            $subtotal = 0;
            $discountTotal = 0;
            foreach ($data['items'] as $line) {
                $item = MenuItem::query()->with('category:id,name,is_active')->whereKey($line['menu_item_id'])->lockForUpdate()->first();
                if (! $item || ! $item->is_currently_available || ! $item->category?->is_active) {
                    throw ValidationException::withMessages(['items' => 'One or more selected menu items are unavailable. Review your cart and try again.']);
                }

                $variant = null;
                if (! empty($line['variant_id'])) {
                    $variant = $item->variants()->whereKey($line['variant_id'])->where('is_active', true)->first();
                    if (! $variant) {
                        throw ValidationException::withMessages(['items' => "A selected option for {$item->name} is unavailable."]);
                    }
                }

                $addonIds = $line['addon_ids'] ?? [];
                $addons = $addonIds === [] ? collect() : $item->addons()->whereIn('id', $addonIds)->where('is_active', true)->get();
                if ($addons->count() !== count($addonIds)) {
                    throw ValidationException::withMessages(['items' => "A selected add-on for {$item->name} is unavailable."]);
                }

                $quantity = (int) $line['quantity'];
                $baseCents = $this->cents($item->base_price);
                $variantCents = $variant ? $this->cents($variant->price_adjustment) : 0;
                $discountBasis = (int) round(((float) $item->discount_percent) * 100);
                $discountCents = $this->percent($baseCents + $variantCents, $quantity, $discountBasis);
                $addonCents = $addons->sum(fn ($addon) => $this->cents($addon->price)) * $quantity;
                $productCents = ($baseCents + $variantCents) * $quantity;
                $lineSubtotal = $productCents + $addonCents;
                $subtotal += $lineSubtotal;
                $discountTotal += $discountCents;
                $rows[] = [
                    'item' => $item, 'variant' => $variant, 'addons' => $addons, 'quantity' => $quantity,
                    'special_instructions' => $line['special_instructions'] ?? null,
                    'base_cents' => $baseCents, 'variant_cents' => $variantCents,
                    'discount_cents' => $discountCents, 'line_cents' => $lineSubtotal - $discountCents,
                ];
            }

            $net = $subtotal - $discountTotal;
            if ($data['order_type'] === 'delivery') {
                $minimum = (int) round(((float) ($deliveryQuotes->policy()['minimum_order'] ?? 0)) * 100);
                if ($net < $minimum) throw ValidationException::withMessages(['items' => 'The delivery minimum order is ₱'.number_format($minimum / 100, 2).'.']);
                $delivery = $deliveryQuotes->priceRoute($delivery, $net);
            }
            $serviceRate = $data['order_type'] === 'dine_in' ? $this->settingRate('service_charge_percent') : 0;
            $taxRate = $this->settingRate('tax_percent');
            $serviceCharge = $this->percent($net, 1, $serviceRate);
            $deliveryFee = $data['order_type'] === 'delivery' ? $this->cents($delivery['delivery_fee']) : 0;
            $tax = $this->percent($net + $serviceCharge, 1, $taxRate);
            $total = $net + $serviceCharge + $deliveryFee + $tax;

            $order = Order::create([
                'order_number' => $this->orderNumber(), 'customer_id' => $actor->id,
                'customer_name_snapshot' => $actor->name, 'customer_email_snapshot' => $actor->email,
                'order_type' => $data['order_type'], 'status' => 'pending',
                'table_id' => $table?->id, 'table_number_snapshot' => $table?->table_number,
                'dining_session_id' => $session?->id, 'delivery_address' => $data['delivery_address'] ?? null,
                'delivery_address_id' => $data['delivery_address_id'] ?? null,
                'delivery_latitude' => $data['delivery_latitude'] ?? null, 'delivery_longitude' => $data['delivery_longitude'] ?? null,
                'delivery_instructions' => $data['delivery_instructions'] ?? null,
                'delivery_recipient_name' => $data['delivery_recipient_name'] ?? null, 'delivery_phone' => $data['delivery_phone'] ?? null,
                'delivery_distance_km' => $delivery['distance_km'] ?? null, 'delivery_duration_minutes' => $delivery['duration_minutes'] ?? null,
                'customer_notes' => $data['customer_notes'] ?? null,
                'subtotal' => $this->money($subtotal), 'item_discount_total' => $this->money($discountTotal),
                'service_charge' => $this->money($serviceCharge), 'delivery_fee' => $this->money($deliveryFee),
                'tax' => $this->money($tax), 'total' => $this->money($total), 'currency' => 'PHP',
            ]);

            foreach ($rows as $row) {
                $item = $row['item'];
                $orderItem = $order->items()->create([
                    'menu_item_id' => $item->id, 'category_id' => $item->category_id,
                    'item_name_snapshot' => $item->name, 'category_name_snapshot' => $item->category?->name,
                    'variant_name_snapshot' => $row['variant']?->name,
                    'base_unit_price' => $this->money($row['base_cents']),
                    'variant_price_adjustment' => $this->money($row['variant_cents']),
                    'discount_percent' => $item->discount_percent, 'discount_total' => $this->money($row['discount_cents']),
                    'quantity' => $row['quantity'], 'line_total' => $this->money($row['line_cents']),
                    'special_instructions' => $row['special_instructions'],
                ]);
                foreach ($row['addons'] as $addon) {
                    $unitCents = $this->cents($addon->price);
                    $orderItem->addons()->create([
                        'menu_item_addon_id' => $addon->id, 'addon_name_snapshot' => $addon->name,
                        'unit_price' => $this->money($unitCents), 'quantity' => $row['quantity'],
                        'line_total' => $this->money($unitCents * $row['quantity']),
                    ]);
                }
            }

            $order->statusHistory()->create(['actor_id' => $actor->id, 'from_status' => null, 'to_status' => 'pending']);

            if ($order->order_type === 'delivery') {
                $pickup = $deliveryQuotes->location();
                $delivery = Delivery::create(['order_id' => $order->id, 'status' => 'pending_assignment', 'pickup_latitude' => $pickup['latitude'] ?? null, 'pickup_longitude' => $pickup['longitude'] ?? null, 'pickup_address' => $pickup['address'] ?? null]);
                DeliveryStatusHistory::create(['delivery_id' => $delivery->id, 'actor_id' => $actor->id, 'from_status' => null, 'to_status' => 'pending_assignment']);
            }

            return $order->load(['items.addons', 'table:id,table_number', 'diningSession:id,status', 'delivery:id,order_id,status']);
        }, 3);

        app(RestaurantNotificationService::class)->send($actor, 'order.placed', 'Order received', 'Your order '.$order->order_number.' has been received.', ['order_id' => $order->id, 'order_number' => $order->order_number]);
        return $order;
    }

    public function transition(Order $order, User $actor, string $to, ?string $note = null, ?int $prepMinutes = null, ?string $vehicle = null): Order
    {
        $order = DB::transaction(function () use ($order, $actor, $to, $note, $prepMinutes, $vehicle): Order {
            if ($order->order_type === 'delivery') DispatchGuard::lock();
            $locked = Order::query()->whereKey($order->id)->lockForUpdate()->firstOrFail();
            $isOwnerCancellation = $to === 'cancelled' && $locked->customer_id === $actor->id && $locked->status === 'pending';
            $isKitchenUpdate = $actor->hasPermission('kitchen.orders.update') && ! $actor->hasPermission('orders.manage');
            if ($isKitchenUpdate) {
                if (! in_array($to, ['preparing', 'ready_to_serve'], true)) {
                    throw new AuthorizationException('Kitchen staff can only update preparation statuses.');
                }
            } elseif (! $actor->hasPermission('orders.manage') && ! $isOwnerCancellation) {
                throw new AuthorizationException('You are not authorized to update this order.');
            }

            $allowed = [
                'pending' => ['confirmed', 'cancelled'],
                'confirmed' => ['preparing', 'cancelled'],
                'preparing' => ['ready_to_serve', 'cancelled'],
                'ready_to_serve' => $locked->order_type === 'dine_in' ? ['served'] : ($locked->order_type === 'delivery' ? [] : ['completed']),
                'served' => $locked->order_type === 'dine_in' ? ['completed'] : [],
                'completed' => [], 'cancelled' => [],
            ];
            if (! in_array($to, $allowed[$locked->status] ?? [], true)) {
                throw ValidationException::withMessages(['status' => "The order cannot move from {$locked->status} to {$to}."]);
            }
            if ($to === 'cancelled' && $locked->payments()->where('status', 'paid')->exists()) {
                throw ValidationException::withMessages(['status' => 'A paid order must be refunded through the payment workflow before it can be cancelled.']);
            }
            if ($to === 'cancelled' && $locked->paymentAllocations()->whereHas('payment', fn ($query) => $query->where('status', 'paid'))->exists()) {
                throw ValidationException::withMessages(['status' => 'A paid dining-session bill must be refunded through the payment workflow before this order can be cancelled.']);
            }

            $from = $locked->status;
            $locked->status = $to;
            if ($locked->order_type === 'delivery' && in_array($to, ['confirmed', 'preparing'], true)) {
                if (! $locked->prep_ready_at || $prepMinutes !== null) {
                    $locked->prep_minutes = $prepMinutes ?? 15;
                    $locked->prep_ready_at = now()->addMinutes($locked->prep_minutes);
                }
                if ($vehicle !== null) $locked->delivery_vehicle_class = $vehicle;
            }
            if ($locked->order_type === 'delivery' && $to === 'ready_to_serve') $locked->prep_ready_at = now();
            if ($to === 'confirmed') $locked->confirmed_at = now();
            if ($to === 'completed') $locked->completed_at = now();
            if ($to === 'cancelled') $locked->cancelled_at = now();
            $locked->save();
            $locked->statusHistory()->create(['actor_id' => $actor->id, 'from_status' => $from, 'to_status' => $to, 'note' => $note]);
            if ($locked->order_type === 'delivery') {
                $delivery = Delivery::where('order_id', $locked->id)->lockForUpdate()->first();
                if ($delivery && ! in_array($delivery->status, Delivery::TERMINAL, true)) {
                    if ($to === 'cancelled') {
                        app(DispatchService::class)->withdraw($delivery->id);
                        $delivery->statusHistory()->create(['actor_id' => $actor->id, 'from_status' => $delivery->status, 'to_status' => 'cancelled', 'reason' => 'Order cancelled.']);
                        $delivery->update(['status' => 'cancelled', 'dispatch_status' => 'cancelled', 'cancelled_at' => now()]);
                        if ($delivery->rider_user_id && ! Delivery::where('rider_user_id', $delivery->rider_user_id)->whereNotIn('status', Delivery::TERMINAL)->exists()) RiderProfile::where('user_id', $delivery->rider_user_id)->update(['is_available' => true]);
                    } elseif ($delivery->status === 'pending_assignment') {
                        if ($prepMinutes !== null || $vehicle !== null) app(DispatchService::class)->withdraw($delivery->id);
                        if (! $delivery->offers()->whereNotNull('active_delivery_id')->exists()) $delivery->update(['dispatch_status' => 'scheduled', 'next_dispatch_at' => now(), 'search_stage_started_at' => null]);
                    }
                }
            }


            return $locked;
        }, 3);

        app(AuditLogService::class)->record($actor, 'order.status_changed', $order, ['status' => $order->status], request());
        if ($order->order_type === 'delivery' && $order->delivery) {
            $delivery = $order->delivery;
            DB::afterCommit(function () use ($delivery) {
                try {
                    broadcast(new \App\Events\DeliveryTrackingUpdated($delivery->fresh()));
                } catch (\Throwable $exception) {
                    report($exception);
                }
            });
        }


        app(RestaurantNotificationService::class)->send($order->customer, 'order.status_changed', 'Order update', 'Order '.$order->order_number.' is now '.str_replace('_', ' ', $order->status).'.', ['order_id' => $order->id, 'order_number' => $order->order_number, 'status' => $order->status]);

        return $order->load(['items.addons', 'table:id,table_number']);
    }

    private function settingRate(string $key): int
    {
        $value = RestaurantSetting::where('key', $key)->first()?->value ?? [];

        return (int) round(((float) ($value['rate'] ?? 0)) * 100);
    }

    private function settingAmount(string $key): int
    {
        $value = RestaurantSetting::where('key', $key)->first()?->value ?? [];

        return $this->cents($value['amount'] ?? 0);
    }

    private function cents(string|int|float $amount): int
    {
        return (int) round(((float) $amount) * 100);
    }

    private function percent(int $amountCents, int $quantity, int $basisPoints): int
    {
        return intdiv(($amountCents * $quantity * $basisPoints) + 5000, 10000);
    }

    private function money(int $cents): string
    {
        return number_format($cents / 100, 2, '.', '');
    }

    private function orderNumber(): string
    {
        do {
            $number = 'DF'.now()->format('ymd').strtoupper(bin2hex(random_bytes(4)));
        } while (Order::where('order_number', $number)->exists());

        return $number;
    }
}
