<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class MenuItemRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->hasPermission('menu.manage') ?? false;
    }

    public function rules(): array
    {
        $item = $this->route('item');
        $itemId = is_object($item) ? $item->getKey() : $item;

        return [
            'category_id' => ['required', 'integer', 'exists:menu_categories,id'],
            'name' => ['required', 'string', 'max:140'],
            'sku' => ['nullable', 'string', 'max:64', Rule::unique('menu_items', 'sku')->ignore($itemId)],
            'description' => ['nullable', 'string', 'max:5000'],
            'image' => ['sometimes', 'nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
            'base_price' => ['required', 'numeric', 'min:0', 'max:99999999.99', 'decimal:0,2'],
            'discount_percent' => ['sometimes', 'numeric', 'min:0', 'max:100', 'decimal:0,2'],
            'is_active' => ['sometimes', 'boolean'],
            'is_available' => ['sometimes', 'boolean'],
            'is_sold_out' => ['sometimes', 'boolean'],
            'available_from' => ['nullable', 'date'],
            'available_until' => ['nullable', 'date', 'after:available_from'],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:65535'],
            'variants' => ['sometimes', 'array', 'max:20'],
            'variants.*.name' => ['required_with:variants', 'string', 'max:100'],
            'variants.*.price_adjustment' => ['required_with:variants', 'numeric', 'min:0', 'max:99999999.99', 'decimal:0,2'],
            'variants.*.is_active' => ['sometimes', 'boolean'],
            'variants.*.sort_order' => ['sometimes', 'integer', 'min:0', 'max:65535'],
            'addons' => ['sometimes', 'array', 'max:30'],
            'addons.*.name' => ['required_with:addons', 'string', 'max:100'],
            'addons.*.price' => ['required_with:addons', 'numeric', 'min:0', 'max:99999999.99', 'decimal:0,2'],
            'addons.*.is_active' => ['sometimes', 'boolean'],
            'addons.*.sort_order' => ['sometimes', 'integer', 'min:0', 'max:65535'],
        ];
    }
}
