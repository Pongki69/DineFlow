import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Banknote,
  CreditCard,
  LockKeyhole,
  Receipt,
  Smartphone,
  Wallet,
} from "lucide-react";
import { api } from "../api";
import { subscribeToLiveChanges } from "../liveUpdates";
import { Feedback, Skeleton } from "../components/ui";
import { peso, totalsByMethod } from "./cashierQueue";
import "./cashierDesk.css";
import "./cashierToday.css";

const METHOD_ICONS = { cash: Banknote, card: CreditCard, gcash: Smartphone };
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
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const canDrawer = user.permissions?.includes("payments.manage");
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
      {canDrawer && <CashDrawer onChange={load} />}
      {!data && !error && <Skeleton label="Loading today’s transactions" />}
      {error && <Feedback onRetry={load}>{error}</Feedback>}
      {data && (
        <>
          <div className="cashier-today-totals">
            <article>
              <small>Received</small>
              <strong>{peso(data.paid_total)}</strong>
              <span>{data.payment_count} paid</span>
            </article>
            <article>
              <small>Refunded</small>
              <strong>{peso(data.refund_total)}</strong>
            </article>
          </div>
          {methods.length > 0 && (
            <section
              className="cashier-methods"
              aria-label="Received by method"
            >
              {methods.map(({ method, total, count }) => {
                const Icon = METHOD_ICONS[method] || Wallet;
                return (
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
            <h2>Activity</h2>
            {data.recent.length === 0 && (
              <p className="cashier-hint">No payments yet today.</p>
            )}
            <ul>
              {data.recent.map((payment) => (
                <li key={payment.id} data-status={payment.status}>
                  <span className="cashier-activity-time">
                    {time(payment.paid_at || payment.created_at)}
                  </span>
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
                    {payment.status === "paid" && (
                      <Link
                        to={`/payments/${payment.id}/receipt`}
                        aria-label={`Receipt for ${payment.reference_number}`}
                      >
                        <Receipt size={14} aria-hidden="true" />
                        Receipt
                      </Link>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </section>
  );
}

/** Start a shift with the opening float; close it by counting the drawer. */
function CashDrawer({ onChange }) {
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
    return <Skeleton cards={1} label="Loading the cash drawer" />;
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
