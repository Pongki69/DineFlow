import { playSound } from "../uiSound";
import { EmptyState, Feedback, Skeleton } from "../components/ui";
import { OrderStatusPill } from "../components/OrderStatusPill";
import { CustomerScreenSkeleton } from "../components/CustomerScreenSkeleton";
import { useMediaQuery } from "../components/useMediaQuery";
import { Pagination } from "../components/Pagination";
import {
  KitchenSoldOut,
  useNewTicketAlert,
  useScreenWakeLock,
} from "../components/KitchenTools";
import {
  allDayCounts,
  mentionsAllergy,
  riderStatus,
  sortTickets,
} from "../components/kitchenTicket";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Bike,
  Check,
  ChefHat,
  Clock3,
  RefreshCw,
  ShoppingBag,
  SlidersHorizontal,
  TriangleAlert,
  Truck,
  Undo2,
  UtensilsCrossed,
} from "lucide-react";
import { api } from "../api";
import { subscribeToLiveChanges } from "../liveUpdates";
import { DatePicker } from "../components/DatePicker";
import "../components/riderDispatch.css";
import "./ordersWorkspace.css";
import "./staffSage.css";
import "./staffOrdersMobile.css";
import {
  foodLabels,
  deliveryLabels,
} from "../components/CustomerOrderProgress";

const money = (value) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
const readable = (value) => String(value || "").replaceAll("_", " ");
const actionLabels = {
  confirmed: "Confirm order",
  preparing: "Start preparing",
  ready_to_serve: "Mark ready",
  served: "Mark served",
  completed: "Complete order",
  cancelled: "Cancel order",
};
const isError = (feedback) =>
  !!feedback && (feedback.tone || "error") === "error";

// Card or sheet errors sit directly above the primary action.
const ORDERS_PER_PAGE = 15;

function CardAlert({ children }) {
  return (
    <div className="df-alert df-alert--context" role="alert">
      <TriangleAlert size={16} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

// Ticket age (minutes) at which the KDS raises a ticket's priority.
const KDS_SOON_MINUTES = 10;
const KDS_LATE_MINUTES = 20;

// 51 min 7 s -> "51:07"; past an hour -> "1:05:07".
function clockLabel(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const pad = (value) => String(value).padStart(2, "0");
  return hours
    ? `${hours}:${pad(minutes)}:${pad(seconds % 60)}`
    : `${minutes}:${pad(seconds % 60)}`;
}

function ticketPriority({ elapsed, remaining }) {
  if (remaining !== null)
    return remaining < 0 ? "late" : remaining <= 3 ? "soon" : "normal";
  if (elapsed === null) return "normal";
  return elapsed >= KDS_LATE_MINUTES
    ? "late"
    : elapsed >= KDS_SOON_MINUTES
      ? "soon"
      : "normal";
}

function KitchenQueue({
  orders,
  loading,
  refreshing,
  updatedAt,
  error,
  load,
  prep,
  setPrep,
  pending,
  rowFeedback,
  advance,
  recall,
  togglePrepared,
  kitchenMeta,
  user,
}) {
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [now, setNow] = useState(Date.now);
  const [notice, setNotice] = useState("");
  const heading = useRef(null);
  // Ticket timers tick every second, like a kitchen clock.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const canUpdate = user.permissions?.some((permission) =>
    ["kitchen.orders.update", "orders.manage"].includes(permission),
  );
  const visible = orders.filter(
    (order) =>
      (!type || order.order_type === type) &&
      (!status || order.status === status),
  );
  const freshTickets = useNewTicketAlert(orders, !loading && !!updatedAt);
  const screenAwake = useScreenWakeLock();
  // Tablets in landscape get the classic board: Waiting | Preparing | Ready.
  const board = useMediaQuery("(min-width: 900px) and (pointer: coarse)");
  // Phones: the type filter shares one row with the freshness and today line.
  const phone = useMediaQuery("(max-width: 850px)");
  const dishesToCook = allDayCounts(orders);
  const today = kitchenMeta?.today;
  const timing = (order) => {
    const created = new Date(order.created_at);
    const hasTime =
      Boolean(order.created_at) && Number.isFinite(created.getTime());
    const elapsedSeconds = hasTime
      ? Math.max(0, (now - created.getTime()) / 1000)
      : null;
    const elapsed =
      elapsedSeconds === null ? null : Math.floor(elapsedSeconds / 60);
    const ready = order.prep_ready_at ? new Date(order.prep_ready_at) : null;
    const remainingSeconds =
      order.status === "preparing" && ready && Number.isFinite(ready.getTime())
        ? (ready.getTime() - now) / 1000
        : null;
    const remaining =
      remainingSeconds === null
        ? null
        : remainingSeconds >= 0
          ? Math.ceil(remainingSeconds / 60)
          : -Math.ceil(-remainingSeconds / 60);
    const priority =
      order.status === "ready_to_serve"
        ? "normal"
        : ticketPriority({ elapsed, remaining });
    return {
      created,
      hasTime,
      elapsedSeconds,
      elapsed,
      ready,
      remainingSeconds,
      remaining,
      priority,
    };
  };
  const tickets = sortTickets(
    (board
      ? orders.filter((order) => !type || order.order_type === type)
      : visible
    ).map((order) => ({ order, ...timing(order) })),
  );
  const count = (value) =>
    orders.filter((order) => order.status === value).length;
  const renderTicket = (ticket) => {
    const { order } = ticket;
    const {
      created,
      hasTime,
      elapsedSeconds,
      elapsed,
      ready,
      remainingSeconds,
      remaining,
      priority,
    } = ticket;
    const estimatePassed = remaining !== null && ready.getTime() < now;
    const isReady = order.status === "ready_to_serve";
    const readyAt = order.ready_at ? new Date(order.ready_at) : null;
    const openTicket = ["confirmed", "preparing"].includes(order.status);
    const doneItems = (order.items || []).filter(
      (item) => item.prepared_at,
    ).length;
    const allergy =
      mentionsAllergy(order.customer_notes) ||
      (order.items || []).some((item) =>
        mentionsAllergy(item.special_instructions),
      );
    const rider = riderStatus(order.kitchen_delivery);
    const busy = !!pending[order.id];
    const nextStatus =
      order.status === "confirmed"
        ? "preparing"
        : order.status === "preparing"
          ? "ready_to_serve"
          : null;
    return (
      <article
        className="sage-kds-ticket"
        data-new={freshTickets.has(order.id) || undefined}
        data-ready={isReady || undefined}
        data-allergy={allergy || undefined}
        data-attention={estimatePassed || undefined}
        data-priority={priority}
        key={order.id}
        aria-label={`Kitchen order ${order.order_number}`}
        aria-busy={busy}
      >
        <header>
          <div>
            <span className="sage-ticket-type">
              {order.order_type === "delivery" && (
                <Truck size={16} aria-hidden="true" />
              )}
              {readable(order.order_type)}
              {order.table_number_snapshot
                ? /^table\s/i.test(order.table_number_snapshot)
                  ? ` · ${order.table_number_snapshot}`
                  : ` · Table ${order.table_number_snapshot}`
                : ""}
            </span>
            <h2>
              {order.order_number}
              {freshTickets.has(order.id) && (
                <span className="sage-ticket-new">New</span>
              )}
            </h2>
            {openTicket && (order.items || []).length > 1 && (
              <span className="sage-ticket-progress">
                {doneItems} of {order.items.length} done
              </span>
            )}
          </div>
          <div className="sage-ticket-age">
            <Clock3 size={18} aria-hidden="true" />
            <strong
              role="timer"
              aria-label={
                elapsed === null
                  ? undefined
                  : `${elapsed} minutes since ordered`
              }
            >
              {elapsedSeconds === null ? "—" : clockLabel(elapsedSeconds)}
            </strong>
            <span>
              {hasTime ? (
                <time dateTime={created.toISOString()}>
                  {created.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              ) : (
                "Time unavailable"
              )}
            </span>
          </div>
        </header>
        <div className="sage-ticket-state">
          <OrderStatusPill status={order.status} />
          {priority !== "normal" && (
            <span className="sage-priority-label">
              <TriangleAlert size={14} aria-hidden="true" />
              {priority === "late" ? "Late" : "Due soon"}
            </span>
          )}
          {remaining !== null && (
            <span
              className="sage-ticket-countdown"
              role="timer"
              aria-label={
                remaining >= 0
                  ? `${remaining} minutes left`
                  : `${-remaining} minutes over`
              }
            >
              {remainingSeconds >= 0
                ? `${clockLabel(remainingSeconds)} left`
                : `${clockLabel(-remainingSeconds)} over`}
            </span>
          )}
          {isReady && readyAt && (
            <span className="sage-ticket-countdown" role="timer">
              Ready {clockLabel((now - readyAt.getTime()) / 1000)} ago
            </span>
          )}
          {allergy && (
            <span className="sage-allergy-label">
              <TriangleAlert size={14} aria-hidden="true" />
              Allergy note
            </span>
          )}
          {estimatePassed && (
            <span className="sage-attention-label">
              Preparation estimate passed
            </span>
          )}
          {rider && (
            <span className="sage-rider-status" data-tone={rider.tone}>
              <Bike size={14} aria-hidden="true" />
              {rider.text}
            </span>
          )}
        </div>
        <ul className="sage-kds-items">
          {(order.items || []).map((item, index) => (
            <li
              key={item.id || `${order.id}-${index}`}
              data-done={item.prepared_at ? true : undefined}
            >
              {canUpdate && openTicket && item.id ? (
                <button
                  type="button"
                  className="sage-item-check"
                  role="checkbox"
                  aria-checked={Boolean(item.prepared_at)}
                  aria-label={`${item.item_name_snapshot} done`}
                  onClick={() => togglePrepared(order, item)}
                >
                  <Check size={14} aria-hidden="true" />
                </button>
              ) : null}
              <span className="sage-item-quantity">{item.quantity}×</span>
              <div>
                <strong>{item.item_name_snapshot}</strong>
                {item.variant_name_snapshot && (
                  <p>{item.variant_name_snapshot}</p>
                )}
                {item.addons?.length > 0 && (
                  <p className="sage-item-addons">
                    +{" "}
                    {item.addons
                      .map((addon) => addon.addon_name_snapshot || addon.name)
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                )}
                {item.special_instructions && (
                  <p
                    className="sage-item-instructions"
                    data-allergy={
                      mentionsAllergy(item.special_instructions) || undefined
                    }
                  >
                    Note: {item.special_instructions}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
        {order.customer_notes && (
          <p
            className="sage-ticket-note"
            data-allergy={mentionsAllergy(order.customer_notes) || undefined}
          >
            Order note: {order.customer_notes}
          </p>
        )}
        {order.order_type === "delivery" && (
          <div className="sage-ticket-prep">
            {order.status === "confirmed" && canUpdate ? (
              <fieldset disabled={busy}>
                <legend>Delivery preparation</legend>
                <label>
                  Prep time (min)
                  <input
                    aria-label={`Prep time for ${order.order_number}`}
                    type="number"
                    min="1"
                    max="180"
                    step="1"
                    value={prep[order.id]?.minutes ?? order.prep_minutes ?? 15}
                    onChange={(event) =>
                      setPrep((current) => ({
                        ...current,
                        [order.id]: {
                          ...current[order.id],
                          minutes: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
                <label>
                  Vehicle needed
                  <select
                    aria-label={`Vehicle needed for ${order.order_number}`}
                    value={
                      prep[order.id]?.vehicle ||
                      order.delivery_vehicle_class ||
                      "motorcycle"
                    }
                    onChange={(event) =>
                      setPrep((current) => ({
                        ...current,
                        [order.id]: {
                          ...current[order.id],
                          vehicle: event.target.value,
                        },
                      }))
                    }
                  >
                    <option value="bicycle">Bicycle</option>
                    <option value="motorcycle">Motorcycle</option>
                    <option value="car">Car</option>
                  </select>
                </label>
              </fieldset>
            ) : (
              <p>
                {order.prep_minutes
                  ? `${order.prep_minutes} min prep`
                  : "Preparation time not set"}{" "}
                · {readable(order.delivery_vehicle_class || "motorcycle")}
                {ready && Number.isFinite(ready.getTime())
                  ? ` · expected ${ready.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : ""}
              </p>
            )}
          </div>
        )}
        {rowFeedback[order.id] && !isError(rowFeedback[order.id]) && (
          <Feedback tone={rowFeedback[order.id].tone}>
            {rowFeedback[order.id].message}
          </Feedback>
        )}
        <footer>
          {isError(rowFeedback[order.id]) && (
            <CardAlert>{rowFeedback[order.id].message}</CardAlert>
          )}
          {isReady ? (
            canUpdate && order.recallable ? (
              <button
                className="sage-button sage-button--secondary"
                disabled={busy}
                aria-busy={busy}
                onClick={async () => {
                  if (await recall(order))
                    setNotice(`${order.order_number} is back in preparation.`);
                }}
              >
                <Undo2 size={16} aria-hidden="true" />
                {busy ? "Updating ticket…" : "Undo ready"}
              </button>
            ) : (
              <p className="sage-freshness">
                {order.order_type === "delivery"
                  ? "Waiting for the rider."
                  : order.order_type === "dine_in"
                    ? "Waiting to be served."
                    : "Waiting for pickup."}
              </p>
            )
          ) : canUpdate && nextStatus ? (
            <button
              className="sage-button"
              disabled={busy}
              aria-busy={busy}
              onClick={async () => {
                const success = await advance(order, nextStatus);
                if (success) {
                  setNotice(
                    `${order.order_number}: ${nextStatus === "preparing" ? "preparation started" : "ready for handoff"}.`,
                  );
                  if (nextStatus === "ready_to_serve")
                    heading.current?.focus({ preventScroll: true });
                }
              }}
            >
              {nextStatus === "ready_to_serve" ? (
                <Check size={20} aria-hidden="true" />
              ) : (
                <ChefHat size={20} aria-hidden="true" />
              )}
              {busy ? "Updating ticket…" : actionLabels[nextStatus]}
            </button>
          ) : (
            <p className="sage-freshness">
              Preparation updates are unavailable for this account.
            </p>
          )}
        </footer>
      </article>
    );
  };
  return (
    <section
      className="welcome sage-staff sage-kitchen"
      data-workspace="kitchen"
    >
      <header className="sage-page-heading">
        <div>
          <span className="eyebrow">KITCHEN DISPLAY</span>
          <h1 ref={heading} tabIndex={-1}>
            Kitchen queue
          </h1>
          <p>
            Clear tickets. Thoughtful preparation. Every order in its place.
          </p>
        </div>
        <button
          className="sage-button sage-button--secondary"
          onClick={load}
          disabled={refreshing}
          aria-busy={refreshing}
        >
          <RefreshCw size={18} aria-hidden="true" />
          <span className="admin-refresh-label">
            {refreshing ? "Refreshing…" : "Refresh queue"}
          </span>
        </button>
      </header>
      <div className="sage-stat-grid">
        <article>
          <span>Waiting to prepare</span>
          <strong>{loading || !updatedAt ? "—" : count("confirmed")}</strong>
          <small>Confirmed orders</small>
        </article>
        <article>
          <span>In preparation</span>
          <strong>{loading || !updatedAt ? "—" : count("preparing")}</strong>
          <small>Moving through the kitchen</small>
        </article>
        <article>
          <span>For delivery</span>
          <strong>
            {loading || !updatedAt
              ? "—"
              : orders.filter((order) => order.order_type === "delivery")
                  .length}
          </strong>
          <small>Coordinate the pickup</small>
        </article>
      </div>
      <div className="sage-toolbar">
        <div
          className="sage-filter-chips"
          role="group"
          aria-label="Kitchen status"
        >
          {[
            ["", "All tickets"],
            ["confirmed", "Waiting"],
            ["preparing", "Preparing"],
            ["ready_to_serve", "Ready"],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={status === value}
              onClick={() => setStatus(value)}
            >
              {label}
            </button>
          ))}
        </div>
        {!phone && (
          <label className="sage-field">
            Order type
            <select
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              <option value="">All types</option>
              <option value="dine_in">Dine in</option>
              <option value="pickup">Pickup</option>
              <option value="delivery">Delivery</option>
            </select>
          </label>
        )}
      </div>
      {phone && (
        <div className="kitchen-phone-bar">
          <p>
            {updatedAt
              ? `Updated ${updatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
              : "Connecting…"}
            {today && (
              <small>
                <strong>{today.done}</strong> done today
                {today.average_prep_minutes !== null && (
                  <>
                    {" · "}
                    <strong>{today.average_prep_minutes} min</strong> avg prep
                  </>
                )}
              </small>
            )}
          </p>
          <label className="kitchen-type-select">
            <span className="sr-only">Order type</span>
            <SlidersHorizontal size={15} aria-hidden="true" />
            <select
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              <option value="">All types</option>
              <option value="dine_in">Dine in</option>
              <option value="pickup">Pickup</option>
              <option value="delivery">Delivery</option>
            </select>
          </label>
        </div>
      )}
      <KitchenSoldOut canUpdate={canUpdate} />
      {!phone && (
        <p className="sage-freshness">
          {updatedAt
            ? `Updated ${updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : "Connecting to the kitchen"}
          {screenAwake && " · Screen stays on"}
        </p>
      )}
      {today && !phone && (
        <p className="sage-kds-today">
          <strong>{today.done}</strong> done today
          {today.average_prep_minutes !== null && (
            <>
              {" · "}
              <strong>{today.average_prep_minutes} min</strong> average prep
            </>
          )}
        </p>
      )}
      {dishesToCook.length > 0 && (
        <section className="sage-kds-allday" aria-label="All-day counts">
          <h2>All day</h2>
          <ul>
            {dishesToCook.map((dish) => (
              <li key={dish.name}>
                <b>{dish.quantity}×</b> {dish.name}
              </li>
            ))}
          </ul>
        </section>
      )}
      {notice && <Feedback tone="success">{notice}</Feedback>}
      {error && (
        <div className="df-global-banner" data-open="true">
          <Feedback onRetry={load}>
            {error}
            {orders.length > 0 && " Last loaded tickets remain visible."}
          </Feedback>
        </div>
      )}
      {loading && <Skeleton label="Loading kitchen tickets" />}
      {!loading && !error && visible.length === 0 && (
        <EmptyState
          icon={ChefHat}
          title={
            orders.length
              ? "No tickets match this view"
              : "The kitchen is all caught up"
          }
          description={
            orders.length
              ? "Choose another status or order type to see more tickets."
              : "Confirmed orders appear here when they are ready for preparation."
          }
        />
      )}
      {board ? (
        <div className="sage-kds-board">
          {[
            ["confirmed", "Waiting"],
            ["preparing", "Preparing"],
            ["ready_to_serve", "Ready"],
          ].map(([key, label]) => {
            const column = tickets.filter(
              (ticket) => ticket.order.status === key,
            );
            return (
              <section
                key={key}
                className="sage-kds-column"
                data-status={key}
                aria-label={`${label} tickets`}
              >
                <h2>
                  {label}
                  <span>{column.length}</span>
                </h2>
                {column.map(renderTicket)}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="sage-kds-grid">{tickets.map(renderTicket)}</div>
      )}
    </section>
  );
}

// Moving an order on: a chime when it's ready or done, a softer tap for
// the steps in between, and a falling tone for a cancellation.
const statusSound = (status) =>
  status === "cancelled"
    ? "remove"
    : ["ready", "ready_to_serve", "served", "completed"].includes(status)
      ? "success"
      : "tap";

export function OrdersView({
  kitchen = false,
  staff = false,
  user = { permissions: [] },
}) {
  // Phones list orders as cards for every role, so they load behind cards.
  const phoneList = useMediaQuery("(max-width: 850px)");
  const [loading, setLoading] = useState(true);
  // "?order=12" (from an alert) brings that order into view and marks it.
  const [searchParams] = useSearchParams();
  const focusOrder = searchParams.get("order");
  useEffect(() => {
    if (!focusOrder || loading) return undefined;
    const card = document.querySelector(
      `.order-card[data-order-id="${CSS.escape(focusOrder)}"]`,
    );
    if (!card) return undefined;
    card.scrollIntoView({ block: "center" });
    card.classList.add("is-focused");
    const timer = window.setTimeout(
      () => card.classList.remove("is-focused"),
      2800,
    );
    return () => window.clearTimeout(timer);
  }, [focusOrder, loading]);
  const [orders, setOrders] = useState([]);
  const [kitchenMeta, setKitchenMeta] = useState(null);
  const [prep, setPrep] = useState({});
  const [pending, setPending] = useState({});
  const [rowFeedback, setRowFeedback] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const locks = useRef(new Set());
  const mounted = useRef(true);
  const request = useRef(null);
  const [error, setError] = useState("");
  const [filters, setFilterState] = useState({
    order_type: "",
    status: "",
    payment_status: "",
    from: "",
    to: "",
  });
  // Staff lists come a page at a time; a new filter starts again at page 1.
  const paged = staff && !kitchen;
  const [page, setPage] = useState(1);
  const [pageMeta, setPageMeta] = useState(null);
  const setFilters = (update) => {
    setPage(1);
    setFilterState(update);
  };
  // Phones fold the filters behind one button; desktop always shows them.
  // The order type stays out as chips on phones, so it is not counted there.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilters = Object.entries(filters).filter(
    ([key, value]) => value && !(phoneList && key === "order_type"),
  ).length;
  async function load() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setRefreshing(true);
    setError("");
    try {
      const query = new URLSearchParams(
        Object.entries(filters).filter(([, v]) => v),
      );
      query.set("per_page", paged ? String(ORDERS_PER_PAGE) : "100");
      if (paged) query.set("page", String(page));
      const result = await api(
        kitchen ? "/kitchen/orders" : `/orders?${query}`,
        { signal: controller.signal },
      );
      if (!controller.signal.aborted) {
        setOrders(result.data || []);
        if (kitchen) setKitchenMeta(result.meta || null);
        if (paged)
          setPageMeta({
            page: result.current_page || 1,
            lastPage: result.last_page || 1,
            total: result.total ?? (result.data || []).length,
            from: result.from || 0,
            to: result.to || 0,
          });
        setUpdatedAt(new Date());
      }
    } catch (e) {
      if (!controller.signal.aborted) setError(e.message);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    load();
    const unsubscribe = subscribeToLiveChanges(load, [
      "orders",
      "payments",
      "deliveries",
    ]);
    return () => {
      unsubscribe();
      request.current?.abort();
    };
  }, [kitchen, filters, page]);
  async function perform(order, task, message) {
    if (locks.current.has(order.id)) return;
    locks.current.add(order.id);
    setPending((current) => ({ ...current, [order.id]: true }));
    setRowFeedback((current) => ({ ...current, [order.id]: null }));
    try {
      await task();
      if (mounted.current)
        setRowFeedback((current) => ({
          ...current,
          [order.id]: { tone: "success", message },
        }));
      if (mounted.current) await load();
      return true;
    } catch (failure) {
      if (mounted.current) {
        setRowFeedback((current) => ({
          ...current,
          [order.id]: { tone: "error", message: failure.message },
        }));
        if (failure.uncertain) await load();
      }
      return false;
    } finally {
      locks.current.delete(order.id);
      if (mounted.current)
        setPending((current) => ({ ...current, [order.id]: false }));
    }
  }
  // Kitchen: send a ticket marked ready by mistake back to preparation.
  async function recall(order) {
    const done = await perform(
      order,
      () => api(`/kitchen/orders/${order.id}/recall`, { method: "POST" }),
      "Back in preparation.",
    );
    if (done) playSound("remove");
    return done;
  }
  // Kitchen: tick a dish off. Shown at once; corrected by a reload on failure.
  async function togglePrepared(order, item) {
    const prepared = !item.prepared_at;
    playSound(prepared ? "tap" : "remove");
    setOrders((current) =>
      current.map((row) =>
        row.id !== order.id
          ? row
          : {
              ...row,
              items: row.items.map((line) =>
                line.id === item.id
                  ? {
                      ...line,
                      prepared_at: prepared ? new Date().toISOString() : null,
                    }
                  : line,
              ),
            },
      ),
    );
    try {
      await api(`/kitchen/order-items/${item.id}/prepared`, {
        method: "PATCH",
        body: JSON.stringify({ prepared }),
      });
    } catch (failure) {
      setRowFeedback((current) => ({
        ...current,
        [order.id]: { tone: "error", message: failure.message },
      }));
      load();
    }
  }
  async function advance(order, status) {
    const done = await perform(
      order,
      async () => {
        const minutes = Number(
          prep[order.id]?.minutes ?? order.prep_minutes ?? 15,
        );
        if (
          ["confirmed", "preparing"].includes(status) &&
          order.order_type === "delivery" &&
          (!Number.isInteger(minutes) || minutes < 1 || minutes > 180)
        ) {
          throw new Error(
            "Enter a kitchen prep time from 1 to 180 minutes before updating this order.",
          );
        }
        await api(`/orders/${order.id}/status`, {
          method: "PATCH",
          body: JSON.stringify({
            status,
            ...((status === "confirmed" || status === "preparing") &&
            order.order_type === "delivery" &&
            (!order.prep_ready_at || prep[order.id] !== undefined)
              ? {
                  prep_minutes: minutes,
                  delivery_vehicle_class:
                    prep[order.id]?.vehicle ||
                    order.delivery_vehicle_class ||
                    "motorcycle",
                }
              : {}),
          }),
        });
      },
      "Order updated.",
    );
    if (done) playSound(statusSound(status));
    return done;
  }
  async function checkout(order) {
    return perform(
      order,
      async () => {
        const p = await api(`/orders/${order.id}/payments/checkout`, {
          method: "POST",
        });
        window.location.assign(p.data.checkout_url);
      },
      "Opening secure checkout…",
    );
  }
  async function cash(order) {
    return perform(
      order,
      async () => {
        await api(`/orders/${order.id}/payments/cash`, { method: "POST" });
      },
      "Cash payment recorded.",
    );
  }
  const next = {
    pending: ["confirmed", "cancelled"],
    confirmed: ["preparing", "cancelled"],
    preparing: ["ready_to_serve", "cancelled"],
    ready_to_serve: ["served", "completed"],
    served: ["completed"],
  };
  const canCash = user.permissions?.includes("payments.manage");
  if (kitchen)
    return (
      <KitchenQueue
        {...{
          orders,
          loading,
          refreshing,
          updatedAt,
          error,
          load,
          prep,
          setPrep,
          pending,
          rowFeedback,
          advance,
          recall,
          togglePrepared,
          kitchenMeta,
          user,
        }}
      />
    );
  return (
    <section
      className={`welcome orders-workspace${staff ? " orders-workspace--staff" : ""}`}
    >
      <header className="orders-page-heading">
        <div>
          <span className="eyebrow">
            {kitchen ? "KITCHEN" : "ORDER MANAGEMENT"}
          </span>
          <h1>{kitchen ? "Kitchen queue" : staff ? "Orders" : "My orders"}</h1>
          {staff && (
            <p>
              {kitchen
                ? "Keep preparation moving, one order at a time."
                : "Review orders, coordinate preparation, and keep payments in order."}
            </p>
          )}
        </div>
        {staff && !kitchen && (
          <button
            type="button"
            className="orders-filter-toggle"
            aria-expanded={filtersOpen}
            aria-controls="order-filters"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <SlidersHorizontal size={17} aria-hidden="true" />
            Filters
            {activeFilters > 0 && (
              <span className="orders-filter-count">{activeFilters}</span>
            )}
          </button>
        )}
        <button
          className="refresh-button orders-refresh"
          onClick={load}
          disabled={refreshing}
          aria-busy={refreshing}
        >
          <RefreshCw size={16} aria-hidden="true" />
          <span className="admin-refresh-label">
            {refreshing ? "Refreshing…" : "Refresh"}
          </span>
        </button>
      </header>
      {staff && !kitchen && (
        <div
          id="order-filters"
          className="order-filters"
          data-open={filtersOpen || undefined}
          role="group"
          aria-label="Filter orders"
        >
          {!phoneList && (
            <label>
              Order type
              <select
                aria-label="Order type"
                value={filters.order_type}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, order_type: e.target.value }))
                }
              >
                <option value="">All types</option>
                <option value="dine_in">Dine in</option>
                <option value="pickup">Pickup</option>
                <option value="delivery">Delivery</option>
              </select>
            </label>
          )}
          <label>
            Order status
            <select
              aria-label="Order status"
              value={filters.status}
              onChange={(e) =>
                setFilters((f) => ({ ...f, status: e.target.value }))
              }
            >
              <option value="">All statuses</option>
              {[
                "pending",
                "confirmed",
                "preparing",
                "ready_to_serve",
                "served",
                "completed",
                "cancelled",
              ].map((s) => (
                <option key={s} value={s}>
                  {s.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label>
            Payment status
            <select
              aria-label="Payment status"
              value={filters.payment_status}
              onChange={(e) =>
                setFilters((f) => ({ ...f, payment_status: e.target.value }))
              }
            >
              <option value="">All payments</option>
              <option value="paid">Paid</option>
              <option value="pending">Checkout pending</option>
              <option value="unpaid">Unpaid</option>
            </select>
          </label>
          <div className="order-date-filter">
            <span>From</span>
            <DatePicker
              label="From"
              max={filters.to || undefined}
              value={filters.from}
              onChange={(value) => setFilters((f) => ({ ...f, from: value }))}
            />
          </div>
          <div className="order-date-filter">
            <span>To</span>
            <DatePicker
              label="To"
              min={filters.from || undefined}
              value={filters.to}
              onChange={(value) => setFilters((f) => ({ ...f, to: value }))}
            />
          </div>
          <button
            className="orders-clear-filters"
            onClick={() =>
              setFilters({
                order_type: "",
                status: "",
                payment_status: "",
                from: "",
                to: "",
              })
            }
          >
            Clear
          </button>
        </div>
      )}
      {paged && phoneList && (
        <div className="orders-type-chips" role="group" aria-label="Order type">
          {[
            ["", "All"],
            ["dine_in", "Dine in"],
            ["pickup", "Pickup"],
            ["delivery", "Delivery"],
          ].map(([value, text]) => (
            <button
              key={value || "all"}
              type="button"
              aria-pressed={filters.order_type === value}
              onClick={() => setFilters((f) => ({ ...f, order_type: value }))}
            >
              {text}
            </button>
          ))}
        </div>
      )}
      <div className="orders-result-bar">
        <span>
          {loading
            ? "Loading orders…"
            : (() => {
                const count = paged
                  ? (pageMeta?.total ?? orders.length)
                  : orders.length;
                return `${count} ${count === 1 ? "order" : "orders"} in this view`;
              })()}
        </span>
        {updatedAt && (
          <span>
            <Clock3 size={14} aria-hidden="true" />
            Updated{" "}
            {updatedAt.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
          </span>
        )}
      </div>
      {loading &&
        (staff && !phoneList ? (
          <Skeleton label="Loading your content" />
        ) : (
          <CustomerScreenSkeleton
            variant="orderList"
            label="Loading your orders"
          />
        ))}
      {error && (
        <div className="df-global-banner" data-open="true">
          <Feedback onRetry={load}>{error}</Feedback>
        </div>
      )}
      {!loading && !error && orders.length === 0 && (
        <EmptyState
          title="No orders to show"
          description={
            staff
              ? "No orders match this view. Adjust your filters or check again when orders arrive."
              : "Your next meal starts with the menu."
          }
        />
      )}
      <div className="staff-list orders-list">
        {orders.map((order) => {
          const busy = !!pending[order.id];
          const showPrep =
            staff &&
            order.order_type === "delivery" &&
            ["pending", "confirmed"].includes(order.status);
          const transitions = staff
            ? (next[order.status] || []).filter(
                (status) =>
                  !(order.order_type === "delivery" && status === "completed"),
              )
            : [];
          const hasBalance =
            order.payment_summary &&
            Number(order.payment_summary.balance_due) > 0;
          const canPay =
            !staff &&
            !["completed", "cancelled"].includes(order.status) &&
            hasBalance;
          const canRecordCash =
            staff && canCash && hasBalance && order.status !== "cancelled";
          const hasActions =
            showPrep ||
            transitions.length > 0 ||
            (!staff && order.status === "pending") ||
            canPay ||
            canRecordCash;
          const created = order.created_at ? new Date(order.created_at) : null;
          const TypeIcon =
            order.order_type === "delivery"
              ? Truck
              : order.order_type === "dine_in"
                ? UtensilsCrossed
                : ShoppingBag;
          return (
            <article
              key={order.id}
              data-order-id={order.id}
              className={`order-card${hasActions ? " order-card--actionable" : ""}`}
              aria-label={`Order ${order.order_number}`}
              aria-busy={busy}
            >
              <div className="order-card-summary">
                <div className="order-card-title">
                  <div className="order-card-reference">
                    <span className="order-type-icon">
                      <TypeIcon size={19} aria-hidden="true" />
                    </span>
                    <strong>{order.order_number}</strong>
                  </div>
                  <OrderStatusPill status={order.status} />
                </div>
                <div className="order-card-metadata">
                  <span className="order-type">
                    {readable(order.order_type)}
                  </span>
                  <span>
                    {order.customer_name_snapshot || "Guest customer"}
                  </span>
                  {created && !Number.isNaN(created.getTime()) && (
                    <time dateTime={created.toISOString()}>
                      {created.toLocaleString([], {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>
                  )}
                </div>
                {!!order.items?.length && (
                  <p className="order-card-items">
                    {order.items
                      .map(
                        (item) =>
                          `${item.quantity}× ${item.item_name_snapshot}${item.special_instructions ? ` — ${item.special_instructions}` : ""}`,
                      )
                      .join(" · ")}
                  </p>
                )}
                <dl className="order-payment-summary">
                  <div>
                    <dt>Order total</dt>
                    <dd>{money(order.total)}</dd>
                  </div>
                  {order.payment_summary && (
                    <>
                      <div>
                        <dt>Paid</dt>
                        <dd>{money(order.payment_summary.paid)}</dd>
                      </div>
                      <div
                        className="order-balance"
                        data-outstanding={hasBalance}
                      >
                        <dt>Balance due</dt>
                        <dd>{money(order.payment_summary.balance_due)}</dd>
                      </div>
                    </>
                  )}
                </dl>
                {Number(order.payment_summary?.pending) > 0 && (
                  <p className="order-checkout-note">
                    An online checkout is pending.
                  </p>
                )}
                {order.delivery && (
                  <p className="order-delivery-metadata">
                    {foodLabels[order.status] || readable(order.status)} ·{" "}
                    {deliveryLabels[order.delivery.status] ||
                      readable(order.delivery.status)}
                  </p>
                )}
                {order.delivery && !staff && (
                  <Link
                    className="customer-order-track-link"
                    to={`/delivery/${order.delivery.id}/tracking`}
                  >
                    Track order & rider
                  </Link>
                )}
                {rowFeedback[order.id] &&
                  (!hasActions || !isError(rowFeedback[order.id])) && (
                    <Feedback tone={rowFeedback[order.id].tone}>
                      {rowFeedback[order.id].message}
                    </Feedback>
                  )}
              </div>
              {hasActions && (
                <div className="order-card-workbench">
                  <fieldset className="order-card-controls" disabled={busy}>
                    <legend className="sr-only">
                      Actions for {order.order_number}
                    </legend>
                    {showPrep && (
                      <div className="dispatch-prep-fields order-prep-fields">
                        <label>
                          Prep time (min)
                          <input
                            aria-label={`Prep time for ${order.order_number}`}
                            type="number"
                            min="1"
                            max="180"
                            step="1"
                            value={
                              prep[order.id]?.minutes ??
                              order.prep_minutes ??
                              15
                            }
                            onChange={(event) =>
                              setPrep((current) => ({
                                ...current,
                                [order.id]: {
                                  ...current[order.id],
                                  minutes: event.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                        <label>
                          Vehicle needed
                          <select
                            aria-label={`Vehicle needed for ${order.order_number}`}
                            value={
                              prep[order.id]?.vehicle ||
                              order.delivery_vehicle_class ||
                              "motorcycle"
                            }
                            onChange={(event) =>
                              setPrep((current) => ({
                                ...current,
                                [order.id]: {
                                  ...current[order.id],
                                  vehicle: event.target.value,
                                },
                              }))
                            }
                          >
                            <option value="bicycle">
                              Bicycle · small order
                            </option>
                            <option value="motorcycle">
                              Motorcycle · standard order
                            </option>
                            <option value="car">
                              Car · large / catering order
                            </option>
                          </select>
                        </label>
                      </div>
                    )}
                    {isError(rowFeedback[order.id]) && (
                      <CardAlert>{rowFeedback[order.id].message}</CardAlert>
                    )}
                    <div className="order-action-buttons">
                      {transitions.map((status) => (
                        <button
                          key={status}
                          className={`order-action-button${status === "cancelled" ? " order-action-button--cancel" : ""}`}
                          onClick={() => advance(order, status)}
                        >
                          {actionLabels[status] || readable(status)}
                        </button>
                      ))}
                      {!staff && order.status === "pending" && (
                        <button
                          className="order-action-button order-action-button--cancel"
                          onClick={() => advance(order, "cancelled")}
                        >
                          Cancel order
                        </button>
                      )}
                      {canPay && (
                        <button
                          className="order-action-button"
                          onClick={() => checkout(order)}
                        >
                          Pay online ·{" "}
                          {money(order.payment_summary.balance_due)}
                        </button>
                      )}
                      {canRecordCash && (
                        <button
                          className="order-action-button order-action-button--cash"
                          onClick={() => cash(order)}
                        >
                          Record cash ·{" "}
                          {money(order.payment_summary.balance_due)}
                        </button>
                      )}
                    </div>
                    {busy && (
                      <p className="order-action-status" role="status">
                        Saving order update…
                      </p>
                    )}
                  </fieldset>
                </div>
              )}
            </article>
          );
        })}
      </div>
      {paged && !loading && pageMeta && pageMeta.lastPage > 1 && (
        <Pagination
          page={pageMeta.page}
          lastPage={pageMeta.lastPage}
          total={pageMeta.total}
          from={pageMeta.from}
          to={pageMeta.to}
          disabled={refreshing}
          onChange={(value) => {
            setPage(value);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}
    </section>
  );
}
