import { EmptyState, Feedback, Skeleton, StatusBadge } from "../components/ui";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import "../components/riderDispatch.css";
import {
  foodLabels,
  deliveryLabels,
} from "../components/CustomerOrderProgress";
export function OrdersView({
  kitchen = false,
  staff = false,
  user = { permissions: [] },
}) {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [prep, setPrep] = useState({});
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
      if (!controller.signal.aborted) setOrders(result.data || []);
    } catch (e) {
      if (!controller.signal.aborted) setError(e.message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => {
      clearInterval(timer);
      request.current?.abort();
    };
  }, [kitchen, filters]);
  async function advance(order, status) {
    try {
      await api(`/orders/${order.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          ...((status === "confirmed" || status === "preparing") &&
          order.order_type === "delivery" &&
          (!order.prep_ready_at || prep[order.id] !== undefined)
            ? {
                prep_minutes: Number(
                  prep[order.id]?.minutes ?? order.prep_minutes ?? 15,
                ),
                delivery_vehicle_class:
                  prep[order.id]?.vehicle ||
                  order.delivery_vehicle_class ||
                  "motorcycle",
              }
            : {}),
        }),
      });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }
  async function checkout(order) {
    try {
      const p = await api(`/orders/${order.id}/payments/checkout`, {
        method: "POST",
      });
      window.location.assign(p.data.checkout_url);
    } catch (e) {
      setError(e.message);
    }
  }
  async function cash(order) {
    try {
      await api(`/orders/${order.id}/payments/cash`, { method: "POST" });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }
  const next = {
    pending: ["confirmed", "cancelled"],
    confirmed: ["preparing", "cancelled"],
    preparing: ["ready_to_serve", "cancelled"],
    ready_to_serve: ["served", "completed"],
    served: ["completed"],
  };
  const canCash = user.permissions?.includes("payments.manage");
  return (
    <section className="welcome">
      <span className="eyebrow">
        {kitchen ? "KITCHEN" : "ORDER MANAGEMENT"}
      </span>
      <h1>{kitchen ? "Kitchen queue" : staff ? "Orders" : "My orders"}</h1>
      {loading && <Skeleton label="Loading your content" />}
      {!loading && !error && orders.length === 0 && (
        <EmptyState
          title="No orders to show"
          description="Your next meal starts with the menu. Staff queues update as orders arrive."
        />
      )}
      {error && <Feedback onRetry={load}>{error}</Feedback>}
      {staff && !kitchen && (
        <div className="order-filters">
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
          <label>
            From
            <input
              type="date"
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
              value={filters.to}
              onChange={(e) =>
                setFilters((f) => ({ ...f, to: e.target.value }))
              }
            />
          </label>
          <button
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
      <button className="refresh-button" onClick={load}>
        Refresh
      </button>
      <div className="staff-list">
        {orders.map((order) => (
          <article key={order.id}>
            <div>
              <strong>{order.order_number}</strong>
              <StatusBadge status={order.status} />
              <small>
                {order.order_type} · {order.customer_name_snapshot} · ₱
                {order.total}
              </small>
              {order.payment_summary && (
                <small>
                  Paid ₱{order.payment_summary.paid} · Balance ₱
                  {order.payment_summary.balance_due}
                  {Number(order.payment_summary.pending) > 0
                    ? " · checkout pending"
                    : ""}
                </small>
              )}
              <small>
                {order.items
                  ?.map(
                    (i) =>
                      `${i.quantity}× ${i.item_name_snapshot}${i.special_instructions ? ` — ${i.special_instructions}` : ""}`,
                  )
                  .join(" · ")}
              </small>
              {order.delivery && !staff && (
                <Link
                  className="customer-order-track-link"
                  to={`/delivery/${order.delivery.id}/tracking`}
                >
                  Track order & rider
                </Link>
              )}
              {order.delivery && (
                <small>
                  {foodLabels[order.status] || order.status} ·{" "}
                  {deliveryLabels[order.delivery.status] ||
                    order.delivery.status.replaceAll("_", " ")}
                </small>
              )}
            </div>
            <div>
              {staff &&
                order.order_type === "delivery" &&
                ["pending", "confirmed"].includes(order.status) && (
                  <div className="dispatch-prep-fields">
                    <label>
                      Kitchen prep time (minutes)
                      <input
                        aria-label={`Prep time for ${order.order_number}`}
                        type="number"
                        min="1"
                        max="180"
                        value={
                          prep[order.id]?.minutes ?? order.prep_minutes ?? 15
                        }
                        onChange={(e) =>
                          setPrep((current) => ({
                            ...current,
                            [order.id]: {
                              ...current[order.id],
                              minutes: e.target.value,
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
                        onChange={(e) =>
                          setPrep((current) => ({
                            ...current,
                            [order.id]: {
                              ...current[order.id],
                              vehicle: e.target.value,
                            },
                          }))
                        }
                      >
                        <option value="bicycle">Bicycle · small order</option>
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
              {staff &&
                (next[order.status] || [])
                  .filter(
                    (status) =>
                      !(
                        order.order_type === "delivery" &&
                        status === "completed"
                      ),
                  )
                  .map((status) => (
                    <button key={status} onClick={() => advance(order, status)}>
                      {status.replaceAll("_", " ")}
                    </button>
                  ))}
              {!staff && order.status === "pending" && (
                <button onClick={() => advance(order, "cancelled")}>
                  Cancel order
                </button>
              )}
              {!staff &&
                !["completed", "cancelled"].includes(order.status) &&
                order.payment_summary &&
                Number(order.payment_summary.balance_due) > 0 && (
                  <button onClick={() => checkout(order)}>
                    Pay online · ₱{order.payment_summary.balance_due}
                  </button>
                )}
              {staff &&
                canCash &&
                order.payment_summary &&
                Number(order.payment_summary.balance_due) > 0 && (
                  <button onClick={() => cash(order)}>
                    Record cash · ₱{order.payment_summary.balance_due}
                  </button>
                )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
