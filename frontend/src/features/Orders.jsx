import { playSound } from "../uiSound";
import { EmptyState, Feedback, Skeleton } from "../components/ui";
import { OrderStatusPill } from "../components/OrderStatusPill";
import { CustomerScreenSkeleton } from "../components/CustomerScreenSkeleton";
import { useMediaQuery } from "../components/useMediaQuery";
import {
  CardHeading,
  StatIcon,
  useAdminDesktop,
} from "../components/adminDesk";
import { Pagination } from "../components/Pagination";
import {
  KitchenSoldOut,
  KitchenSoldOutStrip,
  useKitchenMenu,
  useNewTicketAlert,
  useScreenWakeLock,
} from "../components/KitchenTools";
import {
  allDayCounts,
  mentionsAllergy,
  riderStatus,
  sortTickets,
} from "../components/kitchenTicket";
import { Fragment, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Bike,
  Check,
  ChefHat,
  ChevronDown,
  History,
  MapPin,
  Pin,
  CircleCheck,
  ClipboardList,
  Clock3,
  RefreshCw,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  TriangleAlert,
  Truck,
  Undo2,
  UtensilsCrossed,
} from "lucide-react";
import {
  OrderDeskDetails,
  PaymentStateBadge,
  placedText,
} from "./OrderDeskDetails";
import { api } from "../api";
import { subscribeToLiveChanges } from "../liveUpdates";
import { DatePicker } from "../components/DatePicker";
import "../components/riderDispatch.css";
import "./ordersWorkspace.css";
import "./staffSage.css";
import "./staffOrdersMobile.css";
import "./kitchenDesktop.css";
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
// Order statuses in service order, with the names staff use for them.
const ORDER_STATUSES = [
  ["pending", "Pending"],
  ["confirmed", "Confirmed"],
  ["preparing", "Preparing"],
  ["ready_to_serve", "Ready"],
  ["served", "Served"],
  ["completed", "Completed"],
  ["cancelled", "Cancelled"],
];
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

// Admin desktop: a ticket older than this was never closed; it leaves the
// live board for the folded "Stale" list.
const STALE_HOURS = 12;

// Ticket age (minutes) at which the KDS raises a ticket's priority.
const KDS_SOON_MINUTES = 10;
const KDS_LATE_MINUTES = 20;
const KITCHEN_STAGES = [
  {
    status: "confirmed",
    label: "Waiting",
    description: "Confirmed orders to start",
    icon: Clock3,
  },
  {
    status: "preparing",
    label: "Preparing",
    description: "Orders in the kitchen",
    icon: ChefHat,
  },
  {
    status: "ready_to_serve",
    label: "Ready",
    description: "Ready for pickup or service",
    icon: CircleCheck,
  },
];

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

// Admin desktop board: past an hour a wait reads in words, so a ticket left
// open for days says "3 d 14 h" instead of "86:25:27".
function ageLabel(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds < 3600) return clockLabel(seconds);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours < 24)
    return `${hours} h ${String(minutes % 60).padStart(2, "0")} min`;
  return `${Math.floor(hours / 24)} d ${hours % 24} h`;
}

/**
 * A ticket's dishes as lines to cook. With `merge` (the cook view), identical
 * lines - same dish, size, add-ons and note - read as one with the total.
 */
function kitchenLines(items, merge) {
  const lines = [];
  const byKey = new Map();
  for (const item of items || []) {
    const key = merge
      ? [
          item.item_name_snapshot,
          item.variant_name_snapshot || "",
          (item.addons || [])
            .map((addon) => addon.addon_name_snapshot || addon.name)
            .sort()
            .join("|"),
          item.special_instructions || "",
        ].join("\u0000")
      : null;
    const line = key === null ? null : byKey.get(key);
    if (line) {
      line.quantity += Number(item.quantity) || 0;
      line.items.push(item);
      continue;
    }
    const fresh = { item, quantity: Number(item.quantity) || 0, items: [item] };
    lines.push(fresh);
    if (key !== null) byKey.set(key, fresh);
  }
  return lines.map((line) => ({
    ...line,
    done: line.items.every((item) => item.prepared_at),
    some: line.items.some((item) => item.prepared_at),
  }));
}

const KITCHEN_VIEW_KEY = "dineflow.kitchenView";

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
  togglePin,
  kitchenMeta,
  user,
}) {
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [now, setNow] = useState(Date.now);
  const [notice, setNotice] = useState("");
  const [staleOpen, setStaleOpen] = useState(false);
  const [prepOpen, setPrepOpen] = useState(() => new Set());
  const [allDayOpen, setAllDayOpen] = useState(false);
  // Cook view (line screens): food and prep notes only, identical dishes
  // merged. Expeditor view (the pass): customer, rider and delivery details.
  // Each screen remembers its choice; kitchen staff start in the cook view.
  const [kitchenView, setKitchenView] = useState(() => {
    try {
      const saved = localStorage.getItem(KITCHEN_VIEW_KEY);
      if (saved === "cook" || saved === "expeditor") return saved;
    } catch {
      // No storage (private window): fall back to the role default.
    }
    return user?.roles?.includes("kitchen_staff") ? "cook" : "expeditor";
  });
  useEffect(() => {
    try {
      localStorage.setItem(KITCHEN_VIEW_KEY, kitchenView);
    } catch {
      // The view still applies for this visit.
    }
  }, [kitchenView]);
  const cookView = kitchenView === "cook";
  const pinTicket = (order) => {
    togglePin(order);
    requestAnimationFrame(() => {
      const button = document.querySelector(`[data-pin="${order.id}"]`);
      if (!button) return;
      button.focus({ preventScroll: true });
      button.closest("article")?.scrollIntoView({ block: "nearest" });
    });
  };
  const refreshButton = (
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
  );
  const viewSwitch = (
    <div
      className="kitchen-view-switch"
      role="group"
      aria-label="Ticket detail"
    >
      {[
        ["cook", "Cook", ChefHat],
        ["expeditor", "Expeditor", ClipboardList],
      ].map(([value, text, Icon]) => (
        <button
          key={value}
          type="button"
          aria-pressed={kitchenView === value}
          title={
            value === "cook"
              ? "Food and prep notes only, identical dishes merged"
              : "Customer, rider and delivery details for packing"
          }
          onClick={() => setKitchenView(value)}
        >
          <Icon size={15} aria-hidden="true" />
          {text}
        </button>
      ))}
    </div>
  );
  const heading = useRef(null);
  // Ticket timers tick every second, like a kitchen clock.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const canUpdate = user.permissions?.some((permission) =>
    ["kitchen.orders.update", "orders.manage"].includes(permission),
  );
  const matchingType = orders.filter(
    (order) => !type || order.order_type === type,
  );
  const visible = matchingType.filter(
    (order) => !status || order.status === status,
  );
  const freshTickets = useNewTicketAlert(orders, !loading && !!updatedAt);
  const screenAwake = useScreenWakeLock();
  const desktop = useMediaQuery("(min-width: 1025px)");
  const tabletBoard = useMediaQuery("(min-width: 900px) and (pointer: coarse)");
  // Phones: the type filter shares one row with the freshness and today line.
  const phone = useMediaQuery("(max-width: 850px)");
  // Admin desktop: one control card above the board (see the render below).
  const desk = useAdminDesktop();
  // Admin desktop: one menu list feeds the availability panel and the
  // sold-out strip on the control card.
  const kitchenMenu = useKitchenMenu(desk);
  const canManageMenu = user.permissions?.includes("menu.manage");
  // Admin desktop: tickets left open for more than STALE_HOURS are stale.
  // They leave the board, the all-day totals and the late count.
  const isStale = (order) =>
    desk &&
    Boolean(order.created_at) &&
    now - new Date(order.created_at).getTime() > STALE_HOURS * 3600000;
  const liveOrders = desk ? orders.filter((order) => !isStale(order)) : orders;
  const dishesToCook = allDayCounts(liveOrders);
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
    (tabletBoard && !desktop ? matchingType : visible)
      .filter((order) => !isStale(order))
      .map((order) => ({
        order,
        ...timing(order),
      })),
  );
  const staleTickets = desk
    ? sortTickets(
        visible.filter(isStale).map((order) => ({ order, ...timing(order) })),
      )
    : [];
  const board = desktop
    ? !loading && (tickets.length > 0 || staleTickets.length > 0)
    : tabletBoard;
  const QueueGroup = desktop ? "div" : Fragment;
  const stages =
    desktop && status
      ? KITCHEN_STAGES.filter((stage) => stage.status === status)
      : KITCHEN_STAGES;
  const count = (value) =>
    orders.filter((order) => order.status === value).length;
  // Tickets past their preparation estimate, for the desktop "Running late".
  const late = liveOrders.filter(
    (order) =>
      order.status !== "ready_to_serve" && timing(order).priority === "late",
  ).length;
  const renderTicket = (ticket, options = {}) => {
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
    // The pass pins a ticket to the top of its column on every screen. The
    // expeditor view can pin; the cook view only shows the mark.
    const pinned = openTicket && Boolean(order.kitchen_pinned_at);
    const canPin = canUpdate && openTicket && !options.stale && !cookView;
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
    // Admin desktop: one timing chip says how late a ticket is, and the item
    // progress moves down beside the action.
    const clock = desk ? ageLabel : clockLabel;
    const overdue = remaining !== null && remaining < 0;
    const progress = openTicket && (order.items || []).length > 1;
    const ageTimer = (
      <strong
        role="timer"
        aria-label={
          elapsed === null ? undefined : `${elapsed} minutes since ordered`
        }
      >
        {elapsedSeconds === null ? "—" : clock(elapsedSeconds)}
      </strong>
    );
    // Admin desktop: one timer per ticket. Preparing shows time left or over
    // the estimate, Ready how long it has waited, Waiting its age.
    const deskTimer = !desk ? null : remaining !== null ? (
      <strong
        role="timer"
        aria-label={
          overdue
            ? `${-remaining} minutes over the preparation estimate`
            : `${remaining} minutes left`
        }
      >
        {overdue
          ? `${clock(-remainingSeconds)} over`
          : `${clock(remainingSeconds)} left`}
      </strong>
    ) : isReady && readyAt ? (
      <strong role="timer">
        Ready {clock((now - readyAt.getTime()) / 1000)}
      </strong>
    ) : (
      ageTimer
    );
    return (
      <article
        className="sage-kds-ticket"
        data-new={freshTickets.has(order.id) || undefined}
        data-ready={isReady || undefined}
        data-allergy={allergy || undefined}
        data-attention={estimatePassed || undefined}
        data-priority={priority}
        data-pinned={pinned || undefined}
        key={order.id}
        aria-label={`Kitchen order ${order.order_number}${pinned ? ", pinned" : ""}`}
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
              {/* Admin desktop: pickups are called by name and deliveries
                  bagged by name; dine-in goes by its table. */}
              {desk &&
                !cookView &&
                order.order_type !== "dine_in" &&
                order.customer_name_snapshot && (
                  <span className="kitchen-ticket-customer">
                    {"· "}
                    {order.customer_name_snapshot}
                  </span>
                )}
            </span>
            <h2>
              {order.order_number}
              {freshTickets.has(order.id) && (
                <span className="sage-ticket-new">New</span>
              )}
            </h2>
            {progress && !desk && (
              <span className="sage-ticket-progress">
                {doneItems} of {order.items.length} done
              </span>
            )}
          </div>
          {canPin ? (
            <button
              type="button"
              className="kitchen-pin"
              data-pin={order.id}
              aria-pressed={pinned}
              aria-label={`Pin ${order.order_number}`}
              title={
                pinned
                  ? "Pinned to the top on every kitchen screen. Select to unpin."
                  : "Pin to the top on every kitchen screen"
              }
              onClick={() => pinTicket(order)}
            >
              <Pin size={15} aria-hidden="true" />
            </button>
          ) : pinned ? (
            <span
              className="kitchen-pin"
              data-pinned
              title="Pinned to the top by the pass"
            >
              <Pin size={15} aria-hidden="true" />
              <span className="sr-only">Pinned</span>
            </span>
          ) : null}
          <div
            className="sage-ticket-age"
            data-priority={desk ? priority : undefined}
          >
            {desk ? (
              <span className="kitchen-age-chip">
                {priority === "normal" ? (
                  <Clock3 size={14} aria-hidden="true" />
                ) : (
                  <TriangleAlert size={14} aria-hidden="true" />
                )}
                {priority !== "normal" && (
                  <span className="sr-only">
                    {priority === "late" ? "Late: " : "Due soon: "}
                  </span>
                )}
                {deskTimer}
              </span>
            ) : (
              <>
                <Clock3 size={18} aria-hidden="true" />
                {ageTimer}
              </>
            )}
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
        {(!desk || options.stale || allergy || (rider && !cookView)) && (
          <div className="sage-ticket-state">
            {(!desk || options.stale) && (
              <OrderStatusPill status={order.status} />
            )}
            {priority !== "normal" && !desk && (
              <span className="sage-priority-label">
                <TriangleAlert size={14} aria-hidden="true" />
                {priority === "late" ? "Late" : "Due soon"}
              </span>
            )}
            {remaining !== null && !desk && (
              <span
                className="sage-ticket-countdown"
                data-over={(desk && overdue) || undefined}
                data-soon={(desk && priority === "soon") || undefined}
                role="timer"
                aria-label={
                  remaining >= 0
                    ? `${remaining} minutes left`
                    : `${-remaining} minutes over`
                }
              >
                {remainingSeconds >= 0
                  ? `${clock(remainingSeconds)} left`
                  : `${clock(-remainingSeconds)} over`}
              </span>
            )}
            {isReady && readyAt && !desk && (
              <span className="sage-ticket-countdown" role="timer">
                Ready {clock((now - readyAt.getTime()) / 1000)} ago
              </span>
            )}
            {allergy && (
              <span className="sage-allergy-label">
                <TriangleAlert size={14} aria-hidden="true" />
                Allergy note
              </span>
            )}
            {estimatePassed && !desk && (
              <span className="sage-attention-label">
                Preparation estimate passed
              </span>
            )}
            {rider && !cookView && (
              <span className="sage-rider-status" data-tone={rider.tone}>
                <Bike size={14} aria-hidden="true" />
                {rider.text}
              </span>
            )}
          </div>
        )}
        {desk && isReady ? (
          <p className="kitchen-ready-items">
            {(order.items || [])
              .map((item) => `${item.quantity}× ${item.item_name_snapshot}`)
              .join(" · ")}
          </p>
        ) : (
          <ul className="sage-kds-items">
            {kitchenLines(order.items, cookView).map(
              ({ item, quantity, items, done, some }, index) => (
                <li
                  key={item.id || `${order.id}-${index}`}
                  data-done={done || undefined}
                >
                  {canUpdate && openTicket && item.id ? (
                    <button
                      type="button"
                      className="sage-item-check"
                      role="checkbox"
                      aria-checked={done ? true : some ? "mixed" : false}
                      aria-label={`${item.item_name_snapshot} done`}
                      onClick={() =>
                        items
                          .filter((line) =>
                            done ? line.prepared_at : !line.prepared_at,
                          )
                          .forEach((line) => togglePrepared(order, line))
                      }
                    >
                      <Check size={14} aria-hidden="true" />
                    </button>
                  ) : null}
                  <span className="sage-item-quantity">{quantity}×</span>
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
                            (addon) => addon.addon_name_snapshot || addon.name,
                          )
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                    )}
                    {item.special_instructions && (
                      <p
                        className="sage-item-instructions"
                        data-allergy={
                          mentionsAllergy(item.special_instructions) ||
                          undefined
                        }
                      >
                        Note: {item.special_instructions}
                      </p>
                    )}
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
        {order.customer_notes && !(desk && isReady) && (
          <p
            className="sage-ticket-note"
            data-allergy={mentionsAllergy(order.customer_notes) || undefined}
          >
            Order note: {order.customer_notes}
          </p>
        )}
        {!cookView &&
          order.order_type === "delivery" &&
          (order.delivery_recipient_name || order.delivery_address) && (
            <p className="kitchen-deliver-to">
              <MapPin size={14} aria-hidden="true" />
              <span>
                Deliver to{" "}
                <strong>
                  {order.delivery_recipient_name ||
                    order.customer_name_snapshot}
                </strong>
                {order.delivery_address && ` · ${order.delivery_address}`}
              </span>
            </p>
          )}
        {order.order_type === "delivery" && !(desk && isReady) && !cookView && (
          <div className="sage-ticket-prep">
            {order.status === "confirmed" &&
            canUpdate &&
            desk &&
            !prepOpen.has(order.id) ? (
              <p className="kitchen-prep-summary">
                <span>
                  Prep{" "}
                  <strong>
                    {prep[order.id]?.minutes ?? order.prep_minutes ?? 15} min
                  </strong>{" "}
                  ·{" "}
                  {readable(
                    prep[order.id]?.vehicle ||
                      order.delivery_vehicle_class ||
                      "motorcycle",
                  )}
                </span>
                <button
                  type="button"
                  className="kitchen-prep-change"
                  disabled={busy}
                  aria-label={`Change delivery preparation for ${order.order_number}`}
                  onClick={() =>
                    setPrepOpen((current) => new Set(current).add(order.id))
                  }
                >
                  Change
                </button>
              </p>
            ) : order.status === "confirmed" && canUpdate ? (
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
        <footer data-desk={desk || undefined}>
          {isError(rowFeedback[order.id]) && (
            <CardAlert>{rowFeedback[order.id].message}</CardAlert>
          )}
          {desk && progress && (
            <span className="kitchen-desk-progress">
              <i aria-hidden="true">
                <b
                  style={{
                    width: `${(doneItems / order.items.length) * 100}%`,
                  }}
                />
              </i>
              {doneItems} of {order.items.length} done
            </span>
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
              className={
                desk ? "sage-button sage-button--secondary" : "sage-button"
              }
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
                <Check size={desk ? 16 : 20} aria-hidden="true" />
              ) : (
                <ChefHat size={desk ? 16 : 20} aria-hidden="true" />
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
        {/* Admin desktop: the view for this screen sits with Refresh. */}
        {desk ? (
          <div className="kitchen-head-actions">
            {viewSwitch}
            {refreshButton}
          </div>
        ) : (
          refreshButton
        )}
      </header>
      {!desk && (
        <div className="sage-stat-grid">
          <article>
            <span>Waiting to prepare</span>
            <strong>{loading || !updatedAt ? "—" : count("confirmed")}</strong>
            <small>Confirmed orders</small>
            <StatIcon icon={Clock3} />
          </article>
          <article>
            <span>In preparation</span>
            <strong>{loading || !updatedAt ? "—" : count("preparing")}</strong>
            <small>Moving through the kitchen</small>
            <StatIcon icon={ChefHat} />
          </article>
          {desk && (
            <article data-attention={(updatedAt && late > 0) || undefined}>
              <span>Running late</span>
              <strong>{loading || !updatedAt ? "—" : late}</strong>
              <small>Past the preparation estimate</small>
              <StatIcon icon={TriangleAlert} />
            </article>
          )}
          <article>
            <span>For delivery</span>
            <strong>
              {loading || !updatedAt
                ? "—"
                : orders.filter((order) => order.order_type === "delivery")
                    .length}
            </strong>
            <small>Coordinate the pickup</small>
            <StatIcon icon={Bike} />
          </article>
        </div>
      )}
      {desk && (
        <section
          className="kitchen-desk-controls"
          aria-label="Kitchen controls"
        >
          <div className="kitchen-desk-row">
            {/* The board's columns are the stages, so only the type filters. */}
            <div
              className="sage-filter-chips"
              role="group"
              aria-label="Order type"
            >
              {[
                ["", "All types"],
                ["dine_in", "Dine in"],
                ["pickup", "Pickup"],
                ["delivery", "Delivery"],
              ].map(([value, text]) => (
                <button
                  key={value || "all"}
                  type="button"
                  aria-pressed={type === value}
                  onClick={() => setType(value)}
                >
                  {text}
                  {updatedAt && (
                    <span className="admin-count">
                      {/* What is on the board; stale tickets are counted apart. */}
                      {
                        liveOrders.filter(
                          (order) => !value || order.order_type === value,
                        ).length
                      }
                    </span>
                  )}
                </button>
              ))}
            </div>
            {updatedAt && late > 0 && (
              <span className="kitchen-late-chip">
                <TriangleAlert size={14} aria-hidden="true" />
                {late} running late
              </span>
            )}
            <p className="kitchen-desk-meta">
              {updatedAt
                ? `Updated ${updatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                : "Connecting to the kitchen"}
              {screenAwake && " · Screen stays on"}
              {today && (
                <>
                  {" · "}
                  <strong>{today.done}</strong> done today
                  {today.average_prep_minutes !== null && (
                    <>
                      {" · "}
                      <strong>{today.average_prep_minutes} min</strong> average
                      prep
                    </>
                  )}
                </>
              )}
            </p>
            <KitchenSoldOut
              canUpdate={canUpdate}
              menu={kitchenMenu}
              desk
              manageHref={canManageMenu ? "/admin/menu" : undefined}
            />
          </div>
          <KitchenSoldOutStrip menu={kitchenMenu} canUpdate={canUpdate} />
          {staleTickets.length > 0 && (
            <div className="kitchen-desk-stale">
              <h2>Stale</h2>
              <p>
                <strong>
                  {staleTickets.length}{" "}
                  {staleTickets.length === 1 ? "ticket" : "tickets"}
                </strong>{" "}
                older than {STALE_HOURS} hours, kept off the board. Close them
                in Order management.
              </p>
              <Link className="kitchen-stale-link" to="/admin/orders">
                Order management
              </Link>
              <button
                type="button"
                className="kitchen-stale-toggle"
                aria-expanded={staleOpen}
                aria-controls="kitchen-stale-list"
                onClick={() => setStaleOpen((value) => !value)}
              >
                {staleOpen ? "Hide" : "Show"}
                <ChevronDown size={16} aria-hidden="true" />
              </button>
            </div>
          )}
          {dishesToCook.length > 0 && (
            <div className="kitchen-desk-allday">
              <h2>All day</h2>
              <ul aria-label="All-day counts">
                {(allDayOpen ? dishesToCook : dishesToCook.slice(0, 8)).map(
                  (dish) => (
                    <li key={dish.name}>
                      <b>{dish.quantity}×</b> {dish.name}
                    </li>
                  ),
                )}
                {dishesToCook.length > 8 && (
                  <li className="kitchen-allday-more">
                    <button
                      type="button"
                      aria-expanded={allDayOpen}
                      onClick={() => setAllDayOpen((value) => !value)}
                    >
                      {allDayOpen
                        ? "Show fewer"
                        : `+${dishesToCook.length - 8} more`}
                    </button>
                  </li>
                )}
              </ul>
            </div>
          )}
        </section>
      )}
      {!desk && (
        <>
          <div className="sage-toolbar">
            <div
              className="sage-filter-chips"
              role="group"
              aria-label="Kitchen status"
            >
              {[{ status: "", label: "All tickets" }, ...KITCHEN_STAGES].map(
                ({ status: value, label }) => (
                  <button
                    key={value}
                    aria-pressed={status === value}
                    onClick={() => setStatus(value)}
                  >
                    {label}
                    {desktop && updatedAt && (
                      <span className="kitchen-filter-count">
                        {
                          matchingType.filter(
                            (order) => !value || order.status === value,
                          ).length
                        }
                      </span>
                    )}
                  </button>
                ),
              )}
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
            {viewSwitch}
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
                        <strong>{today.average_prep_minutes} min</strong> avg
                        prep
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
          <QueueGroup
            {...(desktop ? { className: "kitchen-queue-controls" } : {})}
          >
            <KitchenSoldOut canUpdate={canUpdate} />
            {!phone && (
              <QueueGroup
                {...(desktop ? { className: "kitchen-queue-meta" } : {})}
              >
                <p className="sage-freshness">
                  {updatedAt
                    ? `Updated ${updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                    : "Connecting to the kitchen"}
                  {screenAwake && " · Screen stays on"}
                </p>
                {today && (
                  <p className="sage-kds-today">
                    <strong>{today.done}</strong> done today
                    {today.average_prep_minutes !== null && (
                      <>
                        {" · "}
                        <strong>{today.average_prep_minutes} min</strong>{" "}
                        average prep
                      </>
                    )}
                  </p>
                )}
              </QueueGroup>
            )}
          </QueueGroup>
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
        </>
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
      {loading && (
        <Skeleton
          label="Loading kitchen tickets"
          layout={{ body: "board", columns: 3 }}
        />
      )}
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
      {desk && staleOpen && staleTickets.length > 0 && (
        <section
          id="kitchen-stale-list"
          className="kitchen-stale-list"
          aria-label="Stale tickets"
        >
          <header>
            <History size={18} aria-hidden="true" />
            <h2>Stale tickets</h2>
          </header>
          <div className="kitchen-stale-grid">
            {staleTickets.map((ticket) =>
              renderTicket(ticket, { stale: true }),
            )}
          </div>
        </section>
      )}
      {board ? (
        <div
          className="sage-kds-board"
          data-stage={desktop && status ? status : undefined}
        >
          {stages.map(({ status: key, label, description, icon: Icon }) => {
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
                {desktop ? (
                  <>
                    <header className="kitchen-stage-heading">
                      <Icon size={22} aria-hidden="true" />
                      <div>
                        <h2>{label}</h2>
                        <p>{description}</p>
                      </div>
                      <span>{column.length}</span>
                    </header>
                    {column.length ? (
                      <div className="kitchen-stage-tickets">
                        {column.map((ticket) => renderTicket(ticket))}
                      </div>
                    ) : desk ? (
                      <div className="kitchen-stage-empty" data-desk>
                        <Icon size={20} aria-hidden="true" />
                        <p>No tickets in this stage.</p>
                      </div>
                    ) : (
                      <p className="kitchen-stage-empty">
                        No tickets in this stage.
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <h2>
                      {label}
                      <span>{column.length}</span>
                    </h2>
                    {column.map(renderTicket)}
                  </>
                )}
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
  const wideDesktop = useMediaQuery("(min-width: 1201px)");
  const desk = useAdminDesktop();
  const triage = wideDesktop && staff && !kitchen;
  const [selection, setSelection] = useState(null);
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
    if (!triage) card.scrollIntoView({ block: "center" });
    card.classList.add("is-focused");
    const timer = window.setTimeout(
      () => card.classList.remove("is-focused"),
      2800,
    );
    return () => window.clearTimeout(timer);
  }, [focusOrder, loading, triage]);
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
    search: "",
  });
  // Staff lists come a page at a time; a new filter starts again at page 1.
  const paged = staff && !kitchen;
  const [page, setPage] = useState(1);
  const [pageMeta, setPageMeta] = useState(null);
  // Orders per status in the current view (search, type, payment, dates).
  const [statusCounts, setStatusCounts] = useState(null);
  const setFilters = (update) => {
    setPage(1);
    setFilterState(update);
  };
  // Desktop search waits for a pause in typing before it asks the server.
  const [searchDraft, setSearchDraft] = useState("");
  useEffect(() => {
    const term = searchDraft.trim();
    if (term === filters.search) return undefined;
    const timer = window.setTimeout(
      () => setFilters((f) => ({ ...f, search: term })),
      300,
    );
    return () => window.clearTimeout(timer);
  }, [searchDraft, filters.search]);
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
        if (!kitchen) setStatusCounts(result.status_counts || null);
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
  // Kitchen: pin a ticket to the top of its column on every screen. Shown at
  // once; corrected by a reload on failure.
  async function togglePin(order) {
    const pinned = !order.kitchen_pinned_at;
    playSound(pinned ? "tap" : "remove");
    setOrders((current) =>
      current.map((row) =>
        row.id === order.id
          ? {
              ...row,
              kitchen_pinned_at: pinned ? new Date().toISOString() : null,
            }
          : row,
      ),
    );
    try {
      await api(`/kitchen/orders/${order.id}/pin`, {
        method: "PATCH",
        body: JSON.stringify({ pinned }),
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
  const preferredOrder =
    selection?.focusOrder === focusOrder ? selection.id : focusOrder;
  const selectedOrder = triage
    ? (orders.find((order) => String(order.id) === preferredOrder) ?? orders[0])
    : null;
  const visibleOrders = selectedOrder ? [selectedOrder] : orders;
  useEffect(() => {
    if (selectedOrder && selection?.focusOrder !== focusOrder)
      setSelection({ id: focusOrder ?? String(selectedOrder.id), focusOrder });
  }, [focusOrder, selectedOrder, selection]);
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
          togglePin,
          kitchenMeta,
          user,
        }}
      />
    );
  // With the queue beside the order details, the pager belongs to the queue.
  const orderPager = paged && !loading && pageMeta && pageMeta.lastPage > 1 && (
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
  );
  return (
    <section
      className={`welcome orders-workspace${staff ? " orders-workspace--staff" : ""}${selectedOrder ? " orders-triage" : ""}`}
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
          {desk && (
            <label className="orders-search">
              Search
              <span className="orders-search-field">
                <Search size={16} aria-hidden="true" />
                <input
                  type="search"
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  placeholder="Order number or customer"
                  aria-label="Search orders"
                />
              </span>
            </label>
          )}
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
          {/* Desktop picks the status from the tabs under the filters. */}
          {!desk && (
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
                {ORDER_STATUSES.map(([s]) => (
                  <option key={s} value={s}>
                    {s.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
          )}
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
            onClick={() => {
              setSearchDraft("");
              setFilters({
                order_type: "",
                status: "",
                payment_status: "",
                from: "",
                to: "",
                search: "",
              });
            }}
          >
            Clear
          </button>
        </div>
      )}
      {paged && desk && (
        <div
          className="sage-filter-chips orders-status-tabs"
          role="group"
          aria-label="Order status"
        >
          {[["", "All orders"], ...ORDER_STATUSES].map(([value, text]) => {
            const count = statusCounts
              ? value
                ? Number(statusCounts[value]) || 0
                : Object.values(statusCounts).reduce(
                    (sum, total) => sum + (Number(total) || 0),
                    0,
                  )
              : null;
            return (
              <button
                key={value || "all"}
                type="button"
                aria-pressed={filters.status === value}
                onClick={() => setFilters((f) => ({ ...f, status: value }))}
              >
                {text}
                {count !== null && (
                  <span className="admin-count" aria-label={`${count} orders`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
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
          <Skeleton
            label="Loading your content"
            layout={{ body: "table", rows: 8 }}
          />
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
      {triage && selectedOrder && (
        <section
          className="orders-triage-queue"
          aria-labelledby="orders-queue-title"
        >
          {desk ? (
            <CardHeading
              id="orders-queue-title"
              icon={ClipboardList}
              title="Order queue"
              description="Select an order to see its items, payments and next step."
            />
          ) : (
            <h2 id="orders-queue-title">Order queue</h2>
          )}
          <div
            className="orders-triage-columns"
            data-detailed={desk || undefined}
            aria-hidden="true"
          >
            <span>Order</span>
            {desk && <span>Placed</span>}
            <span>Type</span>
            <span>Status</span>
            {desk && <span>Payment</span>}
            <span>Total</span>
          </div>
          <ul aria-label="Orders in this view">
            {orders.map((order) => {
              const placed = desk ? placedText(order.created_at) : null;
              return (
                <li key={order.id}>
                  <button
                    type="button"
                    className="orders-triage-row"
                    data-detailed={desk || undefined}
                    aria-pressed={order.id === selectedOrder.id}
                    aria-controls="orders-triage-inspector"
                    onClick={() =>
                      setSelection({ id: String(order.id), focusOrder })
                    }
                  >
                    <span>
                      <strong>{order.order_number}</strong>
                      <small>
                        {order.customer_name_snapshot || "Guest customer"}
                      </small>
                    </span>
                    {desk && (
                      <span className="orders-placed">
                        {placed ? (
                          <>
                            <time dateTime={placed.iso}>{placed.primary}</time>
                            {placed.secondary && (
                              <small>{placed.secondary}</small>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </span>
                    )}
                    <span className="order-type">
                      {readable(order.order_type)}
                    </span>
                    <span>
                      <OrderStatusPill status={order.status} />
                    </span>
                    {desk && (
                      <span>
                        <PaymentStateBadge order={order} />
                      </span>
                    )}
                    <span>{money(order.total)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {orderPager}
        </section>
      )}
      <div
        className="staff-list orders-list"
        id={triage ? "orders-triage-inspector" : undefined}
      >
        {visibleOrders.map((order) => {
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
                {!!order.items?.length &&
                  (triage ? (
                    <div className="orders-triage-items">
                      <h3>Items</h3>
                      <ul>
                        {order.items.map((item) => (
                          <li key={item.id}>
                            <span>{item.quantity}×</span>
                            <span>
                              {item.item_name_snapshot}
                              {item.special_instructions && (
                                <small>{item.special_instructions}</small>
                              )}
                            </span>
                            {item.line_total != null && (
                              <span className="orders-triage-line-total">
                                {money(item.line_total)}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="order-card-items">
                      {order.items
                        .map(
                          (item) =>
                            `${item.quantity}× ${item.item_name_snapshot}${item.special_instructions ? ` — ${item.special_instructions}` : ""}`,
                        )
                        .join(" · ")}
                    </p>
                  ))}
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
                {triage && desk && <OrderDeskDetails order={order} />}
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
      {!triage && orderPager}
    </section>
  );
}
