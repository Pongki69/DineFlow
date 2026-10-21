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
        <textarea rows={3} />
      </Field>
      <div className="form-columns">
        <Field
          label="SKU (optional)"
          name="sku"
          defaultValue={item?.sku || ""}
          maxLength={64}
          error={errors.sku?.[0]}
        />
        <Field
          label="Dish photo (optional)"
          name="image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hint="JPG, PNG or WebP, up to 5 MB."
          error={errors.image?.[0]}
        />
      </div>
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
        api("/menu/items"),
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
  const filtered = items.filter((item) =>
    `${item.name} ${item.category?.name}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
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
      <div className="search-field">
        <Search size={18} aria-hidden="true" />
        <input
          aria-label="Search menu management"
          placeholder="Find a dish or category"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {loading ? (
        <Skeleton label="Loading your menu" />
      ) : !filtered.length ? (
        <EmptyState
          icon={UtensilsCrossed}
          title={
            query ? "No dishes match this search" : "Make the menu your own"
          }
          description={
            query
              ? "Try a different dish or category name."
              : "Start with a category, then add your first dish."
          }
        />
      ) : (
        <div className="catalog-list">
          {filtered.map((item) => (
            <article key={item.id}>
              <div className="catalog-dish-icon">
                {item.image_url ? (
                  <img src={item.image_url} alt="" />
                ) : (
                  <UtensilsCrossed size={25} aria-hidden="true" />
                )}
              </div>
              <div className="catalog-dish-info">
                <span className="eyebrow">{item.category?.name}</span>
                <h2>{item.name}</h2>
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
              <textarea rows={3} />
            </Field>
            <div className="dialog-actions">
              <Button
                variant="secondary"
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
    </section>
  );
}
