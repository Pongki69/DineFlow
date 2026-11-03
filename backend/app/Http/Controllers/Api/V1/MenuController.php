<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\MenuCategoryRequest;
use App\Http\Requests\MenuItemRequest;
use App\Models\MenuCategory;
use App\Models\MenuItem;
use App\Services\AuditLogService;
use App\Services\MenuCatalogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use App\Models\OrderItem;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class MenuController extends Controller
{
    public function categories(Request $request): JsonResponse
    {
        $query = MenuCategory::query()->orderBy('sort_order')->orderBy('name');
        if (! $request->user()?->hasPermission('menu.manage')) {
            $query->where('is_active', true);
        }

        return response()->json(['data' => $query->get()]);
    }

    public function index(Request $request): JsonResponse
    {
        $query = MenuItem::query()->with(['category:id,name,slug', 'variants', 'addons']);
        if (! $request->user()?->hasPermission('menu.manage')) {
            $query->orderable()->whereHas('category', fn ($category) => $category->where('is_active', true));
        }
        if ($request->filled('category')) {
            $category = (string) $request->input('category');
            // Match by slug, or by id only when the value is numeric: PostgreSQL
            // rejects comparing an integer column with text such as "drinks".
            $query->whereHas('category', fn ($builder) => $builder->where(function ($match) use ($category) {
                $match->where('slug', $category);
                if (ctype_digit($category)) {
                    $match->orWhere('id', (int) $category);
                }
            }));
        }
        if ($request->filled('q')) {
            $term = trim((string) $request->input('q'));
            $needle = '%'.mb_strtolower($term).'%';
            $query->where(fn ($builder) => $builder->whereRaw('LOWER(name) LIKE ?', [$needle])->orWhereRaw('LOWER(description) LIKE ?', [$needle]));
        }
        if ($request->boolean('available_only')) {
            $query->orderable();
        }

        $items = $query->orderBy('sort_order')->orderBy('name')->paginate(min((int) $request->input('per_page', 24), 60));
        $items->getCollection()->transform(fn (MenuItem $item) => $this->itemPayload($item, $request->user()?->hasPermission('menu.manage') ?? false));

        return response()->json($items);
    }

    public function show(Request $request, MenuItem $item): JsonResponse
    {
        $manage = $request->user()?->hasPermission('menu.manage') ?? false;
        abort_unless($manage || ($item->is_currently_available && $item->category?->is_active), 404);

        return response()->json(['data' => $this->itemPayload($item->load(['category:id,name,slug', 'variants', 'addons']), $manage)]);
    }

    public function storeCategory(MenuCategoryRequest $request, MenuCatalogService $catalog, AuditLogService $audit): JsonResponse
    {
        $category = $catalog->saveCategory($request->validated());
        $audit->record($request->user(), 'menu.category_created', $category, [], $request);

        return response()->json(['data' => $category], 201);
    }

    public function updateCategory(MenuCategoryRequest $request, MenuCategory $category, MenuCatalogService $catalog, AuditLogService $audit): JsonResponse
    {
        $category = $catalog->saveCategory($request->validated(), $category);
        $audit->record($request->user(), 'menu.category_updated', $category, ['is_active' => $category->is_active], $request);

        return response()->json(['data' => $category]);
    }

    public function categoryDeletionPreview(MenuCategory $category): JsonResponse
    {
        return response()->json(['data' => [
            'id' => $category->id, 'name' => $category->name,
            'dishes' => $category->items()->orderBy('name')->get(['id', 'name', 'base_price', 'is_active', 'is_sold_out']),
        ]]);
    }

    public function deleteCategory(Request $request, MenuCategory $category, AuditLogService $audit): JsonResponse
    {
        $data = $request->validate(['dish_ids' => ['present', 'array'], 'dish_ids.*' => ['integer', 'distinct']]);
        DB::transaction(function () use ($request, $category, $audit, $data): void {
            $category = MenuCategory::whereKey($category->id)->lockForUpdate()->firstOrFail();
            $dishes = $category->items()->orderBy('id')->lockForUpdate()->get();
            $reviewed = collect($data['dish_ids'])->map(fn ($id) => (int) $id)->sort()->values()->all();
            if ($reviewed !== $dishes->pluck('id')->all()) {
                throw ValidationException::withMessages(['dish_ids' => 'The dishes in this category have changed. Refresh the list and review it again before deleting.']);
            }
            foreach ($dishes as $dish) {
                $dish->delete();
                $audit->record($request->user(), 'menu.item_deleted', $dish, ['name' => $dish->name, 'category_id' => $category->id], $request);
            }
            $category->delete();
            $audit->record($request->user(), 'menu.category_deleted', $category, ['name' => $category->name, 'dish_ids' => $reviewed, 'dish_count' => $dishes->count()], $request);
        });

        return response()->json(null, 204);
    }

    public function storeItem(MenuItemRequest $request, MenuCatalogService $catalog, AuditLogService $audit): JsonResponse
    {
        $item = $catalog->saveItem($request->validated());
        $audit->record($request->user(), 'menu.item_created', $item, ['name' => $item->name], $request);

        return response()->json(['data' => $this->itemPayload($item, true)], 201);
    }

    public function updateItem(MenuItemRequest $request, MenuItem $item, MenuCatalogService $catalog, AuditLogService $audit): JsonResponse
    {
        $item = $catalog->saveItem($request->validated(), $item);
        $audit->record($request->user(), 'menu.item_updated', $item, ['name' => $item->name, 'is_sold_out' => $item->is_sold_out], $request);

        return response()->json(['data' => $this->itemPayload($item, true)]);
    }

    public function deleteItem(Request $request, MenuItem $item, AuditLogService $audit): JsonResponse
    {
        DB::transaction(function () use ($request, $item, $audit): void {
            $item->delete();
            $audit->record($request->user(), 'menu.item_deleted', $item, ['name' => $item->name], $request);
        });

        return response()->json(null, 204);
    }

    public function deactivateItem(Request $request, MenuItem $item, AuditLogService $audit): JsonResponse
    {
        $data = $request->validate(['is_active' => ['required', 'boolean']]);
        $item->forceFill(['is_active' => $data['is_active']])->save();
        $audit->record($request->user(), $data['is_active'] ? 'menu.item_activated' : 'menu.item_deactivated', $item, [], $request);

        return response()->json(['data' => ['id' => $item->id, 'is_active' => $item->is_active]]);
    }

    public function availability(Request $request, MenuItem $item, AuditLogService $audit): JsonResponse
    {
        $data = $request->validate(['is_available' => ['sometimes', 'boolean'], 'is_sold_out' => ['sometimes', 'boolean'], 'discount_percent' => ['sometimes', 'numeric', 'min:0', 'max:100']]);
        abort_if($data === [], 422, 'Provide an availability or promotion change.');
        $item->forceFill($data)->save();
        $audit->record($request->user(), 'menu.item_availability_changed', $item, $data, $request);
        return response()->json(['data' => $item->fresh()]);
    }

    /** Kitchen view of the menu: every active dish, including sold-out ones. */
    public function kitchenMenu(): JsonResponse
    {
        $items = MenuItem::query()->with('category:id,name')
            ->where('is_active', true)
            ->whereHas('category', fn ($category) => $category->where('is_active', true))
            ->orderBy('category_id')->orderBy('sort_order')->orderBy('name')
            ->get(['id', 'name', 'category_id', 'is_sold_out']);

        return response()->json(['data' => $items->map(fn (MenuItem $item) => [
            'id' => $item->id,
            'name' => $item->name,
            'category' => $item->category?->name,
            'is_sold_out' => (bool) $item->is_sold_out,
        ])->values()]);
    }

    /** Kitchen staff may only flip "sold out"; prices and other details stay with menu managers. */
    public function kitchenSoldOut(Request $request, MenuItem $item, AuditLogService $audit): JsonResponse
    {
        abort_unless($item->is_active, 404);
        $data = $request->validate(['is_sold_out' => ['required', 'boolean']]);
        $item->forceFill($data)->save();
        $audit->record($request->user(), 'menu.item_sold_out_changed', $item, $data + ['name' => $item->name, 'source' => 'kitchen'], $request);

        return response()->json(['data' => ['id' => $item->id, 'name' => $item->name, 'is_sold_out' => (bool) $item->is_sold_out]]);
    }

    /**
     * The five best-selling dishes of the last 30 days, as [menu item id => rank],
     * so the menu can point customers to them. A dish needs at least three sold;
     * cancelled orders do not count. Kept for ten minutes.
     */
    private function popularRanks(): array
    {
        return $this->popularRanks ??= Cache::remember('menu.popular_ranks', 600, function (): array {
            $ids = OrderItem::query()
                ->whereNotNull('menu_item_id')
                ->whereHas('order', fn ($order) => $order->whereNotIn('status', ['cancelled'])->where('created_at', '>=', now()->subDays(30)))
                ->select('menu_item_id', DB::raw('sum(quantity) as sold'))
                ->groupBy('menu_item_id')
                ->havingRaw('sum(quantity) >= 3')
                ->orderByDesc('sold')->orderBy('menu_item_id')
                ->limit(5)
                ->pluck('menu_item_id')
                ->all();

            return $ids ? array_combine($ids, range(1, count($ids))) : [];
        });
    }

    private ?array $popularRanks = null;

    private function itemPayload(MenuItem $item, bool $manage): array
    {
        $item->setAttribute('is_currently_available', $item->is_currently_available);
        $item->setAttribute('popular_rank', $this->popularRanks()[$item->id] ?? null);
        $item->setAttribute('image_url', $item->image_source_url ?: ($item->image_path ? Storage::disk('public')->url($item->image_path) : null));
        $item->setRelation('variants', $item->variants->filter(fn ($variant) => $manage || $variant->is_active)->values());
        $item->setRelation('addons', $item->addons->filter(fn ($addon) => $manage || $addon->is_active)->values());

        return $item->toArray();
    }
}
