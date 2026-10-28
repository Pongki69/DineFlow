import { EmptyState, Feedback, Skeleton, StatusBadge } from "./components/ui";
import { usePrompt } from "./components/ConfirmProvider";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CreditCard,
  Receipt,
  RefreshCw,
  Search,
  Table2,
  Wallet,
  X,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { api } from "./api";
import "./features/staffSage.css";

const money = (value) => `₱${Number(value || 0).toFixed(2)}`;
const title = (value) => String(value || "").replaceAll("_", " ");

export function PaymentDashboard({ user = { permissions: [] } }) {
  const ask = usePrompt();
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [payments, setPayments] = useState([]);
  const [bills, setBills] = useState([]);
  const [queue, setQueue] = useState({ orders: [], reservation_deposits: [] });
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [queueType, setQueueType] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState(null);
  const [reviewError, setReviewError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [busy, setBusy] = useState("");
  const dialog = useRef(null);
  const heading = useRef(null);
  const trigger = useRef(null);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const requestVersion = useRef(0);
  const canCash = user.permissions?.includes("payments.manage");
  const canRefund = user.permissions?.includes("payments.refund");
  const canView = canCash || canRefund;

  async function load() {
    if (!canView) return;
    const version = ++requestVersion.current;
    setRefreshing(true);
    try {
      const requests = [api("/payments?page=" + page)];
      if (canCash)
        requests.push(
          api("/dining-sessions/open-bills"),
          api("/cashier/payment-queue"),
        );
      const [p, b, q] = await Promise.all(requests);
      if (!mounted.current || version !== requestVersion.current) return;
      const result = p.data || {};
      setPayments(result.data || []);
      setMeta({
        current_page: result.current_page || page,
        last_page: result.last_page || 1,
        total: result.total || 0,
      });
      setBills(b?.data || []);
      setQueue(q?.data || { orders: [], reservation_deposits: [] });
      setHasLoaded(true);
      setError("");
    } catch (failure) {
      if (mounted.current && version === requestVersion.current)
        setError(failure.message);
    } finally {
      if (mounted.current && version === requestVersion.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }
  useEffect(() => {
    mounted.current = true;
    if (!canView) {
      setLoading(false);
      return () => {
        mounted.current = false;
        requestVersion.current += 1;
      };
    }
    load();
    const timer = setInterval(() => {
      if (!busyRef.current && !document.hidden) load();
    }, 12000);
    return () => {
      mounted.current = false;
      requestVersion.current += 1;
      clearInterval(timer);
    };
  }, [page, canCash, canView]);
  useEffect(() => {
    if (selected && dialog.current && !dialog.current.open) {
      dialog.current.showModal();
      dialog.current.querySelector("h2")?.focus();
    } else if (!selected && dialog.current?.open) dialog.current.close();
  }, [selected]);
  useEffect(() => {
    if (!selected) return;
    const bodyOverflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = rootOverflow;
    };
  }, [selected]);

  const openBills = bills.filter((bill) => Number(bill.balance_due) > 0);
  const consolidatedOrders = new Set(
    openBills.flatMap((bill) =>
      (bill.orders || []).map((order) => order.order_number),
    ),
  );
  const entries = [
    ...openBills.map((bill) => ({
      kind: "session",
      id: bill.id,
      label: "Table " + bill.table_number,
      detail:
        bill.orders?.map((order) => order.order_number).join(" · ") ||
        "Dining session bill",
      balance: Number(bill.balance_due),
      paymentPending: bill.payment_pending,
      source: bill,
    })),
    ...(queue.orders || [])
      .filter((order) => !consolidatedOrders.has(order.order_number))
      .map((order) => ({
        kind: "order",
        id: order.id,
        label: order.order_number,
        detail: [
          order.customer_name,
          title(order.order_type),
          title(order.status),
        ]
          .filter(Boolean)
          .join(" · "),
        balance: Number(order.balance_due),
        paymentPending: order.payment_pending,
        source: order,
      })),
    ...(queue.reservation_deposits || []).map((reservation) => ({
      kind: "reservation",
      id: reservation.id,
      label: reservation.reference,
      detail: [
        reservation.guest_name,
        reservation.starts_at
          ? new Date(reservation.starts_at).toLocaleString()
          : "",
      ]
        .filter(Boolean)
        .join(" · "),
      balance: Number(reservation.deposit_amount),
      paymentPending: reservation.payment_pending,
      source: reservation,
    })),
  ];
  const current = selected
    ? entries.find(
        (entry) => entry.kind === selected.kind && entry.id === selected.id,
      )
    : null;
  const visibleEntries = entries.filter(
    (entry) => !queueType || entry.kind === queueType,
  );
  const visiblePayments = payments.filter((payment) => {
    const text = [
      payment.reference_number,
      payment.order?.order_number,
      payment.reservation?.reference,
      payment.received_by?.name,
      payment.method,
    ]
      .join(" ")
      .toLowerCase();
    return (
      (!query || text.includes(query.toLowerCase())) &&
      (!status || payment.status === status)
    );
  });
  function openReview(entry, event) {
    trigger.current = event.currentTarget;
    setReviewError("");
    setUncertain(false);
    setSelected({ kind: entry.kind, id: entry.id, label: entry.label });
  }
  function closeReview() {
    if (busyRef.current) return;
    setSelected(null);
  }
  async function settle(method) {
    if (
      !canCash ||
      !current ||
      busyRef.current ||
      uncertain ||
      current.paymentPending ||
      !Number.isFinite(current.balance) ||
      current.balance <= 0
    )
      return;
    if (current.kind === "reservation" && method !== "cash") return;
    busyRef.current = true;
    setBusy(method);
    setReviewError("");
    try {
      const path =
        current.kind === "session"
          ? "/dining-sessions/" + current.id + "/payments/" + method
          : current.kind === "reservation"
            ? "/reservations/" + current.id + "/deposit/cash"
            : "/orders/" + current.id + "/payments/" + method;
      const result = await api(path, { method: "POST" });
      if (!mounted.current) return;
      if (method === "checkout") {
        const url = new URL(result.data.checkout_url);
        if (
          url.protocol !== "https:" &&
          !(
            url.protocol === "http:" &&
            ["localhost", "127.0.0.1"].includes(url.hostname)
          )
        )
          throw new Error(
            "The checkout address could not be verified. Refresh the payment status before trying again.",
          );
        window.location.assign(url.href);
      } else {
        setNotice("Cash payment recorded for " + current.label + ".");
        setSelected(null);
        await load();
      }
    } catch (failure) {
      if (mounted.current) {
        setReviewError(failure.message);
        if (failure.uncertain) {
          setUncertain(true);
          await load();
        }
      }
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy("");
    }
  }
  async function refund(payment) {
    if (!canRefund || busyRef.current) return;
    busyRef.current = true;
    setBusy("refund-" + payment.id);
    setError("");
    try {
      const notes = await ask(
        "Confirm full refund of " +
          money(payment.amount) +
          ". Enter a short reason note:",
      );
      if (!notes) return;
      const reason = await ask(
        "Refund category: duplicate, fraudulent, requested_by_customer, or others",
        "requested_by_customer",
      );
      if (!reason) return;
      await api("/admin/payments/" + payment.id + "/refund", {
        method: "POST",
        body: JSON.stringify({ reason, notes }),
      });
      if (!mounted.current) return;
      setNotice(
        "Refund request recorded. Provider refunds remain processing until PayMongo confirms completion.",
      );
      await load();
    } catch (failure) {
      if (mounted.current) {
        setError(failure.message);
        if (failure.uncertain) await load();
      }
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy("");
    }
  }
  if (!canView)
    return (
      <section className="welcome sage-staff">
        <h1>Payments</h1>
        <Feedback>
          This account does not have permission to view payment records or
          collect payments.
        </Feedback>
      </section>
    );
  const unavailable = loading || !hasLoaded;
  return (
    <section className="welcome sage-staff sage-payments payment-dashboard">
      <header className="sage-page-heading">
        <div>
          <span className="eyebrow">PAYMENTS & BILLS</span>
          <h1 ref={heading} tabIndex={-1}>
            Payments & bills
          </h1>
          <p>
            {canCash
              ? "Review balances and collect payments."
              : "Review payments, receipts and refunds."}
          </p>
        </div>
        <button
          className="sage-button sage-button--secondary sage-refresh-action"
          onClick={load}
          disabled={refreshing || !!busy}
          aria-busy={refreshing}
          aria-label={refreshing ? "Refreshing payments" : "Refresh payments"}
          title="Refresh payments"
        >
          <RefreshCw size={18} aria-hidden="true" />
          <span>{refreshing ? "Refreshing…" : "Refresh"}</span>
        </button>
      </header>
      {error && (
        <Feedback onRetry={load}>
          {error}
          {hasLoaded && " Last loaded results remain available."}
        </Feedback>
      )}
      {notice && <Feedback tone="success">{notice}</Feedback>}
      <div className="sage-stat-grid">
        {canCash ? (
          <>
            <article>
              <span>Open balances</span>
              <strong>{unavailable ? "—" : entries.length}</strong>
              <small>Dining bills, orders & deposits</small>
            </article>
            <article>
              <span>Balance to collect</span>
              <strong>
                {unavailable
                  ? "—"
                  : money(
                      entries.reduce(
                        (total, entry) =>
                          total +
                          (Number.isFinite(entry.balance) ? entry.balance : 0),
                        0,
                      ),
                    )}
              </strong>
              <small>Current collection queue</small>
            </article>
          </>
        ) : (
          <article>
            <span>Transactions</span>
            <strong>{unavailable ? "—" : meta.total}</strong>
            <small>Payment records</small>
          </article>
        )}
        <article>
          <span>Online checkout pending</span>
          <strong>
            {unavailable
              ? "—"
              : canCash
                ? entries.filter((entry) => entry.paymentPending).length
                : payments.filter((payment) => payment.status === "pending")
                    .length}
          </strong>
          <small>
            {canCash
              ? "Check status before collecting again"
              : "On this transaction page"}
          </small>
        </article>
      </div>
      {loading && <Skeleton label="Loading bills and payments" />}
      {canCash && (
        <section className="sage-panel" aria-labelledby="collection-heading">
          <header className="sage-panel-heading">
            <div>
              <span className="eyebrow">COLLECTION QUEUE</span>
              <h2 id="collection-heading">Ready to settle</h2>
            </div>
            <span className="sage-count">
              {hasLoaded ? entries.length : "—"}{" "}
              {hasLoaded && entries.length === 1 ? "balance" : "balances"}
            </span>
          </header>
          <div
            className="sage-filter-chips"
            role="group"
            aria-label="Filter payment queue"
          >
            {[
              ["", "All balances"],
              ["session", "Dining bills"],
              ["order", "Orders"],
              ["reservation", "Deposits"],
            ].map(([value, label]) => (
              <button
                key={value}
                aria-pressed={queueType === value}
                onClick={() => setQueueType(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {!loading && !error && visibleEntries.length === 0 && (
            <EmptyState
              icon={Wallet}
              title={
                entries.length
                  ? "No balances in this category"
                  : "All settled for now"
              }
              description="Open dining bills, unpaid orders and required reservation deposits appear here."
            />
          )}
          <div className="sage-bill-grid">
            {visibleEntries.map((entry) => (
              <article
                className="sage-bill-card"
                key={entry.kind + "-" + entry.id}
              >
                <header>
                  <span className="sage-bill-icon">
                    {entry.kind === "session" ? (
                      <Table2 size={24} aria-hidden="true" />
                    ) : entry.kind === "reservation" ? (
                      <CalendarDays size={24} aria-hidden="true" />
                    ) : (
                      <Receipt size={24} aria-hidden="true" />
                    )}
                  </span>
                  <div>
                    <span className="sage-card-kicker">
                      {entry.kind === "session"
                        ? "Dining bill"
                        : entry.kind === "reservation"
                          ? "Reservation deposit"
                          : "Order"}
                    </span>
                    <h3>{entry.label}</h3>
                  </div>
                </header>
                <p>{entry.detail}</p>
                <div className="sage-bill-amount">
                  <span>Balance due</span>
                  <strong>{money(entry.balance)}</strong>
                </div>
                {entry.paymentPending && (
                  <p className="sage-attention-label">
                    Online checkout pending
                  </p>
                )}
                <button
                  className="sage-button"
                  onClick={(event) => openReview(entry, event)}
                  disabled={!!busy}
                >
                  Review payment
                  <ArrowRight size={18} aria-hidden="true" />
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
      <section className="sage-panel" aria-labelledby="transactions-heading">
        <header className="sage-panel-heading">
          <div>
            <span className="eyebrow">TRANSACTION RECORDS</span>
            <h2 id="transactions-heading">Payments & receipts</h2>
            <p>
              Paid status comes from verified provider events or an authorized
              cash record.
            </p>
          </div>
          <span className="sage-count">
            {hasLoaded ? meta.total : "—"}{" "}
            {hasLoaded && meta.total === 1 ? "record" : "records"}
          </span>
        </header>
        <div className="sage-toolbar">
          <label className="sage-field sage-field--search">
            Search this page
            <div>
              <Search size={18} aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Reference, order or staff name"
              />
            </div>
          </label>
          <label className="sage-field">
            Status on this page
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">All statuses</option>
              {[
                "pending",
                "paid",
                "failed",
                "expired",
                "cancelled",
                "refunded",
                "refund_pending",
              ].map((value) => (
                <option key={value} value={value}>
                  {title(value)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!loading && !error && visiblePayments.length === 0 && (
          <EmptyState
            icon={Receipt}
            title={
              payments.length
                ? "No transactions match these filters"
                : "No payments recorded yet"
            }
            description={
              payments.length
                ? "Clear the page filters or choose another transaction page."
                : "Receipts and payment records appear here as payments are received."
            }
          />
        )}
        <div className="sage-transactions">
          {visiblePayments.map((payment) => (
            <article className="sage-transaction" key={payment.id}>
              <div>
                <h3>{payment.reference_number || "Payment #" + payment.id}</h3>
                <p>
                  {payment.order?.order_number ||
                    payment.reservation?.reference ||
                    "Dining session " + (payment.dining_session_id || "—")}{" "}
                  · {title(payment.purpose)}
                </p>
                <small>
                  {title(payment.method)} ·{" "}
                  {payment.received_by?.name ||
                    payment.order?.customer_name_snapshot ||
                    "Online customer"}
                </small>
              </div>
              <div className="sage-transaction-value">
                <strong>{money(payment.amount)}</strong>
                <StatusBadge status={payment.status} />
              </div>
              <div className="sage-transaction-actions">
                <Link
                  className="sage-button sage-button--secondary"
                  to={"/payments/" + payment.id + "/receipt"}
                  aria-label={
                    "Receipt for " +
                    (payment.reference_number || "payment " + payment.id)
                  }
                >
                  <Receipt size={18} aria-hidden="true" />
                  Receipt
                </Link>
                {canRefund && payment.status === "paid" && (
                  <button
                    className="sage-button sage-button--danger"
                    disabled={!!busy}
                    onClick={() => refund(payment)}
                  >
                    {busy === "refund-" + payment.id
                      ? "Processing…"
                      : "Full refund"}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
        {meta.last_page > 1 && (
          <nav className="sage-pagination" aria-label="Transaction pages">
            <button
              className="sage-button sage-button--secondary"
              disabled={page <= 1 || refreshing || !!busy}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </button>
            <span>
              Page {meta.current_page} of {meta.last_page}
            </span>
            <button
              className="sage-button sage-button--secondary"
              disabled={page >= meta.last_page || refreshing || !!busy}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </button>
          </nav>
        )}
      </section>
      <dialog
        className="sage-payment-review"
        ref={dialog}
        aria-labelledby="payment-review-title"
        aria-describedby="payment-review-help"
        onCancel={(event) => {
          event.preventDefault();
          closeReview();
        }}
        onClose={() => {
          setSelected(null);
          if (trigger.current?.isConnected) trigger.current.focus();
          else heading.current?.focus({ preventScroll: true });
        }}
      >
        <header>
          <div>
            <span className="eyebrow">REVIEW PAYMENT</span>
            <h2 id="payment-review-title" tabIndex={-1}>
              {selected?.label || "Payment"}
            </h2>
          </div>
          <button
            className="sage-icon-button"
            aria-label="Close payment review"
            onClick={closeReview}
            disabled={!!busy}
          >
            <X size={22} aria-hidden="true" />
          </button>
        </header>
        <div className="sage-review-body">
          <p id="payment-review-help">
            Confirm the balance before recording cash or opening secure hosted
            checkout. The server verifies the final amount.
          </p>
          {current ? (
            <>
              <p>{current.detail}</p>
              {current.kind === "session" && (
                <ul className="sage-review-orders">
                  {current.source.orders?.map((order) => (
                    <li key={order.id || order.order_number}>
                      <strong>{order.order_number}</strong>
                      <span>{title(order.status)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <dl className="sage-review-total">
                <div>
                  <dt>
                    {current.kind === "reservation"
                      ? "Deposit due"
                      : "Balance due"}
                  </dt>
                  <dd>{money(current.balance)}</dd>
                </div>
              </dl>
              {current.paymentPending && (
                <Feedback>
                  A checkout is pending. Refresh the payment status before
                  collecting another payment.
                </Feedback>
              )}
            </>
          ) : (
            <Feedback>
              This balance is no longer in the collection queue. Refresh the
              records to confirm whether it has been settled.
            </Feedback>
          )}
          {reviewError && <Feedback>{reviewError}</Feedback>}
          {uncertain && (
            <p className="sage-attention-label">
              The result needs verification. Close this review and check the
              updated payment records before starting another payment.
            </p>
          )}
        </div>
        <footer>
          <button
            className="sage-button"
            disabled={
              !current || !!busy || uncertain || current?.paymentPending
            }
            aria-busy={busy === "cash"}
            onClick={() => settle("cash")}
          >
            <Wallet size={20} aria-hidden="true" />
            {busy === "cash" ? "Recording…" : "Record cash"}
          </button>
          {current?.kind !== "reservation" && (
            <button
              className="sage-button sage-button--secondary"
              disabled={
                !current || !!busy || uncertain || current?.paymentPending
              }
              aria-busy={busy === "checkout"}
              onClick={() => settle("checkout")}
            >
              <CreditCard size={20} aria-hidden="true" />
              {busy === "checkout" ? "Opening checkout…" : "Pay online"}
            </button>
          )}
        </footer>
      </dialog>
    </section>
  );
}

export function PaymentReturn() {
  const params = new URLSearchParams(window.location.search),
    paymentId = params.get("payment_id"),
    result = params.get("result");
  const [payment, setPayment] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (!paymentId) return;
    let active = true,
      requestedCancel = false;
    const refresh = async () => {
      try {
        if (result === "cancelled" && !requestedCancel) {
          requestedCancel = true;
          await api(`/payments/${paymentId}/cancel`, { method: "POST" }).catch(
            (e) => {
              if (e.status !== 422) throw e;
            },
          );
        }
        const r = await api(`/payments/${paymentId}`);
        if (active) {
          setPayment(r.data);
          setError("");
        }
      } catch (e) {
        if (active) setError(e.message);
      }
    };
    refresh();
    const id = setInterval(refresh, 4000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [paymentId, result]);
  if (!paymentId)
    return (
      <section className="welcome">
        <div className="error">Payment reference is missing.</div>
        <Link to="/my-orders">Return to orders</Link>
      </section>
    );
  const terminal = ["paid", "failed", "cancelled", "refunded"].includes(
    payment?.status,
  );
  return (
    <section className="welcome payment-return">
      <span className="eyebrow">PAYMENT STATUS</span>
      <h1>{payment ? title(payment.status) : "Verifying payment"}</h1>
      {error && <Feedback>{error}</Feedback>}
      {payment && (
        <>
          <p>
            {payment.reference_number} · {money(payment.amount)}{" "}
            {payment.currency}
          </p>
          {payment.status === "pending" && (
            <p>
              We’re waiting for PayMongo’s signed confirmation. Keep this page
              open; the checkout redirect alone does not confirm payment.
            </p>
          )}
          {payment.status === "failed" && (
            <p>
              Payment did not complete. Return to your order and start a new
              checkout.
            </p>
          )}
          {payment.status === "cancelled" && (
            <p>The checkout was cancelled. No payment was recorded.</p>
          )}
          {payment.status === "paid" && <p>Payment confirmed by PayMongo.</p>}
          <div className="payment-return-actions">
            {payment.status === "paid" && (
              <Link to={`/payments/${payment.id}/receipt`}>View receipt</Link>
            )}
            <Link to="/my-orders">My orders</Link>
            <Link to="/my-reservations">My reservations</Link>
          </div>
        </>
      )}
      {!terminal && (
        <button
          className="refresh-button"
          onClick={() => window.location.reload()}
        >
          Check status
        </button>
      )}
    </section>
  );
}

export function PaymentReceipt() {
  const { paymentId } = useParams();
  const [receipt, setReceipt] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    api(`/payments/${paymentId}/receipt`)
      .then((r) => setReceipt(r.data))
      .catch((e) => setError(e.message));
  }, [paymentId]);
  if (error)
    return (
      <section className="welcome">
        <Feedback>{error}</Feedback>
        <Link to="/payments">Back to payments</Link>
      </section>
    );
  if (!receipt)
    return (
      <section className="welcome">
        <h1>Payment receipt</h1>
        <Skeleton label="Loading receipt" />
      </section>
    );
  return (
    <section className="welcome receipt-page">
      <span className="eyebrow">DINEFLOW · PAYMENT RECEIPT</span>
      <h1>
        {receipt.status === "paid" ? "Payment received" : title(receipt.status)}
      </h1>
      <dl>
        <dt>Reference</dt>
        <dd>{receipt.reference}</dd>
        <dt>Amount</dt>
        <dd>
          {money(receipt.amount)} {receipt.currency}
        </dd>
        <dt>Purpose</dt>
        <dd>{title(receipt.purpose)}</dd>
        {receipt.order_number && (
          <>
            <dt>Order</dt>
            <dd>{receipt.order_number}</dd>
          </>
        )}
        {receipt.reservation_reference && (
          <>
            <dt>Reservation</dt>
            <dd>{receipt.reservation_reference}</dd>
          </>
        )}
        {receipt.table && (
          <>
            <dt>Table</dt>
            <dd>{receipt.table}</dd>
          </>
        )}
        {receipt.method && (
          <>
            <dt>Method</dt>
            <dd>{title(receipt.method)}</dd>
          </>
        )}
        {receipt.provider_reference && (
          <>
            <dt>Provider reference</dt>
            <dd>{receipt.provider_reference}</dd>
          </>
        )}
        {receipt.paid_at && (
          <>
            <dt>Paid at</dt>
            <dd>{new Date(receipt.paid_at).toLocaleString()}</dd>
          </>
        )}
        {receipt.received_by && (
          <>
            <dt>Received by</dt>
            <dd>{receipt.received_by}</dd>
          </>
        )}
      </dl>
      <button
        className="refresh-button no-print"
        onClick={() => window.print()}
      >
        Print receipt
      </button>
      <Link className="no-print" to="/my-orders">
        Return
      </Link>
    </section>
  );
}

export function PaymentSettings() {
  const [loading, setLoading] = useState(true),
    [initialError, setInitialError] = useState(""),
    [attempt, setAttempt] = useState(0);

  const options = [
    ["card", "Debit and credit cards"],
    ["gcash", "GCash"],
    ["qrph", "QR Ph"],
    ["maya", "Maya"],
    ["grabpay", "GrabPay"],
    ["shopeepay", "ShopeePay"],
    ["atome", "Atome"],
    ["billease", "BillEase"],
  ];
  const [policy, setPolicy] = useState({
      cash_enabled: true,
      payment_method_types: ["card", "gcash", "qrph"],
      configured: false,
      mode: "test",
    }),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    setLoading(true);
    setInitialError("");
    setError("");
    api("/admin/payment-policy")
      .then((r) => setPolicy(r.data))
      .catch((e) => {
        setError(e.message);
        setInitialError(e.message);
      })
      .finally(() => setLoading(false));
  }, [attempt]);
  function toggle(method) {
    setPolicy((p) => ({
      ...p,
      payment_method_types: p.payment_method_types.includes(method)
        ? p.payment_method_types.filter((x) => x !== method)
        : [...p.payment_method_types, method],
    }));
  }
  async function save(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      const r = await api("/admin/payment-policy", {
        method: "PUT",
        body: JSON.stringify({
          cash_enabled: policy.cash_enabled,
          payment_method_types: policy.payment_method_types,
        }),
      });
      setPolicy((current) => ({ ...current, ...r.data }));
      setNotice(
        "Payment methods saved. The gateway only accepts methods enabled for your PayMongo merchant account.",
      );
    } catch (e) {
      setError(e.message);
    }
  }
  if (loading || initialError)
    return (
      <section className="welcome">
        <h1>Payment settings</h1>
        {loading ? (
          <Skeleton label="Loading payment settings" />
        ) : (
          <Feedback onRetry={() => setAttempt((value) => value + 1)}>
            {initialError}
          </Feedback>
        )}
      </section>
    );
  return (
    <section className="welcome payment-settings">
      <span className="eyebrow">CHECKOUT CONFIGURATION</span>
      <h1>Payment settings</h1>
      <p>
        Provider secret keys stay in the Laravel server environment and are
        never sent to the browser.
      </p>
      <div className={policy.configured ? "success" : "error"}>
        {policy.configured
          ? `PayMongo key configured · ${policy.mode} mode`
          : "PayMongo key is not configured. Add sandbox credentials to backend/.env."}
      </div>
      {error && <Feedback>{error}</Feedback>}
      {notice && <Feedback tone="success">{notice}</Feedback>}
      <form className="payment-settings-form" onSubmit={save}>
        <label className="checkline">
          <input
            type="checkbox"
            checked={policy.cash_enabled}
            onChange={(e) =>
              setPolicy((p) => ({ ...p, cash_enabled: e.target.checked }))
            }
          />
          Accept cash payments
        </label>
        <h2>PayMongo Hosted Checkout methods</h2>
        <p>
          Enable only payment methods that are active for the merchant.
          Test-mode availability can differ from live account eligibility.
        </p>
        <div className="payment-method-options">
          {options.map(([value, label]) => (
            <label className="checkline" key={value}>
              <input
                type="checkbox"
                checked={policy.payment_method_types.includes(value)}
                onChange={() => toggle(value)}
              />
              {label}
            </label>
          ))}
        </div>
        <button disabled={policy.payment_method_types.length === 0}>
          Save payment settings
        </button>
      </form>
    </section>
  );
}
