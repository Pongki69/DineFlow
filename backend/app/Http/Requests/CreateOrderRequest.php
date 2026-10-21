<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class CreateOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();

        return $user && ($user->hasPermission('orders.create') || $user->hasPermission('orders.manage'));
    }

    public function rules(): array
    {
        return [
            'order_type' => ['required', 'in:dine_in,pickup,delivery'],
            'table_code' => ['required_if:order_type,dine_in', 'nullable', 'uuid'],
            'delivery_address' => ['required_if:order_type,delivery', 'nullable', 'string', 'max:2000'],
            'delivery_address_id' => ['nullable', 'integer', 'exists:delivery_addresses,id'],
            'delivery_latitude' => ['required_if:order_type,delivery', 'nullable', 'numeric', 'between:-90,90'],
            'delivery_longitude' => ['required_if:order_type,delivery', 'nullable', 'numeric', 'between:-180,180'],
            'delivery_instructions' => ['nullable', 'string', 'max:1000'],
            'delivery_recipient_name' => ['required_if:order_type,delivery', 'nullable', 'string', 'max:120'],
            'delivery_phone' => ['required_if:order_type,delivery', 'nullable', 'string', 'max:32'],
            'customer_notes' => ['nullable', 'string', 'max:2000'],
            'items' => ['required', 'array', 'min:1', 'max:50'],
            'items.*.menu_item_id' => ['required', 'integer', 'distinct', 'exists:menu_items,id'],
            'items.*.variant_id' => ['nullable', 'integer', 'exists:menu_item_variants,id'],
            'items.*.addon_ids' => ['sometimes', 'array', 'max:20'],
            'items.*.addon_ids.*' => ['integer', 'distinct', 'exists:menu_item_addons,id'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:99'],
            'items.*.special_instructions' => ['nullable', 'string', 'max:500'],
        ];
    }
}
