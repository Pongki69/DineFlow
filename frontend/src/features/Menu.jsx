import { AutoTextarea } from "../components/AutoTextarea";
import { DishPortion } from "../components/DishPortion";
import { loadMenuItems } from "../menuCatalog";
import { readSavedCart, saveCart } from "../savedCart";
import { DineInBooking } from "../components/DineInBooking";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ChefHat,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { api } from "../api";
import { Link } from "react-router-dom";
import {
  Button,
  EmptyState,
  Feedback,
  Field,
  PageHeader,
  Skeleton,
} from "../components/ui";

const DeliveryMapSelector = lazy(() =>
  import("../DeliveryMap").then((module) => ({
    default: module.DeliveryDestination,
  })),
);
const money = (value) =>
  `₱${Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function linePrice(line) {
  return (
    Number(line.item.base_price) +
    Number(
      line.item.variants?.find(
        (variant) => variant.id === Number(line.variant_id),
      )?.price_adjustment || 0,
    ) +
    line.addon_ids.reduce(
      (total, id) =>
        total +
        Number(line.item.addons?.find((addon) => addon.id === id)?.price || 0),
      0,
    )
  );
}

function MenuCard({ item, onAdd }) {
  const [added, setAdded] = useState(false);
  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(false), 1800);
    return () => clearTimeout(timer);
  }, [added]);
  return (
    <article className="dish-card">
      <div
        className={`dish-image ${item.image_url ? "" : "dish-image--illustrated"}`}
      >
        {item.image_url ? (
          <img
            src={item.image_url}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <UtensilsCrossed size={48} strokeWidth={1} aria-hidden="true" />
        )}
        {Number(item.discount_percent) > 0 && (
          <span className="dish-offer">{item.discount_percent}% off</span>
        )}
      </div>
      <div className="dish-body">
        <span className="eyebrow">
          {item.category?.name || "FROM OUR KITCHEN"}
        </span>
        <h2>{item.name}</h2>
        <DishPortion item={item} />
        {item.description && <p>{item.description}</p>}
        <strong className="dish-price">{money(item.base_price)}</strong>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onAdd(item, event);
            setAdded(true);
          }}
        >
          {item.variants?.length > 0 && (
            <Field label={`Size for ${item.name}`} name="variant_id" required>
              <select>
                <option value="">Choose a size</option>
                {item.variants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.name}
                    {Number(variant.price_adjustment)
                      ? ` (+${money(variant.price_adjustment)})`
                      : ""}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {item.addons?.map((addon) => (
            <label className="checkline" key={addon.id}>
              <input type="checkbox" name="addon_ids" value={addon.id} />
              {addon.name}
              <span>+{money(addon.price)}</span>
            </label>
          ))}
          <Field
            label={`Special instructions for ${item.name}`}
            name="special_instructions"
            maxLength={500}
            placeholder="Any preferences?"
          />
          <Button type="submit" variant="secondary">
            <Plus size={17} aria-hidden="true" />
            {added ? "Added to order" : "Add to order"}
          </Button>
        </form>
      </div>
    </article>
  );
}

export function MenuBrowser({ user }) {
  const [items, setItems] = useState([]),
    [categories, setCategories] = useState([]),
    [category, setCategory] = useState(""),
    [query, setQuery] = useState("");
  const [cart, setCart] = useState(() => readSavedCart(user?.id)),
    [orderType, setOrderType] = useState("pickup"),
    [delivery, setDelivery] = useState({});
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const [dineInReady, setDineInReady] = useState(false);
  const [placedDelivery, setPlacedDelivery] = useState(null);
  const summary = useRef(null);
  useEffect(() => {
    saveCart(user?.id, cart);
  }, [user?.id, cart]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const timer = setTimeout(
      async () => {
        try {
          const params = {
            available_only: "1",
            ...(category ? { category } : {}),
            ...(query ? { q: query } : {}),
          };
          const [groups, result] = await Promise.all([
            api("/menu/categories", { signal: controller.signal }),
            loadMenuItems(params, { signal: controller.signal }),
          ]);
          if (!controller.signal.aborted) {
            setCategories(groups.data || []);
            setItems(result.data || []);
          }
        } catch (failure) {
          if (!controller.signal.aborted) setError(failure.message);
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      },
      query ? 250 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [category, query, retry]);
  useEffect(() => {
    setDelivery((current) => ({ ...current, quote: null }));
  }, [cart]);
  function add(item, event) {
    const fields = new FormData(event.currentTarget),
      variant_id = fields.get("variant_id") || null,
      addon_ids = fields.getAll("addon_ids").map(Number),
      special_instructions = fields.get("special_instructions") || "";
    const key = `${item.id}-${variant_id}-${addon_ids.join(",")}-${special_instructions}`;
    setCart((current) =>
      current.some((line) => line.key === key)
        ? current.map((line) =>
            line.key === key ? { ...line, quantity: line.quantity + 1 } : line,
          )
        : [
            ...current,
            {
              key,
              menu_item_id: item.id,
              variant_id,
              addon_ids,
              special_instructions,
              quantity: 1,
              item,
            },
          ],
    );
    event.currentTarget.reset();
  }
  function quantity(key, amount) {
    setCart((current) =>
      current
        .map((line) =>
          line.key === key
            ? { ...line, quantity: line.quantity + amount }
            : line,
        )
        .filter((line) => line.quantity > 0),
    );
  }
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget,
      fields = new FormData(form);
    setBusy(true);
    setError("");
    setNotice("");
    setPlacedDelivery(null);
    try {
      if (
        orderType === "delivery" &&
        !delivery.delivery_address_id &&
        delivery.latitude == null
      )
        throw new Error("Choose your delivery destination to continue.");
      const result = await api("/orders", {
        method: "POST",
        body: JSON.stringify({
          order_type: orderType,
          table_code: fields.get("table_code") || null,
          delivery_address: delivery.formatted_address || null,
          delivery_address_id: delivery.delivery_address_id || null,
          delivery_latitude: delivery.latitude ?? null,
          delivery_longitude: delivery.longitude ?? null,
          delivery_instructions: delivery.delivery_instructions || null,
          delivery_recipient_name: delivery.recipient_name || null,
          delivery_phone: delivery.phone || null,
          customer_notes: fields.get("customer_notes") || null,
          items: cart.map(({ item, key, ...line }) => line),
        }),
      });
      setNotice(
        `Order ${result.data.order_number} placed · ${money(result.data.total)}`,
      );
      setPlacedDelivery(result.data.delivery?.id || null);
      setCart([]);
      setDelivery({});
      form.reset();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  const subtotal = cart.reduce(
    (total, line) => total + linePrice(line) * line.quantity,
    0,
  );
  const count = cart.reduce((total, line) => total + line.quantity, 0);
  return (
    <section className="menu-page">
      <PageHeader
        eyebrow="SOMETHING GOOD IS COOKING"
        title="Find your next favorite."
        description="Fresh choices, made your way. Stay a while or take a little goodness with you."
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              summary.current?.scrollIntoView({
                behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                  .matches
                  ? "auto"
                  : "smooth",
                block: "start",
              });
              summary.current?.focus({ preventScroll: true });
            }}
          >
            <ShoppingBag size={18} aria-hidden="true" />
            Your order<span className="count-pill">{count}</span>
          </Button>
        }
      />
      <div className="menu-feature">
        <div>
          <span className="feature-kicker">
            <ChefHat size={16} aria-hidden="true" />
            FROM OUR KITCHEN TO YOUR TABLE
          </span>
          <h2>
            A good meal.
            <br />
            At your own pace.
          </h2>
          <p>Dine in, pick up, or have your favorites delivered.</p>
        </div>
        <div className="feature-plate" aria-hidden="true">
          <UtensilsCrossed size={56} strokeWidth={1.1} />
        </div>
      </div>
      {notice && <Feedback tone="success">{notice}</Feedback>}
      {placedDelivery && (
        <Link
          className="ui-button ui-button--secondary"
          to={`/delivery/${placedDelivery}/tracking`}
        >
          Track order & rider
        </Link>
      )}
      <div className="menu-layout">
        <div className="menu-catalog">
          <div className="menu-toolbar">
            <div className="search-field">
              <Search size={19} aria-hidden="true" />
              <input
                aria-label="Search dishes"
                placeholder="What are you craving?"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query && (
                <button className="text-button" onClick={() => setQuery("")}>
                  Clear
                </button>
              )}
            </div>
            <span className="results-count">
              {loading
                ? "Finding your favorites…"
                : `${items.length} ${items.length === 1 ? "dish" : "dishes"}`}
            </span>
          </div>
          <div className="category-tabs" aria-label="Menu categories">
            <button aria-pressed={!category} onClick={() => setCategory("")}>
              All dishes
            </button>
            {categories.map((group) => (
              <button
                key={group.id}
                aria-pressed={category === group.slug}
                onClick={() => setCategory(group.slug)}
              >
                {group.name}
              </button>
            ))}
          </div>
          {loading ? (
            <Skeleton label="Loading menu" />
          ) : error && !cart.length ? (
            <Feedback
              title="We couldn’t load the menu"
              onRetry={() => setRetry((value) => value + 1)}
            >
              {error}
            </Feedback>
          ) : items.length ? (
            <div className="dish-grid">
              {items.map((item) => (
                <MenuCard key={item.id} item={item} onAdd={add} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={UtensilsCrossed}
              title={
                query || category
                  ? "No dishes match just yet"
                  : "The menu is getting ready"
              }
              description={
                query || category
                  ? "Try a different search or explore all dishes."
                  : "Check back soon for something delicious."
              }
              action={query || category ? "Show all dishes" : "Refresh menu"}
              onAction={() => {
                setCategory("");
                setQuery("");
                setRetry((value) => value + 1);
              }}
            />
          )}
        </div>
        <aside
          className={`order-summary${cart.length ? " has-items" : ""}`}
          ref={summary}
          tabIndex={-1}
          aria-label="Your order"
        >
          <div className="summary-heading">
            <ShoppingBag size={20} aria-hidden="true" />
            <h2>Your order</h2>
            <span className="count-pill">{count}</span>
          </div>
          {!cart.length ? (
            <EmptyState
              compact
              icon={ShoppingBag}
              title="A little empty, for now"
              description="Add something delicious from the menu to get started."
            />
          ) : (
            <form onSubmit={submit} className="summary-checkout">
              <div
                className="summary-scroll"
                tabIndex={0}
                aria-label="Order items and options"
              >
                <div className="summary-lines">
                  {cart.map((line) => (
                    <div className="summary-line" key={line.key}>
                      <div>
                        <strong>{line.item.name}</strong>
                        {line.variant_id && (
                          <small>
                            {
                              line.item.variants?.find(
                                (variant) =>
                                  variant.id === Number(line.variant_id),
                              )?.name
                            }
                          </small>
                        )}
                        {line.special_instructions && (
                          <small>{line.special_instructions}</small>
                        )}
                        <span>{money(linePrice(line) * line.quantity)}</span>
                      </div>
                      <div className="quantity-control">
                        <button
                          type="button"
                          aria-label={`Decrease ${line.item.name} quantity`}
                          onClick={() => quantity(line.key, -1)}
                        >
                          <Minus size={14} aria-hidden="true" />
                        </button>
                        <span aria-label={`Quantity: ${line.quantity}`}>
                          {line.quantity}
                        </span>
                        <button
                          type="button"
                          aria-label={`Increase ${line.item.name} quantity`}
                          onClick={() => quantity(line.key, 1)}
                        >
                          <Plus size={14} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${line.item.name}`}
                          onClick={() =>
                            setCart((current) =>
                              current.filter((row) => row.key !== line.key),
                            )
                          }
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="summary-form">
                  <Field
                    label="Order type"
                    name="order_type"
                    value={orderType}
                    onChange={(event) => setOrderType(event.target.value)}
                  >
                    <select>
                      <option value="pickup">Pickup</option>
                      <option value="delivery">Delivery</option>
                      <option value="dine_in">Dine in</option>
                    </select>
                  </Field>
                  {orderType === "dine_in" && (
                    <DineInBooking onReadyChange={setDineInReady} />
                  )}
                  {orderType === "delivery" && (
                    <Suspense
                      fallback={
                        <Skeleton cards={1} label="Loading delivery map" />
                      }
                    >
                      <DeliveryMapSelector
                        items={cart.map(({ item, key, ...line }) => line)}
                        value={delivery}
                        onChange={setDelivery}
                        onQuote={(quote) =>
                          setDelivery((current) => ({ ...current, quote }))
                        }
                      />
                    </Suspense>
                  )}
                  <Field
                    label="Order notes (optional)"
                    name="customer_notes"
                    maxLength={2000}
                  >
                    <AutoTextarea rows={2} />
                  </Field>
                </div>
              </div>
              <div className="summary-footer">
                <div className="summary-total">
                  <span>Estimated subtotal</span>
                  <strong>{money(subtotal)}</strong>
                </div>
                <p className="summary-hint">
                  Discounts, taxes and any delivery fees are included in your
                  final order total.
                </p>
                {error && <Feedback>{error}</Feedback>}
                <Button
                  type="submit"
                  busy={busy}
                  disabled={
                    (orderType === "dine_in" && !dineInReady) ||
                    (orderType === "delivery" &&
                      (delivery.latitude == null ||
                        !delivery.formatted_address?.trim() ||
                        !delivery.recipient_name?.trim() ||
                        !delivery.phone?.trim() ||
                        !delivery.quote?.meets_minimum))
                  }
                >
                  {busy ? "Placing your order…" : "Place order"}
                  <ArrowRight size={17} aria-hidden="true" />
                </Button>
              </div>
            </form>
          )}
        </aside>
      </div>
    </section>
  );
}
