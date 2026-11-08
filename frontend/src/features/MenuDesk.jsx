import { FolderPlus, Pencil, UtensilsCrossed } from "lucide-react";
import { StatusBadge } from "../components/ui";
import { DishPortion } from "../components/DishPortion";

/*
 * Menu management on the admin desktop: a category rail beside the dishes
 * and photo-first dish cards. Phones and tablets keep their own layout.
 */

/** Rail on the left, filters and dishes on the right; plain elsewhere. */
export function MenuDeskLayout({ enabled, rail, children }) {
  if (!enabled) return children;
  return (
    <div className="menu-desk">
      <aside className="menu-desk-rail" aria-label="Categories">
        {rail}
      </aside>
      <div className="menu-desk-main">{children}</div>
    </div>
  );
}

/** Every category with its dish count; pick to filter, pencil to edit. */
export function CategoryRail({
  categories,
  items,
  value,
  onPick,
  onEdit,
  onAdd,
}) {
  const countFor = (id) =>
    items.filter((item) => String(item.category_id) === String(id)).length;
  return (
    <section className="menu-rail-card">
      <header className="menu-rail-head">
        <h2>Categories</h2>
        <span className="admin-count">{categories.length}</span>
      </header>
      <ul className="menu-rail-list">
        <li>
          <button
            type="button"
            className="menu-rail-pick"
            aria-pressed={!value}
            onClick={() => onPick("")}
          >
            <span>All dishes</span>
            <span className="admin-count">{items.length}</span>
          </button>
        </li>
        {categories.map((category) => (
          <li
            key={category.id}
            data-inactive={!category.is_active || undefined}
          >
            <button
              type="button"
              className="menu-rail-pick"
              aria-pressed={String(value) === String(category.id)}
              onClick={() => onPick(String(category.id))}
            >
              <span>
                {category.name}
                {!category.is_active && <small>Hidden</small>}
              </span>
              <span className="admin-count">{countFor(category.id)}</span>
            </button>
            <button
              type="button"
              className="menu-rail-edit"
              aria-label={`Edit ${category.name}`}
              title="Edit category"
              onClick={() => onEdit(category)}
            >
              <Pencil size={14} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="ui-button ui-button--ghost menu-rail-add"
        onClick={onAdd}
      >
        <FolderPlus size={16} aria-hidden="true" />
        Add category
      </button>
    </section>
  );
}

/** Photo first, then the essentials, then availability and actions. */
export function DeskDishCard({ item, busy, onAvailability, actions }) {
  const state = !item.is_active
    ? "inactive"
    : item.is_sold_out
      ? "sold_out"
      : "available";
  const discount = Number(item.discount_percent) > 0;
  return (
    <article className="menu-desk-dish" data-state={state}>
      <div className="menu-desk-photo">
        {item.image_url ? (
          <img src={item.image_url} alt="" referrerPolicy="no-referrer" />
        ) : (
          <UtensilsCrossed size={30} strokeWidth={1.5} aria-hidden="true" />
        )}
        <StatusBadge status={state} />
      </div>
      <div className="menu-desk-body">
        <span className="menu-desk-category">{item.category?.name}</span>
        <h2>{item.name}</h2>
        <DishPortion item={item} />
        <div className="menu-desk-price-row">
          <p className="menu-desk-price">
            ₱{Number(item.base_price).toFixed(2)}
            {discount && <small>{item.discount_percent}% off</small>}
          </p>
          {/* Sold out is a quick on/off, so it is a switch, not a button. */}
          <label className="menu-desk-switch">
            <span>{item.is_sold_out ? "Sold out" : "Available"}</span>
            <input
              type="checkbox"
              role="switch"
              checked={!item.is_sold_out}
              disabled={busy || !item.is_active}
              onChange={onAvailability}
              aria-label={`${item.name} available to order`}
            />
          </label>
        </div>
      </div>
      <div className="menu-desk-footer">{actions}</div>
    </article>
  );
}
