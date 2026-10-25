import { AutoTextarea } from "../components/AutoTextarea";
import { DishPortion } from "../components/DishPortion";
import { ImagePicker } from "../components/ImagePicker";
import { loadMenuItems } from "../menuCatalog";
import { useConfirm } from "../components/ConfirmProvider";
import { useEffect, useState } from "react";
import { Pencil, Plus, Search, Trash2, UtensilsCrossed } from "lucide-react";
import { api } from "../api";
import { Modal } from "../components/Modal";
import {
  Button,
  EmptyState,
  Feedback,
  Field,
  PageHeader,
  Skeleton,
  StatusBadge,
} from "../components/ui";

function OptionEditor({ title, rows, setRows, priceKey, limit }) {
  function update(index, key, value) {
    setRows((current) =>
      current.map((row, position) =>
        position === index ? { ...row, [key]: value } : row,
      ),
    );
  }
  return (
    <fieldset className="option-editor">
      <legend>{title}</legend>
      <p>
        Offer more ways to make each dish their own. Prices are added to the
        base price.
      </p>
      {rows.map((row, index) => (
        <div className="option-row" key={index}>
          <Field
            label={`${title} name ${index + 1}`}
            value={row.name}
            onChange={(event) => update(index, "name", event.target.value)}
            required
            maxLength={100}
          />
          <Field
            label={`Extra price ${index + 1} (₱)`}
            type="number"
            min="0"
            step="0.01"
            value={row[priceKey]}
            onChange={(event) => update(index, priceKey, event.target.value)}
            required
          />
          <button
            className="icon-button"
            type="button"
            aria-label={`Remove ${title.toLowerCase()} ${index + 1}`}
            onClick={() =>
              setRows((current) =>
                current.filter((_, position) => position !== index),
              )
            }
          >
            <Trash2 size={18} aria-hidden="true" />
          </button>
          <label className="checkline">
            <input
              type="checkbox"
              checked={row.is_active !== false}
              onChange={(event) =>
                update(index, "is_active", event.target.checked)
              }
            />
            Available
          </label>
        </div>
      ))}
      <Button
        variant="secondary"
        disabled={rows.length >= limit}
        onClick={() =>
          setRows((current) => [
            ...current,
            { name: "", [priceKey]: "0", is_active: true },
          ])
        }
      >
        <Plus size={16} aria-hidden="true" />
        Add {title === "Sizes" ? "size" : "add-on"}
      </Button>
    </fieldset>
  );
}

function ItemEditor({ item, categories, onSaved, onClose }) {
  const [variants, setVariants] = useState(item?.variants || []),
    [addons, setAddons] = useState(item?.addons || []);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [errors, setErrors] = useState({});
  async function save(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setError("");
    setErrors({});
    try {
      const fields = Object.fromEntries(new FormData(form));
      const payload = {
        ...fields,
        is_active: item?.is_active ?? true,
        is_available: item?.is_available ?? true,
        is_sold_out: item?.is_sold_out ?? false,
        available_from: item?.available_from ?? null,
        available_until: item?.available_until ?? null,
        variants: variants.map((row, index) => ({
          name: row.name,
          price_adjustment: row.price_adjustment,
          is_active: row.is_active !== false,
          sort_order: index,
        })),
        addons: addons.map((row, index) => ({
          name: row.name,
          price: row.price,
          is_active: row.is_active !== false,
          sort_order: index,
        })),
      };
      const image = fields.image;
      delete payload.image;
      let body,
        method = item ? "PUT" : "POST";
      if (image?.size) {
        body = new FormData();
        for (const [key, value] of Object.entries(payload)) {
          if (Array.isArray(value))
            value.forEach((row, index) =>
              Object.entries(row).forEach(([field, data]) =>
                body.append(
                  `${key}[${index}][${field}]`,
                  typeof data === "boolean"
                    ? Number(data).toString()
                    : String(data),
                ),
              ),
            );
          else if (value != null)
            body.append(
              key,
              typeof value === "boolean"
                ? Number(value).toString()
                : String(value),
            );
        }
        body.append("image", image);
        if (item) {
          body.append("_method", "PUT");
          method = "POST";
        }
      } else body = JSON.stringify(payload);
      await api(item ? `/menu/items/${item.id}` : "/menu/items", {
        method,
        body,
      });
      await onSaved(item ? "Dish updated." : "Your new dish is on the menu.");
    } catch (failure) {
      setError(failure.message);
      setErrors(failure.errors || {});
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="catalog-editor-form" onSubmit={save} aria-busy={busy}>
      {error && <Feedback>{error}</Feedback>}
      <div className="form-columns">
        <Field
          label="Dish name"
          name="name"
          defaultValue={item?.name}
          required
          maxLength={140}
          autoFocus
          error={errors.name?.[0]}
        />
        <Field
          label="Category"
          name="category_id"
          defaultValue={item?.category_id || ""}
          required
          error={errors.category_id?.[0]}
        >
          <select>
            <option value="" disabled>
              Choose a category
            </option>
            {categories
              .filter(
                (category) =>
                  category.is_active || category.id === item?.category_id,
              )
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </select>
        </Field>
        <Field
          label="Base price (₱)"
          name="base_price"
          defaultValue={item?.base_price}
          type="number"
          min="0"
          step="0.01"
          required
          error={errors.base_price?.[0]}
        />
        <Field
          label="Discount (%)"
          name="discount_percent"
          defaultValue={item?.discount_percent || "0"}
          type="number"
          min="0"
          max="100"
          step="0.01"
          error={errors.discount_percent?.[0]}
        />
      </div>
      <Field
        label="Description"
        name="description"
        defaultValue={item?.description || ""}
        maxLength={5000}
      >
        <AutoTextarea rows={3} />
      </Field>
      <div className="form-columns">
        <Field
          label="Pieces (optional)"
          name="pieces"
          type="number"
          min="1"
          max="9999"
          step="1"
          defaultValue={item?.pieces ?? ""}
          error={errors.pieces?.[0]}
          hint="Number of pieces included in one order."
        />
        <Field
          label="Servings (optional)"
          name="servings"
          type="number"
          min="1"
          max="1000"
          step="1"
          defaultValue={item?.servings ?? ""}
          error={errors.servings?.[0]}
          hint="Number of servings included in one order."
        />
      </div>
      <div className="form-columns">
        <Field
          label="SKU (optional)"
          name="sku"
          defaultValue={item?.sku || ""}
          maxLength={64}
          error={errors.sku?.[0]}
        />
      </div>
      <ImagePicker
        label="Dish photo (optional)"
        initialUrl={item?.image_url}
        initialSourceUrl={item?.image_source_url}
        error={errors.image?.[0] || errors.image_source_url?.[0]}
      />
      <OptionEditor
        title="Sizes"
        rows={variants}
        setRows={setVariants}
        priceKey="price_adjustment"
        limit={20}
      />
      <OptionEditor
        title="Add-ons"
        rows={addons}
        setRows={setAddons}
        priceKey="price"
        limit={30}
      />
      <div className="dialog-actions">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" busy={busy}>
          {item ? "Save dish" : "Add dish"}
        </Button>
      </div>
    </form>
  );
}

export function MenuAdmin() {
  const confirm = useConfirm();
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sortBy, setSortBy] = useState("category-asc");
  const [deletionReview, setDeletionReview] = useState(null);
  const [items, setItems] = useState([]),
    [categories, setCategories] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null),
    [categoryEditor, setCategoryEditor] = useState(null),
    [categoryError, setCategoryError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      const [groups, dishes] = await Promise.all([
        api("/menu/categories"),
        loadMenuItems(),
      ]);
      setCategories(groups.data || []);
      setItems(dishes.data || []);
      setError("");
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function saveCategory(event) {
    event.preventDefault();
    setBusy(true);
    setCategoryError("");
    try {
      const fields = Object.fromEntries(new FormData(event.currentTarget));
      await api(
        categoryEditor.id
          ? `/menu/categories/${categoryEditor.id}`
          : "/menu/categories",
        {
          method: categoryEditor.id ? "PUT" : "POST",
          body: JSON.stringify({
            ...fields,
            is_active: categoryEditor.is_active ?? true,
          }),
        },
      );
      setCategoryEditor(null);
      setNotice("Category saved.");
      await load();
    } catch (failure) {
      setCategoryError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  async function reviewCategoryDeletion(category = categoryEditor) {
    setDeletionReview({ category, dishes: [], loading: true, error: "" });
    try {
      const result = await api(
        `/menu/categories/${category.id}/deletion-preview`,
      );
      setDeletionReview((current) =>
        current?.category.id === category.id
          ? { category, dishes: result.data.dishes, loading: false, error: "" }
          : current,
      );
    } catch (failure) {
      setDeletionReview((current) =>
        current?.category.id === category.id
          ? {
              ...current,
              loading: false,
              needsRefresh: true,
              error: failure.message,
            }
          : current,
      );
    }
  }
  async function deleteCategory() {
    const { category, dishes } = deletionReview;
    setBusy(true);
    try {
      await api(`/menu/categories/${category.id}`, {
        method: "DELETE",
        body: JSON.stringify({ dish_ids: dishes.map((dish) => dish.id) }),
      });
      if (categoryFilter === String(category.id)) setCategoryFilter("");
      setDeletionReview(null);
      setCategoryEditor(null);
      setNotice(
        `${category.name} category and ${dishes.length} dish${dishes.length === 1 ? "" : "es"} deleted.`,
      );
      await load();
    } catch (failure) {
      setDeletionReview((current) =>
        current
          ? {
              ...current,
              error: failure.errors?.dish_ids?.[0] || failure.message,
              needsRefresh: Boolean(failure.errors?.dish_ids),
            }
          : current,
      );
    } finally {
      setBusy(false);
    }
  }
  async function toggle(item, soldOut = false) {
    setBusy(true);
    try {
      await api(
        `/menu/items/${item.id}/${soldOut ? "availability" : "active"}`,
        {
          method: "PATCH",
          body: JSON.stringify(
            soldOut
              ? { is_sold_out: !item.is_sold_out }
              : { is_active: !item.is_active },
          ),
        },
      );
      await load();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  async function deleteDish(item) {
    if (
      !(await confirm(
        `Remove ${item.name} from the menu? Past orders will keep their dish details.`,
        {
          title: "Delete this dish?",
          confirmLabel: "Delete dish",
          destructive: true,
        },
      ))
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(`/menu/items/${item.id}`, { method: "DELETE" });
      setNotice(`${item.name} deleted.`);
      await load();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  const compareNames = (a, b) =>
    (a || "").localeCompare(b || "", "en", {
      numeric: true,
      sensitivity: "base",
    });
  const sortedCategories = [...categories].sort((a, b) =>
    compareNames(a.name, b.name),
  );
  const filtered = items
    .filter(
      (item) =>
        (!categoryFilter || String(item.category_id) === categoryFilter) &&
        `${item.name} ${item.category?.name}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
    )
    .sort((a, b) => {
      if (sortBy.startsWith("category-")) {
        return (
          compareNames(a.category?.name, b.category?.name) *
            (sortBy === "category-desc" ? -1 : 1) ||
          compareNames(a.name, b.name)
        );
      }
      if (sortBy.startsWith("price-")) {
        return (
          (Number(a.base_price) - Number(b.base_price)) *
            (sortBy === "price-desc" ? -1 : 1) || compareNames(a.name, b.name)
        );
      }
      return compareNames(a.name, b.name);
    });
  const hasFilters = Boolean(query.trim() || categoryFilter);
  return (
    <section className="catalog-admin">
      <PageHeader
        eyebrow="CURATED BY YOUR KITCHEN"
        title="Menu management"
        description="A menu worth coming back for. Manage dishes, categories and the little extras."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setCategoryError("");
                setCategoryEditor({});
              }}
            >
              <Plus size={17} aria-hidden="true" />
              Add category
            </Button>
            <Button
              disabled={!categories.some((category) => category.is_active)}
              onClick={() => setEditing({})}
            >
              <Plus size={17} aria-hidden="true" />
              Add dish
            </Button>
          </>
        }
      />
      {notice && <Feedback tone="success">{notice}</Feedback>}
      {error && <Feedback onRetry={load}>{error}</Feedback>}
      <div className="catalog-categories">
        {categories.map((category) => (
          <button
            key={category.id}
            onClick={() => {
              setCategoryError("");
              setCategoryEditor(category);
            }}
          >
            <span>{category.name}</span>
            <Pencil size={13} aria-hidden="true" />
            <span className="sr-only">Edit category</span>
          </button>
        ))}
      </div>
      <div className="catalog-filter-bar">
        <div className="search-field">
          <Search size={18} aria-hidden="true" />
          <input
            aria-label="Search menu management"
            placeholder="Find a dish or category"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <label className="catalog-filter-field">
          Category
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
          >
            <option value="">All categories</option>
            {sortedCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="catalog-filter-field">
          Sort by
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value)}
          >
            <option value="category-asc">Category: A–Z</option>
            <option value="category-desc">Category: Z–A</option>
            <option value="name-asc">Dish name: A–Z</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
          </select>
        </label>
        {hasFilters && (
          <Button
            variant="secondary"
            onClick={() => {
              setQuery("");
              setCategoryFilter("");
            }}
          >
            Clear filters
          </Button>
        )}
      </div>
      {!loading && (
        <p className="catalog-result-count" role="status">
          Showing {filtered.length} of {items.length} dishes
        </p>
      )}
      {loading ? (
        <Skeleton label="Loading your menu" />
      ) : !filtered.length ? (
        <EmptyState
          icon={UtensilsCrossed}
          title={
            hasFilters
              ? "No dishes match these filters"
              : "Make the menu your own"
          }
          description={
            hasFilters
              ? "Try another category or search term."
              : "Start with a category, then add your first dish."
          }
          action={hasFilters ? "Clear filters" : undefined}
          onAction={() => {
            setQuery("");
            setCategoryFilter("");
          }}
        />
      ) : (
        <div className="catalog-list">
          {filtered.map((item) => (
            <article key={item.id}>
              <div className="catalog-dish-icon">
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt=""
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <UtensilsCrossed size={25} aria-hidden="true" />
                )}
              </div>
              <div className="catalog-dish-info">
                <span className="eyebrow">{item.category?.name}</span>
                <h2>{item.name}</h2>
                <DishPortion item={item} />
                <p>
                  ₱{Number(item.base_price).toFixed(2)}
                  {Number(item.discount_percent) > 0 &&
                    ` · ${item.discount_percent}% off`}
                </p>
              </div>
              <StatusBadge
                status={
                  !item.is_active
                    ? "inactive"
                    : item.is_sold_out
                      ? "sold_out"
                      : "available"
                }
              />
              <div className="catalog-dish-actions">
                <Button variant="secondary" onClick={() => setEditing(item)}>
                  Edit dish
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => toggle(item, true)}
                >
                  {item.is_sold_out ? "Mark available" : "Mark sold out"}
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => toggle(item)}
                >
                  {item.is_active ? "Deactivate" : "Activate"}
                </Button>
                <Button
                  variant="secondary"
                  className="dish-delete"
                  disabled={busy}
                  onClick={() => deleteDish(item)}
                >
                  <Trash2 size={15} aria-hidden="true" /> Delete dish
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      <Modal
        open={editing !== null}
        title={editing?.id ? "Edit dish" : "A new favorite"}
        description="Set the details, then make it your own with sizes and add-ons."
        onClose={() => setEditing(null)}
      >
        {editing !== null && (
          <ItemEditor
            key={editing.id || "new"}
            item={editing.id ? editing : null}
            categories={categories}
            onClose={() => setEditing(null)}
            onSaved={async (message) => {
              setEditing(null);
              setNotice(message);
              await load();
            }}
          />
        )}
      </Modal>
      <Modal
        open={categoryEditor !== null}
        title={categoryEditor?.id ? "Edit category" : "Add a category"}
        onClose={() => setCategoryEditor(null)}
      >
        {categoryEditor !== null && (
          <form
            key={categoryEditor.id || "new"}
            className="catalog-editor-form"
            onSubmit={saveCategory}
          >
            {categoryError && <Feedback>{categoryError}</Feedback>}
            <Field
              label="Category name"
              name="name"
              defaultValue={categoryEditor.name || ""}
              maxLength={100}
              autoFocus
              required
            />
            <Field
              label="Description (optional)"
              name="description"
              defaultValue={categoryEditor.description || ""}
            >
              <AutoTextarea rows={3} />
            </Field>
            <div className="dialog-actions">
              {categoryEditor.id && (
                <Button
                  variant="secondary"
                  className="category-delete"
                  disabled={busy}
                  onClick={() => reviewCategoryDeletion()}
                >
                  <Trash2 size={15} aria-hidden="true" /> Delete category
                </Button>
              )}
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => setCategoryEditor(null)}
              >
                Cancel
              </Button>
              <Button type="submit" busy={busy}>
                Save category
              </Button>
            </div>
          </form>
        )}
      </Modal>
      <Modal
        open={deletionReview !== null}
        title="Delete category and dishes?"
        description="Review everything that will be removed from the menu. Past orders and receipts will remain intact."
        onClose={() => {
          if (!busy) setDeletionReview(null);
        }}
      >
        {deletionReview && (
          <div
            className="category-deletion-review"
            aria-busy={busy || deletionReview.loading}
          >
            <strong>{deletionReview.category.name}</strong>
            {deletionReview.error && (
              <Feedback>{deletionReview.error}</Feedback>
            )}
            {deletionReview.loading ? (
              <Skeleton label="Loading affected dishes" />
            ) : (
              <>
                <p>
                  {deletionReview.dishes.length} dish
                  {deletionReview.dishes.length === 1 ? "" : "es"} will be
                  deleted with this category.
                </p>
                {deletionReview.dishes.length ? (
                  <ul
                    className="category-deletion-list"
                    aria-label="Dishes affected by category deletion"
                  >
                    {deletionReview.dishes.map((dish) => (
                      <li key={dish.id}>
                        <span>
                          <strong>{dish.name}</strong>
                          <small>
                            {!dish.is_active
                              ? "Inactive"
                              : dish.is_sold_out
                                ? "Sold out"
                                : "Available"}
                          </small>
                        </span>
                        <span>₱{Number(dish.base_price).toFixed(2)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>This category has no dishes.</p>
                )}
              </>
            )}
            <div className="dialog-actions">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => setDeletionReview(null)}
              >
                Cancel
              </Button>
              {deletionReview.needsRefresh && (
                <Button
                  variant="secondary"
                  disabled={busy || deletionReview.loading}
                  onClick={() =>
                    reviewCategoryDeletion(deletionReview.category)
                  }
                >
                  Refresh list
                </Button>
              )}
              <Button
                className="category-delete"
                disabled={
                  busy || deletionReview.loading || deletionReview.needsRefresh
                }
                busy={busy}
                onClick={deleteCategory}
              >
                Delete category
                {deletionReview.dishes.length
                  ? ` and ${deletionReview.dishes.length} dish${deletionReview.dishes.length === 1 ? "" : "es"}`
                  : ""}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
