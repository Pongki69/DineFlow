<?php

namespace App\Services;

use App\Models\MenuCategory;
use App\Models\MenuItem;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class MenuCatalogService
{
    public function saveCategory(array $data, ?MenuCategory $category = null): MenuCategory
    {
        $category ??= new MenuCategory();
        $category->fill($data);
        if (! $category->exists || $category->isDirty('name')) {
            $category->slug = $this->uniqueSlug(MenuCategory::withTrashed(), $data['name'], $category->getKey());
        }
        $category->save();

        return $category;
    }

    public function saveItem(array $data, ?MenuItem $item = null): MenuItem
    {
        return DB::transaction(function () use ($data, $item): MenuItem {
            if (! MenuCategory::whereKey($data['category_id'])->lockForUpdate()->first()) {
                throw ValidationException::withMessages(['category_id' => 'This category no longer exists. Choose another category.']);
            }
            $item ??= new MenuItem();
            $variants = $data['variants'] ?? null;
            $addons = $data['addons'] ?? null;
            $image = $data['image'] ?? null;
            unset($data['variants'], $data['addons'], $data['image']);

            $item->fill($data);
            if (! $item->exists || $item->isDirty('name')) {
                $item->slug = $this->uniqueSlug(MenuItem::withTrashed(), $data['name'], $item->getKey());
            }
            if ($image) {
                if ($item->image_path) {
                    Storage::disk('public')->delete($item->image_path);
                }
                $item->image_path = $image->store('menu-items', 'public');
                $item->image_source_url = null;
            } elseif (! empty($data['image_source_url'])) {
                if ($item->image_path) Storage::disk('public')->delete($item->image_path);
                $item->image_path = null;
            }
            $item->save();

            if ($variants !== null) {
                $item->variants()->delete();
                foreach ($variants as $variant) {
                    $item->variants()->create($variant);
                }
            }

            if ($addons !== null) {
                $item->addons()->delete();
                foreach ($addons as $addon) {
                    $item->addons()->create($addon);
                }
            }

            return $item->load(['category:id,name', 'variants', 'addons']);
        });
    }

    private function uniqueSlug($query, string $name, ?int $ignoreId = null): string
    {
        $base = Str::slug($name) ?: 'menu-item';
        $slug = $base;
        $suffix = 2;
        while ($query->when($ignoreId, fn ($q) => $q->whereKeyNot($ignoreId))->where('slug', $slug)->exists()) {
            $slug = $base.'-'.$suffix++;
        }

        return $slug;
    }
}
