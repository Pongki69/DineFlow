import { EmptyState, Feedback, Skeleton, StatusBadge } from "../components/ui";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChefHat, Clock3, RefreshCw, Truck } from "lucide-react";
import { api } from "../api";
import "../components/riderDispatch.css";
import "./ordersWorkspace.css";
import "./staffSage.css";
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
  user,
}) {
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [now, setNow] = useState(Date.now);
  const [notice, setNotice] = useState("");
  const heading = useRef(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
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
  const count = (value) =>
    orders.filter((order) => order.status === value).length;
  return (
    <section className="welcome sage-staff sage-kitchen">
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
          {refreshing ? "Refreshing…" : "Refresh queue"}
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
      </div>
      <p className="sage-freshness">
        {updatedAt
          ? `Updated ${updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · checks every 5 seconds`
          : "Connecting to the kitchen"}
      </p>
      {notice && <Feedback tone="success">{notice}</Feedback>}
      {error && (
        <Feedback onRetry={load}>
          {error}
          {orders.length > 0 && " Last loaded tickets remain visible."}
        </Feedback>
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
      <div className="sage-kds-grid">
        {visible.map((order) => {
          const created = new Date(order.created_at);
          const hasTime =
            Boolean(order.created_at) && Number.isFinite(created.getTime());
          const elapsed = hasTime
            ? Math.max(0, Math.floor((now - created.getTime()) / 60000))
            : null;
          const ready = order.prep_ready_at
            ? new Date(order.prep_ready_at)
            : null;
          const estimatePassed =
            order.status === "preparing" &&
            ready &&
            Number.isFinite(ready.getTime()) &&
            ready.getTime() < now;
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
              data-attention={estimatePassed || undefined}
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
                      ? ` · Table ${order.table_number_snapshot}`
                      : ""}
                  </span>
                  <h2>{order.order_number}</h2>
                </div>
                <div className="sage-ticket-age">
                  <Clock3 size={18} aria-hidden="true" />
                  <strong>{elapsed === null ? "—" : `${elapsed} min`}</strong>
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
                <StatusBadge status={order.status} />
                {estimatePassed && (
                  <span className="sage-attention-label">
                    Preparation estimate passed
                  </span>
                )}
              </div>
              <ul className="sage-kds-items">
                {(order.items || []).map((item, index) => (
                  <li key={item.id || `${order.id}-${index}`}>
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
                            .map(
                              (addon) =>
                                addon.addon_name_snapshot || addon.name,
                            )
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                      )}
                      {item.special_instructions && (
                        <p className="sage-item-instructions">
                          Note: {item.special_instructions}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {order.customer_notes && (
                <p className="sage-ticket-note">
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
                          value={
                            prep[order.id]?.minutes ?? order.prep_minutes ?? 15
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
              {rowFeedback[order.id] && (
                <Feedback tone={rowFeedback[order.id].tone}>
                  {rowFeedback[order.id].message}
                </Feedback>
              )}
              <footer>
                {canUpdate && nextStatus ? (
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
        })}
      </div>
    </section>
  );
}

export function OrdersView({
  kitchen = false,
  staff = false,
  user = { permissions: [] },
}) {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [prep, setPrep] = useState({});
  const [pending, setPending] = useState({});
  const [rowFeedback, setRowFeedback] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const locks = useRef(new Set());
  const mounted = useRef(true);
  const request = useRef(null);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    order_type: "",
    status: "",
    payment_status: "",
    from: "",
    to: "",
  });
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
      query.set("per_page", "100");
      const result = await api(
        kitchen ? "/kitchen/orders" : `/orders?${query}`,
        { signal: controller.signal },
      );
      if (!controller.signal.aborted) {
        setOrders(result.data || []);
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
    const timer = setInterval(load, 5000);
    return () => {
      clearInterval(timer);
      request.current?.abort();
    };
  }, [kitchen, filters]);
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
  async function advance(order, status) {
    return perform(
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
        <button
          className="refresh-button orders-refresh"
          onClick={load}
          disabled={refreshing}
          aria-busy={refreshing}
        >
          <RefreshCw size={16} aria-hidden="true" />
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </header>
      {staff && !kitchen && (
        <div className="order-filters" role="group" aria-label="Filter orders">
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
              <option value="">All payment states</option>
              <option value="paid">Paid</option>
              <option value="pending">Checkout pending</option>
              <option value="unpaid">Unpaid</option>
            </select>
          </label>
          <label>
            From
            <input
              type="date"
              max={filters.to || undefined}
              value={filters.from}
              onChange={(e) =>
                setFilters((f) => ({ ...f, from: e.target.value }))
              }
            />
          </label>
          <label>
            To
            <input
              type="date"
              min={filters.from || undefined}
              value={filters.to}
              onChange={(e) =>
                setFilters((f) => ({ ...f, to: e.target.value }))
              }
            />
          </label>
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
      <div className="orders-result-bar">
        <span>
          {loading
            ? "Loading orders…"
            : `${orders.length} ${orders.length === 1 ? "order" : "orders"} in this view`}
        </span>
        {updatedAt && (
          <span>
            <Clock3 size={14} aria-hidden="true" />
            Updated{" "}
            {updatedAt.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            · refreshes every 5s
          </span>
        )}
      </div>
      {loading && <Skeleton label="Loading your content" />}
      {error && <Feedback onRetry={load}>{error}</Feedback>}
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
          const canRecordCash = staff && canCash && hasBalance;
          const hasActions =
            showPrep ||
            transitions.length > 0 ||
            (!staff && order.status === "pending") ||
            canPay ||
            canRecordCash;
          const created = order.created_at ? new Date(order.created_at) : null;
          return (
            <article
              key={order.id}
              className={`order-card${hasActions ? " order-card--actionable" : ""}`}
              aria-label={`Order ${order.order_number}`}
              aria-busy={busy}
            >
              <div className="order-card-summary">
                <div className="order-card-title">
                  <strong>{order.order_number}</strong>
                  <StatusBadge status={order.status} />
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
                      <div>
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
                {rowFeedback[order.id] && (
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
    </section>
  );
}
