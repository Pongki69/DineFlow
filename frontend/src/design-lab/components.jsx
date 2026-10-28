// @ts-check
import { useEffect, useId, useRef } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  Inbox,
  LoaderCircle,
  RefreshCw,
  TriangleAlert,
  X,
  XCircle,
} from "lucide-react";
import { MOCK_RESTAURANT_INFO } from "../mocks/productionTestData";
import "./components.css";

/** @typedef {import("./types").MockOrder} MockOrder */

/** @param {number} value @param {number} fallback */
function positiveInteger(value, fallback) {
  return Number.isFinite(value) && value > 0
    ? Math.floor(value) || fallback
    : fallback;
}

/** @param {number} current @param {number} count @returns {Array<number | "ellipsis-start" | "ellipsis-end">} */
function pageItems(current, count) {
  if (count <= 7) return Array.from({ length: count }, (_, index) => index + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "ellipsis-end", count];
  if (current >= count - 3)
    return [
      1,
      "ellipsis-start",
      count - 4,
      count - 3,
      count - 2,
      count - 1,
      count,
    ];
  return [
    1,
    "ellipsis-start",
    current - 1,
    current,
    current + 1,
    "ellipsis-end",
    count,
  ];
}

/** Controlled pagination; invalid/stale pages are clamped without firing callbacks during render.
 * @param {import("./types").PaginationProps} props
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}) {
  const id = useId();
  const size = positiveInteger(pageSize, 10);
  const count = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
  const pages = Math.max(1, Math.ceil(count / size));
  const current = Math.min(pages, positiveInteger(page, 1));
  const from = count ? (current - 1) * size + 1 : 0;
  const to = Math.min(current * size, count);
  const sizes = [...new Set([size, 10, 25, 50, 100])].sort((a, b) => a - b);
  /** @param {number} next */
  function changePage(next) {
    if (next >= 1 && next <= pages && next !== current && count > 0)
      onPageChange(next);
  }
  return (
    <nav className="df-pagination" aria-label="Order pagination">
      <div className="df-pagination-summary">
        <p role="status" aria-live="polite">
          {from}–{to} of {count} orders
        </p>
        <label htmlFor={`${id}-size`}>Rows per page</label>
        <select
          id={`${id}-size`}
          value={size}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (next !== size) {
              onPageSizeChange(next);
              onPageChange(1);
            }
          }}
        >
          {sizes.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      <div className="df-pagination-pages">
        <button
          type="button"
          aria-label="Previous page"
          disabled={current === 1 || !count}
          onClick={() => changePage(current - 1)}
        >
          <ChevronLeft aria-hidden="true" size={18} />
        </button>
        {pageItems(current, pages).map((item) =>
          typeof item === "number" ? (
            <button
              type="button"
              key={item}
              aria-label={`Page ${item}`}
              aria-current={item === current ? "page" : undefined}
              disabled={!count}
              onClick={() => changePage(item)}
            >
              {item}
            </button>
          ) : (
            <span
              className="df-pagination-ellipsis"
              aria-hidden="true"
              key={item}
            >
              …
            </span>
          ),
        )}
        <button
          type="button"
          aria-label="Next page"
          disabled={current === pages || !count}
          onClick={() => changePage(current + 1)}
        >
          <ChevronRight aria-hidden="true" size={18} />
        </button>
      </div>
    </nav>
  );
}

/** @param {string} value */
function normalizedStatus(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

/** @param {import("./types").StatusBadgeProps} props */
export function StatusBadge({ status }) {
  const normalized = normalizedStatus(status);
  let tone = "neutral";
  let Icon = Circle;
  if (/^(pending|unpaid|reserved|assigned|awaiting)/.test(normalized)) {
    tone = "pending";
    Icon = Clock3;
  }
  if (
    /^(preparing|in transit|active|cleaning|occupied|accepted|picked up|arrived)/.test(
      normalized,
    )
  ) {
    tone = "progress";
    Icon = LoaderCircle;
  }
  if (
    /^(ready|completed|delivered|paid|available|online|served|confirmed)/.test(
      normalized,
    )
  ) {
    tone = "success";
    Icon = CheckCircle2;
  }
  if (/^(delayed|failed|cancelled|canceled|error|offline)/.test(normalized)) {
    tone = "danger";
    Icon = normalized.startsWith("cancel") ? XCircle : TriangleAlert;
  }
  const knownLabels = /** @type {Record<string, string>} */ ({
    "ready to serve": "Ready to serve",
    "in transit": "In transit",
    "picked up": "Picked up",
    "arrived at restaurant": "At restaurant",
    "paid (paymongo)": "Paid · PayMongo",
    "paid (cash)": "Paid · Cash",
    "pending assignment": "Awaiting rider",
  });
  const label =
    knownLabels[normalized] ||
    (normalized
      ? normalized.charAt(0).toUpperCase() + normalized.slice(1)
      : "Unknown");
  return (
    <span className="df-status-badge" data-tone={tone}>
      <Icon size={14} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: MOCK_RESTAURANT_INFO.currency,
});
const dateTime = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
});

/** @param {string} value */
function orderTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Time unavailable"
    : `${dateTime.format(date)} UTC`;
}

/** @param {import("./types").StatePanelProps} props */
export function StatePanel({ state, title, description, onRetry }) {
  const defaults = {
    loading: ["Loading orders", "Getting the latest order details."],
    empty: [
      "No matching orders",
      "Try a different search or clear your filters.",
    ],
    error: ["Orders could not load", "Try again to restore this view."],
    success: ["Changes saved", "Your changes are ready."],
  };
  const Icon =
    state === "loading"
      ? LoaderCircle
      : state === "error"
        ? TriangleAlert
        : state === "success"
          ? CheckCircle2
          : Inbox;
  return (
    <div
      className="df-state-panel"
      data-state={state}
      role={state === "error" ? "alert" : "status"}
      aria-live={state === "error" ? undefined : "polite"}
    >
      <Icon
        size={28}
        aria-hidden="true"
        className={state === "loading" ? "df-spin" : undefined}
      />
      <strong>{title || defaults[state][0]}</strong>
      <p>{description || defaults[state][1]}</p>
      {state === "loading" && (
        <div className="df-state-skeleton" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      )}
      {state === "error" && onRetry && (
        <button type="button" className="df-component-button" onClick={onRetry}>
          <RefreshCw size={17} aria-hidden="true" />
          Try again
        </button>
      )}
    </div>
  );
}

/** Responsive order list with real table semantics on desktop and contained definition cards on mobile.
 * Fixtures use USD explicitly; live API data is deliberately not accepted by this demo contract.
 * @param {import("./types").ResponsiveDataTableProps} props
 */
export function ResponsiveDataTable({
  orders,
  onView,
  loading = false,
  error = null,
  onRetry,
}) {
  if (loading) return <StatePanel state="loading" />;
  if (error)
    return <StatePanel state="error" description={error} onRetry={onRetry} />;
  if (!orders.length) return <StatePanel state="empty" />;
  return (
    <div className="df-orders-data">
      <div className="df-orders-desktop">
        <table className="df-orders-table">
          <caption className="df-sr-only">
            Sample orders, customer, fulfillment, payment, elapsed time, and
            total in US dollars
          </caption>
          <thead>
            <tr>
              {[
                "Order",
                "Customer",
                "Fulfillment",
                "Status",
                "Payment",
                "Elapsed",
                "Total (USD)",
                "Details",
              ].map((label) => (
                <th key={label} scope="col">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <th scope="row">
                  <strong>{order.id}</strong>
                  <time dateTime={order.createdAt}>
                    {orderTime(order.createdAt)}
                  </time>
                </th>
                <td>
                  {order.customerName}
                  <span className="df-table-meta">
                    {order.items.reduce((sum, item) => sum + item.qty, 0)} items
                  </span>
                </td>
                <td>
                  {order.orderType}
                  {order.tableNumber && (
                    <span className="df-table-meta">{order.tableNumber}</span>
                  )}
                </td>
                <td>
                  <StatusBadge status={order.status} />
                </td>
                <td>
                  <StatusBadge status={order.paymentStatus} />
                </td>
                <td>
                  <span className="df-table-elapsed">
                    <Clock3 size={14} aria-hidden="true" />
                    {order.elapsedMinutes} min
                  </span>
                </td>
                <td className="df-table-total">{money.format(order.total)}</td>
                <td>
                  <button
                    type="button"
                    className="df-table-view"
                    aria-label={`View order ${order.id}`}
                    onClick={() => onView(order)}
                  >
                    <ArrowRight size={18} aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="df-orders-mobile" aria-label="Sample orders">
        {orders.map((order) => (
          <li key={order.id}>
            <article
              className="df-order-mobile-card"
              aria-label={`Order ${order.id}`}
            >
              <header>
                <div>
                  <strong>{order.id}</strong>
                  <time dateTime={order.createdAt}>
                    {orderTime(order.createdAt)}
                  </time>
                </div>
                <StatusBadge status={order.status} />
              </header>
              <dl>
                <div>
                  <dt>Customer</dt>
                  <dd>{order.customerName}</dd>
                </div>
                <div>
                  <dt>Fulfillment</dt>
                  <dd>
                    {order.orderType}
                    {order.tableNumber ? ` · ${order.tableNumber}` : ""}
                  </dd>
                </div>
                <div>
                  <dt>Payment</dt>
                  <dd>
                    <StatusBadge status={order.paymentStatus} />
                  </dd>
                </div>
                <div>
                  <dt>Elapsed</dt>
                  <dd>{order.elapsedMinutes} min</dd>
                </div>
                <div>
                  <dt>Items</dt>
                  <dd>
                    {order.items.reduce((sum, item) => sum + item.qty, 0)}
                  </dd>
                </div>
                <div>
                  <dt>Total (USD)</dt>
                  <dd className="df-table-total">
                    {money.format(order.total)}
                  </dd>
                </div>
              </dl>
              <button
                type="button"
                className="df-component-button"
                onClick={() => onView(order)}
                aria-label={`View order ${order.id}`}
              >
                View order
                <ArrowRight size={17} aria-hidden="true" />
              </button>
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Native modal dialog provides background inertness; explicit tab wrapping also protects custom content.
 * @param {import("./types").DrawerProps} props
 */
export function Drawer({ open, onClose, title, children, side = "right" }) {
  const dialog = useRef(/** @type {HTMLDialogElement | null} */ (null));
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const element = dialog.current;
    if (!element || !open) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const overflow = document.body.style.overflow;
    const paddingRight = document.body.style.paddingRight;
    const scrollbar = Math.max(
      0,
      window.innerWidth - document.documentElement.clientWidth,
    );
    document.body.style.overflow = "hidden";
    if (scrollbar > 0) {
      const currentPadding =
        Number.parseFloat(
          window.getComputedStyle(document.body).paddingRight,
        ) || 0;
      document.body.style.paddingRight = `${currentPadding + scrollbar}px`;
    }
    if (!element.open) element.showModal();
    element.querySelector("button")?.focus();
    /** @param {KeyboardEvent} event */
    function keepFocus(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !element) return;
      const focusable = Array.from(
        element.querySelectorAll(
          "button, a[href], input, select, textarea, [tabindex]",
        ),
      ).filter(
        (node) =>
          node instanceof HTMLElement &&
          !node.hasAttribute("disabled") &&
          node.getAttribute("tabindex") !== "-1" &&
          !node.closest("[hidden], [inert]") &&
          window.getComputedStyle(node).display !== "none" &&
          window.getComputedStyle(node).visibility !== "hidden" &&
          (typeof node.checkVisibility !== "function" ||
            node.checkVisibility({ checkVisibilityCSS: true })),
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === element)
      ) {
        event.preventDefault();
        if (last instanceof HTMLElement) last.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        if (first instanceof HTMLElement) first.focus();
      }
    }
    element.addEventListener("keydown", keepFocus);
    return () => {
      element.removeEventListener("keydown", keepFocus);
      if (element.open) element.close();
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
      if (previousFocus?.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className={`df-drawer df-drawer--${side}`}
      aria-labelledby={titleId}
      aria-modal="true"
      tabIndex={-1}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const box = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < box.left ||
            event.clientX > box.right ||
            event.clientY < box.top ||
            event.clientY > box.bottom
          )
            onClose();
        }
      }}
    >
      <header className="df-drawer-header">
        <div>
          <span className="df-drawer-eyebrow">DineFlow workspace</span>
          <h2 id={titleId}>{title}</h2>
        </div>
        <button
          type="button"
          className="df-drawer-close"
          onClick={onClose}
          aria-label={`Close ${title}`}
        >
          <X size={21} aria-hidden="true" />
        </button>
      </header>
      <div className="df-drawer-content">{children}</div>
    </dialog>
  );
}
