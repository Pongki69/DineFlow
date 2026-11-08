import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Banknote,
  CreditCard,
  Globe,
  LockKeyhole,
  Scale,
  Receipt,
  ReceiptText,
  Smartphone,
  Undo2,
  Wallet,
} from "lucide-react";
import {
  CardHeading,
  StatIcon,
  useAdminDesktop,
} from "../components/adminDesk";
import { api } from "../api";
import { subscribeToLiveChanges } from "../liveUpdates";
import { Feedback, Skeleton } from "../components/ui";
import { peso, totalsByMethod } from "./cashierQueue";
import { CountUp } from "../components/CountUp";
import "./cashierDesk.css";
import "./cashierToday.css";

const METHOD_ICONS = { cash: Banknote, card: CreditCard, gcash: Smartphone };
// Admin desktop: wallets share the phone icon; anything else is "online".
const methodKind = (method) =>
  method === "cash"
    ? "cash"
    : method === "card"
      ? "card"
      : ["gcash", "maya", "grabpay", "shopeepay", "qrph"].includes(method)
        ? "gcash"
        : "online";
const KIND_ICONS = { ...METHOD_ICONS, online: Globe };
const ACTIVITY_PER_PAGE = 10;
const ACTIVITY_FILTERS = [
  ["", "All", () => true],
  ["paid", "Paid", (payment) => payment.status === "paid"],
  [
    "refunded",
    "Refunded",
    (payment) => ["refunded", "refund_pending"].includes(payment.status),
  ],
  [
    "issue",
    "Failed / pending",
    (payment) =>
      ["failed", "expired", "cancelled", "pending"].includes(payment.status),
  ],
];
const METHOD_LABELS = {
  gcash: "GCash",
  card: "Card",
  cash: "Cash",
  online: "Online",
  qrph: "QR Ph",
  maya: "Maya",
};
const readable = (value) =>
  METHOD_LABELS[value] ||
  String(value || "")
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
const time = (value) =>
  value
    ? new Date(value).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

/** Today at the counter: the cash drawer, takings by method and every transaction. */
export function CashierToday({ user = { permissions: [] } }) {
  const desk = useAdminDesktop();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const canDrawer = user.permissions?.includes("payments.manage");
  // Admin desktop: filter by status or method, ten payments a page.
  const [statusFilter, setStatusFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [page, setPage] = useState(1);
  async function load() {
    try {
      const result = await api("/cashier/summary");
      setData(result.data);
      setError("");
    } catch (failure) {
      setError(failure.message);
    }
  }
  useEffect(() => {
    load();
    return subscribeToLiveChanges(load);
  }, []);
  const methods = totalsByMethod(data?.recent || []);
  const recent = data?.recent || [];
  const statusMatch =
    ACTIVITY_FILTERS.find(([key]) => key === statusFilter)?.[2] || (() => true);
  const activity = desk
    ? recent.filter(
        (payment) =>
          statusMatch(payment) &&
          (!methodFilter || payment.method === methodFilter),
      )
    : recent;
  const pages = Math.max(1, Math.ceil(activity.length / ACTIVITY_PER_PAGE));
  const at = Math.min(page, pages);
  const shown = desk
    ? activity.slice((at - 1) * ACTIVITY_PER_PAGE, at * ACTIVITY_PER_PAGE)
    : activity;
  // Admin desktop: money counts up into place.
  const money = (value) =>
    desk ? (
      <CountUp value={Number(value) || 0} decimals={2} format={peso} />
    ) : (
      peso(value)
    );
  const pickStatus = (value) => {
    setStatusFilter(value);
    setPage(1);
  };
  const pickMethod = (value) => {
    setMethodFilter((current) => (current === value ? "" : value));
    setPage(1);
  };
  return (
    <section className="cashier-today" aria-labelledby="cashier-today-title">
      <header className="cashier-today-head">
        <h1 id="cashier-today-title">Today at the counter</h1>
        <p>
          {data?.date
            ? new Date(`${data.date}T12:00:00`).toLocaleDateString([], {
                weekday: "long",
                month: "long",
                day: "numeric",
              })
            : ""}
        </p>
      </header>
      {canDrawer && (data || !desk) && <CashDrawer onChange={load} />}
      {!data && !error && (
        <Skeleton
          label="Loading today’s transactions"
          layout={{ stats: 3, body: "list", rows: 8, rail: true }}
        />
      )}
      {error && <Feedback onRetry={load}>{error}</Feedback>}
      {data && (
        <>
          <div className="cashier-today-totals">
            <article data-tone="success">
              <small>Received</small>
              <strong>{money(data.paid_total)}</strong>
              <span>{data.payment_count} paid</span>
              <StatIcon icon={Wallet} />
            </article>
            <article data-tone="danger">
              <small>Refunded</small>
              <strong>{money(data.refund_total)}</strong>
              <StatIcon icon={Undo2} />
            </article>
            {desk && (
              <article data-tone="progress">
                <small>Net</small>
                <strong>
                  {money(Number(data.paid_total) - Number(data.refund_total))}
                </strong>
                <span>Received less refunds</span>
                <StatIcon icon={Scale} />
              </article>
            )}
          </div>
          {methods.length > 0 && (
            <section
              className="cashier-methods"
              aria-label="Received by method"
            >
              {desk && <h2>Received by method</h2>}
              {methods.map(({ method, total, count }) => {
                const Icon = METHOD_ICONS[method] || Wallet;
                return desk ? (
                  <button
                    key={method}
                    type="button"
                    data-method={methodKind(method)}
                    aria-pressed={methodFilter === method}
                    title={`Show ${readable(method)} payments`}
                    onClick={() => pickMethod(method)}
                  >
                    <Icon size={16} aria-hidden="true" />
                    <span>{readable(method)}</span>
                    <b>{money(total)}</b>
                    <small>{count}×</small>
                    {/* Share of the day's takings, in the method's colour. */}
                    {(() => {
                      const share = Number(data.paid_total)
                        ? Math.min(1, Number(total) / Number(data.paid_total))
                        : 0;
                      return (
                        <span
                          className="cashier-method-share"
                          aria-hidden="true"
                        >
                          <i style={{ width: `${Math.round(share * 100)}%` }} />
                          <em>{Math.round(share * 100)}%</em>
                        </span>
                      );
                    })()}
                  </button>
                ) : (
                  <div key={method}>
                    <Icon size={16} aria-hidden="true" />
                    <span>{readable(method)}</span>
                    <b>{peso(total)}</b>
                    <small>{count}×</small>
                  </div>
                );
              })}
            </section>
          )}
          <section className="cashier-activity" aria-label="Today’s activity">
            {desk ? (
              <CardHeading
                icon={ReceiptText}
                title="Activity"
                description="Payments recorded today."
              />
            ) : (
              <h2>Activity</h2>
            )}
            {desk && recent.length > 0 && (
              <div className="cashier-activity-filters">
                <div
                  className="sage-filter-chips"
                  role="group"
                  aria-label="Show payments"
                >
                  {ACTIVITY_FILTERS.map(([key, label, match]) => (
                    <button
                      key={key || "all"}
                      type="button"
                      aria-pressed={statusFilter === key}
                      onClick={() => pickStatus(key)}
                    >
                      {label}
                      <span className="admin-count">
                        {
                          recent.filter(
                            (payment) =>
                              match(payment) &&
                              (!methodFilter ||
                                payment.method === methodFilter),
                          ).length
                        }
                      </span>
                    </button>
                  ))}
                </div>
                {methodFilter && (
                  <button
                    type="button"
                    className="cashier-clear-method"
                    onClick={() => pickMethod(methodFilter)}
                  >
                    {readable(methodFilter)} only · Show all methods
                  </button>
                )}
              </div>
            )}
            {data.recent.length === 0 && (
              <p className="cashier-hint">No payments yet today.</p>
            )}
            {desk && recent.length > 0 && activity.length === 0 && (
              <p className="cashier-hint">No payments match this filter.</p>
            )}
            {desk && shown.length > 0 && (
              <div className="cashier-activity-head" aria-hidden="true">
                <span>Time</span>
                <span>Order</span>
                <span>Status</span>
                <span>Amount</span>
              </div>
            )}
            <ul>
              {shown.map((payment) => (
                <li key={payment.id} data-status={payment.status}>
                  <span className="cashier-activity-time">
                    {time(payment.paid_at || payment.created_at)}
                  </span>
                  {desk &&
                    (() => {
                      const kind = methodKind(payment.method);
                      const Icon = KIND_ICONS[kind];
                      return (
                        <span
                          className="cashier-method-icon"
                          data-method={kind}
                          aria-hidden="true"
                        >
                          <Icon size={16} />
                        </span>
                      );
                    })()}
                  <span className="cashier-activity-main">
                    <strong>
                      {payment.order?.order_number ||
                        payment.reservation?.reference ||
                        (payment.dining_session_id
                          ? "Table bill"
                          : payment.reference_number)}
                    </strong>
                    <small>
                      {readable(payment.method)} · {payment.reference_number}
                    </small>
                  </span>
                  <span className="cashier-activity-side">
                    <b>{peso(payment.amount)}</b>
                    <span className="cashier-activity-status">
                      {readable(payment.status)}
                    </span>
                    {payment.status === "paid" ? (
                      <Link
                        to={`/payments/${payment.id}/receipt`}
                        aria-label={`Receipt for ${payment.reference_number}`}
                      >
                        <Receipt size={14} aria-hidden="true" />
                        Receipt
                      </Link>
                    ) : (
                      // Keeps amounts and statuses lined up on every row.
                      desk && (
                        <span
                          className="cashier-receipt-spacer"
                          aria-hidden="true"
                        />
                      )
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {desk && pages > 1 && (
              <nav className="sage-pagination" aria-label="Activity pages">
                <button
                  type="button"
                  className="sage-button sage-button--secondary"
                  disabled={at <= 1}
                  onClick={() => setPage(at - 1)}
                >
                  Previous
                </button>
                <span>
                  Showing {(at - 1) * ACTIVITY_PER_PAGE + 1}–
                  {Math.min(at * ACTIVITY_PER_PAGE, activity.length)} of{" "}
                  {activity.length} · Page {at} of {pages}
                </span>
                <button
                  type="button"
                  className="sage-button sage-button--secondary"
                  disabled={at >= pages}
                  onClick={() => setPage(at + 1)}
                >
                  Next
                </button>
              </nav>
            )}
          </section>
        </>
      )}
    </section>
  );
}

/** Start a shift with the opening float; close it by counting the drawer. */
function CashDrawer({ onChange }) {
  const desk = useAdminDesktop();
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  async function load() {
    try {
      const result = await api("/cashier/shift");
      setState(result.data);
      setError("");
    } catch (failure) {
      setError(failure.message);
    }
  }
  useEffect(() => {
    load();
    return subscribeToLiveChanges(load);
  }, []);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (state?.current) {
        await api("/cashier/shift/close", {
          method: "POST",
          body: JSON.stringify({
            counted_cash: Number(amount),
            notes: notes || null,
          }),
        });
        setClosing(false);
      } else {
        await api("/cashier/shift/open", {
          method: "POST",
          body: JSON.stringify({ opening_float: Number(amount) }),
        });
      }
      setAmount("");
      setNotes("");
      await load();
      onChange?.();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  if (!state && !error)
    // Admin desktop: the page's placeholder already has the drawer card.
    return desk ? null : <Skeleton cards={1} label="Loading the cash drawer" />;
  const shift = state?.current;
  const last = state?.last;
  const counted = Number(amount);
  const difference =
    shift && amount !== ""
      ? Math.round((counted - shift.expected_cash) * 100) / 100
      : null;
  return (
    <section
      className="cashier-drawer"
      data-open={shift ? true : undefined}
      aria-label="Cash drawer"
    >
      <header>
        <span className="cashier-drawer-icon" aria-hidden="true">
          {shift ? <Wallet size={18} /> : <LockKeyhole size={18} />}
        </span>
        <div>
          <strong>{shift ? "Shift open" : "Cash drawer"}</strong>
          <small>
            {shift
              ? `Since ${time(shift.opened_at)} · ${shift.payments} payments`
              : "Start your shift with the cash already in the drawer."}
          </small>
        </div>
      </header>
      {error && <Feedback>{error}</Feedback>}
      {shift && (
        <dl className="cashier-drawer-figures">
          <div>
            <dt>Opening float</dt>
            <dd>{peso(shift.opening_float)}</dd>
          </div>
          <div>
            <dt>Cash received</dt>
            <dd>{peso(shift.cash_received)}</dd>
          </div>
          <div data-kind="total">
            <dt>Should be in the drawer</dt>
            <dd>{peso(shift.expected_cash)}</dd>
          </div>
        </dl>
      )}
      {(!shift || closing) && (
        <form onSubmit={submit} className="cashier-drawer-form">
          <label className="cashier-field">
            {shift ? "Cash counted in the drawer" : "Opening float"}
            <input
              inputMode="decimal"
              required
              value={amount}
              placeholder="0.00"
              onChange={(event) =>
                setAmount(event.target.value.replace(/[^\d.]/g, ""))
              }
            />
          </label>
          {shift && (
            <>
              {difference !== null && (
                <p
                  className="cashier-drawer-difference"
                  data-tone={
                    difference === 0
                      ? "even"
                      : difference > 0
                        ? "over"
                        : "short"
                  }
                >
                  {difference === 0
                    ? "The drawer balances."
                    : difference > 0
                      ? `Over by ${peso(difference)}`
                      : `Short by ${peso(-difference)}`}
                </p>
              )}
              <label className="cashier-field">
                Note (optional)
                <input
                  value={notes}
                  maxLength={500}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </label>
            </>
          )}
          <div className="cashier-actions">
            {shift && (
              <button
                type="button"
                className="cashier-secondary"
                onClick={() => setClosing(false)}
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="cashier-primary"
              disabled={busy || amount === ""}
            >
              {busy ? "Saving…" : shift ? "Close shift" : "Start shift"}
            </button>
          </div>
        </form>
      )}
      {shift && !closing && (
        <div className="cashier-actions">
          <button
            type="button"
            className="cashier-secondary"
            onClick={() => setClosing(true)}
          >
            Count drawer &amp; close shift
          </button>
        </div>
      )}
      {!shift && last && (
        <p className="cashier-drawer-last">
          Last shift closed{" "}
          {new Date(last.closed_at).toLocaleString([], {
            dateStyle: "medium",
            timeStyle: "short",
          })}
          : counted {peso(last.counted_cash)} of {peso(last.expected_cash)}
          {last.difference
            ? ` (${last.difference > 0 ? "over" : "short"} by ${peso(Math.abs(last.difference))})`
            : " · balanced"}
          .
        </p>
      )}
    </section>
  );
}
