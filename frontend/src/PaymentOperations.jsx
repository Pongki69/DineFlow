import { subscribeToLiveChanges } from "./liveUpdates";
import { useLiveSettings } from "./components/useLiveSettings";
import { EmptyState, Feedback, Skeleton, StatusBadge } from "./components/ui";
import { usePrompt } from "./components/ConfirmProvider";
import { CardHeading, StatIcon, useAdminDesktop } from "./components/adminDesk";
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  CreditCard,
  Receipt,
  ReceiptText,
  RefreshCw,
  Search,
  Table2,
  Wallet,
  X,
  AlertCircle,
  CheckCircle2,
  Printer,
  UtensilsCrossed,
  Undo2,
  ArrowUpDown,
  Copy,
  Globe,
  Smartphone,
  Banknote,
  ArrowLeft,
  Download,
  FileText,
} from "lucide-react";
import { RowMenu } from "./components/RowMenu";
import { CountUp } from "./components/CountUp";
import { Link, useNavigate, useParams } from "react-router-dom";
import "./features/paymentReceipt.css";
import {
  ThermalReceipt,
  downloadReceiptText,
  printReceiptCard,
  printThermalReceipt,
} from "./components/ThermalReceipt";
import { api } from "./api";
import "./features/staffSage.css";

const money = (value) =>
  `₱${Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// "gcash" → "GCash", "dining_session" → "Dining session".
const BRANDS = {
  gcash: "GCash",
  qrph: "QR Ph",
  maya: "Maya",
  paymaya: "Maya",
  grabpay: "GrabPay",
  shopeepay: "ShopeePay",
  billease: "BillEase",
};
const title = (value) =>
  BRANDS[String(value || "").toLowerCase()] ||
  String(value || "")
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());

// Payment rows: a small icon tile per method (simple icons, not brand logos).
const METHOD_ICONS = {
  cash: Banknote,
  gcash: Smartphone,
  card: CreditCard,
  online: Globe,
};
function methodKind(method) {
  const value = String(method || "").toLowerCase();
  if (value.includes("cash") && !value.includes("gcash")) return "cash";
  if (
    ["gcash", "maya", "grabpay", "shopeepay", "qrph"].some((name) =>
      value.includes(name),
    )
  )
    return "gcash";
  if (value.includes("card")) return "card";
  return "online";
}

// The Payments & bills view (data, filters, pages, scroll) saved when a
// receipt is opened. Coming back shows it once, in place, then refreshes.
let savedPaymentsView = null;

export function PaymentDashboard({ user = { permissions: [] } }) {
  const ask = usePrompt();
  const desk = useAdminDesktop();
  const saved =
    savedPaymentsView?.userId === user.id ? savedPaymentsView : null;
  const [loading, setLoading] = useState(!saved);
  const [hasLoaded, setHasLoaded] = useState(Boolean(saved));
  const [refreshing, setRefreshing] = useState(false);
  const [payments, setPayments] = useState(saved?.payments || []);
  const [bills, setBills] = useState(saved?.bills || []);
  const [queue, setQueue] = useState(
    saved?.queue || { orders: [], reservation_deposits: [] },
  );
  const [meta, setMeta] = useState(
    saved?.meta || { current_page: 1, last_page: 1, total: 0 },
  );
  const [page, setPage] = useState(saved?.page || 1);
  const [query, setQuery] = useState(saved?.query || "");
  const [status, setStatus] = useState(saved?.status || "");
  const [queueType, setQueueType] = useState(saved?.queueType || "");
  // Admin desktop: the settle queue as a table, oldest first, ten a page.
  const [queueSort, setQueueSort] = useState(saved?.queueSort || "oldest");
  const [queuePage, setQueuePage] = useState(saved?.queuePage || 1);
  // Keep the view current so it can be saved when the page is left.
  const view = useRef(null);
  view.current = {
    userId: user.id,
    payments,
    bills,
    queue,
    meta,
    page,
    query,
    status,
    queueType,
    queueSort,
    queuePage,
  };
  useLayoutEffect(() => {
    savedPaymentsView = null;
    if (saved?.scrollY) window.scrollTo(0, saved.scrollY);
  }, []);
  const rememberView = () => {
    savedPaymentsView = { ...view.current, scrollY: window.scrollY };
  };
  // Admin desktop review: how the balance is paid, and cash handed over.
  const [payMethod, setPayMethod] = useState("cash");
  const [cashGiven, setCashGiven] = useState("");
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
        from: result.from || 0,
        to: result.to || 0,
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
    const unsubscribe = subscribeToLiveChanges(() => {
      if (!busyRef.current) return load();
    }, ["payments", "orders", "reservations"]);
    return () => {
      mounted.current = false;
      requestVersion.current += 1;
      unsubscribe();
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
      label: /^table\s/i.test(String(bill.table_number))
        ? String(bill.table_number)
        : "Table " + bill.table_number,
      detail:
        bill.orders?.map((order) => order.order_number).join(" · ") ||
        "Dining session bill",
      balance: Number(bill.balance_due),
      paymentPending: bill.payment_pending,
      since: bill.opened_at,
      billRequested: Boolean(bill.bill_requested_at),
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
        since: order.created_at,
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
      visitAt: reservation.starts_at,
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
  // Desk table: oldest waiting first by default (deposits by visit time).
  const waitStart = (entry) =>
    new Date(entry.since || entry.visitAt || 0).getTime() || 0;
  const sortedEntries = [...visibleEntries].sort(
    {
      oldest: (a, b) => waitStart(a) - waitStart(b),
      newest: (a, b) => waitStart(b) - waitStart(a),
      largest: (a, b) => b.balance - a.balance,
      name: (a, b) =>
        String(a.label).localeCompare(String(b.label), undefined, {
          numeric: true,
        }),
    }[queueSort],
  );
  const QUEUE_PER_PAGE = 10;
  const QueueRow = desk ? "div" : Fragment;
  const queuePages = Math.max(
    1,
    Math.ceil(sortedEntries.length / QUEUE_PER_PAGE),
  );
  const queueAt = Math.min(queuePage, queuePages);
  const pagedEntries = sortedEntries.slice(
    (queueAt - 1) * QUEUE_PER_PAGE,
    queueAt * QUEUE_PER_PAGE,
  );
  const waited = (value) => {
    const minutes = Math.max(
      0,
      Math.floor((Date.now() - new Date(value).getTime()) / 60000),
    );
    if (!Number.isFinite(minutes)) return "—";
    if (minutes < 60) return minutes + " min";
    if (minutes < 1440)
      return Math.floor(minutes / 60) + " h " + (minutes % 60) + " min";
    return (
      Math.floor(minutes / 1440) +
      " d " +
      Math.floor((minutes % 1440) / 60) +
      " h"
    );
  };
  const kindLabel = (kind) =>
    kind === "session"
      ? "Dining bill"
      : kind === "reservation"
        ? "Deposit"
        : "Order";
  const KindIcon = (kind) =>
    kind === "session"
      ? Table2
      : kind === "reservation"
        ? CalendarDays
        : Receipt;
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
    setPayMethod("cash");
    setCashGiven("");
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
              <strong>
                {unavailable ? (
                  "—"
                ) : desk ? (
                  <CountUp value={entries.length} />
                ) : (
                  entries.length
                )}
              </strong>
              <small>Dining bills, orders & deposits</small>
              <StatIcon icon={ReceiptText} />
            </article>
            <article>
              <span>Balance to collect</span>
              <strong>
                {unavailable
                  ? "—"
                  : (() => {
                      const total = entries.reduce(
                        (sum, entry) =>
                          sum +
                          (Number.isFinite(entry.balance) ? entry.balance : 0),
                        0,
                      );
                      return desk ? (
                        <CountUp value={total} decimals={2} format={money} />
                      ) : (
                        money(total)
                      );
                    })()}
              </strong>
              <small>Current collection queue</small>
              <StatIcon icon={Wallet} />
            </article>
          </>
        ) : (
          <article>
            <span>Transactions</span>
            <strong>
              {unavailable ? (
                "—"
              ) : desk ? (
                <CountUp value={meta.total} />
              ) : (
                meta.total
              )}
            </strong>
            <small>Payment records</small>
            <StatIcon icon={ReceiptText} />
          </article>
        )}
        <article>
          <span>Online checkout pending</span>
          <strong>
            {unavailable
              ? "—"
              : (() => {
                  const pending = canCash
                    ? entries.filter((entry) => entry.paymentPending).length
                    : payments.filter((payment) => payment.status === "pending")
                        .length;
                  return desk ? <CountUp value={pending} /> : pending;
                })()}
          </strong>
          <small>
            {canCash
              ? "Check status before collecting again"
              : "On this transaction page"}
          </small>
          <StatIcon icon={Clock3} />
        </article>
      </div>
      {loading && (
        <Skeleton
          label="Loading bills and payments"
          layout={{ body: "table", rows: 8 }}
        />
      )}
      {canCash && (
        <section className="sage-panel" aria-labelledby="collection-heading">
          {desk ? (
            <CardHeading
              id="collection-heading"
              icon={Wallet}
              title="Ready to settle"
              description="Dining bills, orders and deposits with a balance to collect."
              actions={
                <span className="sage-count">
                  {hasLoaded ? entries.length : "—"}{" "}
                  {hasLoaded && entries.length === 1 ? "balance" : "balances"}
                </span>
              }
            />
          ) : (
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
          )}
          {/* Admin desktop: the chips and the sort share one row. */}
          <QueueRow {...(desk ? { className: "settle-filter-row" } : {})}>
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
                  onClick={() => {
                    setQueueType(value);
                    setQueuePage(1);
                  }}
                >
                  {label}
                  {desk && hasLoaded && (
                    <span className="admin-count">
                      {value
                        ? entries.filter((entry) => entry.kind === value).length
                        : entries.length}
                    </span>
                  )}
                </button>
              ))}
            </div>
            {desk && (
              <label className="settle-sort">
                <ArrowUpDown size={15} aria-hidden="true" />
                <span>Sort</span>
                <select
                  aria-label="Sort balances"
                  value={queueSort}
                  onChange={(event) => {
                    setQueueSort(event.target.value);
                    setQueuePage(1);
                  }}
                >
                  <option value="oldest">Waiting longest</option>
                  <option value="newest">Newest first</option>
                  <option value="largest">Largest balance</option>
                  <option value="name">Table / order</option>
                </select>
              </label>
            )}
          </QueueRow>
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
          {desk && sortedEntries.length > 0 && (
            <>
              <div className="catalog-desktop-table-wrap settle-table-wrap">
                <table
                  className="catalog-desktop-table settle-table"
                  aria-label="Balances to settle"
                >
                  <thead>
                    <tr>
                      <th scope="col">Balance</th>
                      <th scope="col">Type</th>
                      <th scope="col">Details</th>
                      <th scope="col">Waiting</th>
                      <th scope="col" className="catalog-table-num">
                        Due
                      </th>
                      <th scope="col" className="catalog-table-end">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedEntries.map((entry) => {
                      const Icon = KindIcon(entry.kind);
                      return (
                        <tr key={entry.kind + "-" + entry.id}>
                          <th scope="row">
                            <div className="settle-name">
                              <span className="settle-icon" aria-hidden="true">
                                <Icon size={18} />
                              </span>
                              <strong>{entry.label}</strong>
                            </div>
                          </th>
                          <td>
                            <span
                              className="settle-kind"
                              data-kind={entry.kind}
                            >
                              {kindLabel(entry.kind)}
                            </span>
                          </td>
                          <td className="settle-detail">
                            <span>{entry.detail}</span>
                            {(entry.billRequested || entry.paymentPending) && (
                              <span className="settle-tags">
                                {entry.billRequested && (
                                  <b data-tone="pending">Bill requested</b>
                                )}
                                {entry.paymentPending && (
                                  <b data-tone="progress">
                                    <Clock3 size={12} aria-hidden="true" />
                                    Checkout pending
                                  </b>
                                )}
                              </span>
                            )}
                          </td>
                          <td className="settle-wait">
                            {entry.since
                              ? waited(entry.since)
                              : entry.visitAt
                                ? "Visit " +
                                  new Date(entry.visitAt).toLocaleDateString(
                                    [],
                                    {
                                      month: "short",
                                      day: "numeric",
                                    },
                                  )
                                : "—"}
                          </td>
                          <td className="catalog-table-num settle-due">
                            {money(entry.balance)}
                          </td>
                          <td className="catalog-table-end">
                            <button
                              className="sage-button sage-button--secondary settle-review"
                              onClick={(event) => openReview(entry, event)}
                              disabled={!!busy}
                              aria-label={"Review payment for " + entry.label}
                            >
                              Review
                              <ArrowRight size={15} aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Always shown, so the card keeps one height. */}
              <nav className="sage-pagination" aria-label="Balance pages">
                <button
                  className="sage-button sage-button--secondary"
                  disabled={queueAt <= 1}
                  onClick={() => setQueuePage(queueAt - 1)}
                >
                  Previous
                </button>
                <span>
                  Showing {(queueAt - 1) * QUEUE_PER_PAGE + 1}–
                  {Math.min(queueAt * QUEUE_PER_PAGE, sortedEntries.length)} of{" "}
                  {sortedEntries.length} · Page {queueAt} of {queuePages}
                </span>
                <button
                  className="sage-button sage-button--secondary"
                  disabled={queueAt >= queuePages}
                  onClick={() => setQueuePage(queueAt + 1)}
                >
                  Next
                </button>
              </nav>
            </>
          )}
          <div className="sage-bill-grid" hidden={desk || undefined}>
            {!desk &&
              visibleEntries.map((entry) => (
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
                  {desk ? (
                    <>
                      {entry.paymentPending && (
                        <p className="sage-attention-label sage-bill-tag">
                          <Clock3 size={13} aria-hidden="true" />
                          Online checkout pending
                        </p>
                      )}
                      <footer className="sage-bill-foot">
                        <div className="sage-bill-amount">
                          <span>Balance due</span>
                          <strong>{money(entry.balance)}</strong>
                        </div>
                        <button
                          className="sage-button"
                          onClick={(event) => openReview(entry, event)}
                          disabled={!!busy}
                        >
                          Review payment
                          <ArrowRight size={16} aria-hidden="true" />
                        </button>
                      </footer>
                    </>
                  ) : (
                    <>
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
                    </>
                  )}
                </article>
              ))}
          </div>
        </section>
      )}
      <section className="sage-panel" aria-labelledby="transactions-heading">
        {desk ? (
          <CardHeading
            id="transactions-heading"
            icon={ReceiptText}
            title="Payments & receipts"
            description="Paid status comes from verified provider events or an authorized cash record."
            actions={
              <span className="sage-count">
                {hasLoaded ? meta.total : "—"}{" "}
                {hasLoaded && meta.total === 1 ? "record" : "records"}
              </span>
            }
          />
        ) : (
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
        )}
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
        {desk && visiblePayments.length > 0 && (
          <div className="sage-transactions-head" aria-hidden="true">
            <span>Payment</span>
            <span>Method</span>
            <span>Status</span>
            <span>Amount</span>
            <span />
          </div>
        )}
        <div className="sage-transactions" data-desk={desk || undefined}>
          {visiblePayments.map((payment) =>
            desk ? (
              <article
                className="sage-transaction"
                key={payment.id}
                data-status={payment.status}
              >
                <div className="sage-transaction-main">
                  <h3>
                    {payment.reference_number || "Payment #" + payment.id}
                  </h3>
                  <p>
                    {payment.order?.order_number ||
                      payment.reservation?.reference ||
                      "Dining session " +
                        (payment.dining_session_id || "—")}{" "}
                    · {title(payment.purpose)}
                  </p>
                </div>
                <div
                  className="sage-transaction-method"
                  data-method={methodKind(payment.method)}
                >
                  {(() => {
                    const Icon = METHOD_ICONS[methodKind(payment.method)];
                    return (
                      <span className="pay-method-icon" aria-hidden="true">
                        <Icon size={16} />
                      </span>
                    );
                  })()}
                  <span>{title(payment.method)}</span>
                  <small>
                    {payment.received_by?.name ||
                      payment.order?.customer_name_snapshot ||
                      "Online customer"}
                  </small>
                </div>
                <div className="sage-transaction-status">
                  <StatusBadge status={payment.status} />
                </div>
                <strong className="sage-transaction-amount">
                  {money(payment.amount)}
                </strong>
                <div className="sage-transaction-actions">
                  <Link
                    className="sage-button sage-button--secondary"
                    to={"/payments/" + payment.id + "/receipt"}
                    onClick={rememberView}
                    aria-label={
                      "Receipt for " +
                      (payment.reference_number || "payment " + payment.id)
                    }
                  >
                    <Receipt size={16} aria-hidden="true" />
                    Receipt
                  </Link>
                  <RowMenu
                    label={
                      "More actions for " +
                      (payment.reference_number || "payment " + payment.id)
                    }
                    // Every row has the menu, so Receipt buttons line up.
                    items={[
                      {
                        key: "copy",
                        label: "Copy reference",
                        icon: Copy,
                        onSelect: () => {
                          const text =
                            payment.reference_number ||
                            "Payment #" + payment.id;
                          navigator.clipboard
                            ?.writeText(text)
                            .then(() => setNotice("Copied " + text + "."))
                            .catch(() => {});
                        },
                      },
                      canRefund &&
                        payment.status === "paid" && {
                          key: "refund",
                          label:
                            busy === "refund-" + payment.id
                              ? "Processing…"
                              : "Full refund",
                          icon: Undo2,
                          tone: "danger",
                          onSelect: () => {
                            if (!busy) refund(payment);
                          },
                        },
                    ].filter(Boolean)}
                  />
                </div>
              </article>
            ) : (
              <article className="sage-transaction" key={payment.id}>
                <div>
                  <h3>
                    {payment.reference_number || "Payment #" + payment.id}
                  </h3>
                  <p>
                    {payment.order?.order_number ||
                      payment.reservation?.reference ||
                      "Dining session " +
                        (payment.dining_session_id || "—")}{" "}
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
                    onClick={rememberView}
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
            ),
          )}
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
              {desk && meta.from && meta.to
                ? `Showing ${meta.from}–${meta.to} of ${meta.total} · `
                : ""}
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
            className="sage-icon-button pay-review-close"
            aria-label="Close payment review"
            onClick={closeReview}
            disabled={!!busy}
          >
            <X size={22} aria-hidden="true" />
          </button>
        </header>
        {desk ? (
          <>
            <div className="sage-review-body pay-review">
              <p id="payment-review-help" className="pay-review-help">
                {current
                  ? kindLabel(current.kind) + " · " + current.detail
                  : "Confirm the balance before collecting."}
              </p>
              {current ? (
                <>
                  <dl className="pay-review-lines">
                    {current.kind === "session" &&
                      current.source.orders?.map((order) => (
                        <div key={order.id || order.order_number}>
                          <dt>
                            {order.order_number}
                            <span>{title(order.status)}</span>
                          </dt>
                          <dd>{money(order.total)}</dd>
                        </div>
                      ))}
                    {current.kind === "session" &&
                      (() => {
                        const total = (current.source.orders || [])
                          .filter((order) => order.status !== "cancelled")
                          .reduce(
                            (sum, order) => sum + Number(order.total || 0),
                            0,
                          );
                        const paid = total - current.balance;
                        return paid > 0.004 ? (
                          <div className="pay-review-paid">
                            <dt>Already paid</dt>
                            <dd>−{money(paid)}</dd>
                          </div>
                        ) : null;
                      })()}
                    <div className="pay-review-due">
                      <dt>
                        {current.kind === "reservation"
                          ? "Deposit due"
                          : "Balance due"}
                      </dt>
                      <dd>{money(current.balance)}</dd>
                    </div>
                  </dl>
                  <fieldset className="pay-review-methods">
                    <legend>How is it paid?</legend>
                    {[
                      [
                        "cash",
                        Wallet,
                        "Cash at the counter",
                        "Record the cash you received.",
                      ],
                      current.kind !== "reservation" && [
                        "checkout",
                        CreditCard,
                        "Online checkout",
                        "GCash, card or QR Ph on a secure page.",
                      ],
                    ]
                      .filter(Boolean)
                      .map(([value, Icon, name, hint]) => (
                        <label
                          key={value}
                          data-checked={payMethod === value || undefined}
                        >
                          <input
                            type="radio"
                            name="pay-method"
                            value={value}
                            checked={payMethod === value}
                            onChange={() => setPayMethod(value)}
                          />
                          <Icon size={20} aria-hidden="true" />
                          <span>
                            <strong>{name}</strong>
                            <small>{hint}</small>
                          </span>
                        </label>
                      ))}
                  </fieldset>
                  {payMethod === "cash" && (
                    <div className="pay-review-cash">
                      <label className="pay-review-cash-field">
                        <span>Cash received</span>
                        <span className="pay-review-cash-input">
                          ₱
                          <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            value={cashGiven}
                            placeholder={Number(current.balance).toFixed(2)}
                            onChange={(event) =>
                              setCashGiven(event.target.value)
                            }
                          />
                        </span>
                      </label>
                      {(() => {
                        const given =
                          cashGiven === ""
                            ? current.balance
                            : Number(cashGiven);
                        const short = given < current.balance;
                        return (
                          <div
                            className="pay-review-change"
                            data-tone={short ? "short" : "good"}
                            aria-live="polite"
                          >
                            <span>{short ? "Short by" : "Change to give"}</span>
                            <strong>
                              {money(Math.abs(given - current.balance))}
                            </strong>
                          </div>
                        );
                      })()}
                      {/* Quick amounts: exact, then the next round notes. */}
                      <div
                        className="pay-review-quick"
                        role="group"
                        aria-label="Quick cash amounts"
                      >
                        {[
                          current.balance,
                          ...[100, 500, 1000].map(
                            (step) => Math.ceil(current.balance / step) * step,
                          ),
                        ]
                          .filter(
                            (amount, index, all) =>
                              amount > 0 && all.indexOf(amount) === index,
                          )
                          .slice(0, 4)
                          .map((amount, index) => (
                            <button
                              key={amount}
                              type="button"
                              aria-pressed={Number(cashGiven) === amount}
                              onClick={() => setCashGiven(amount.toFixed(2))}
                            >
                              {index === 0 ? "Exact" : money(amount)}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
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
            <footer className="pay-review-foot">
              <button
                type="button"
                className="sage-button sage-button--secondary"
                onClick={closeReview}
                disabled={!!busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="sage-button pay-review-confirm"
                disabled={
                  !current ||
                  !!busy ||
                  uncertain ||
                  current?.paymentPending ||
                  (payMethod === "cash" &&
                    cashGiven !== "" &&
                    Number(cashGiven) < (current?.balance || 0))
                }
                aria-busy={!!busy}
                onClick={() => settle(payMethod)}
              >
                {payMethod === "cash" ? (
                  <Wallet size={18} aria-hidden="true" />
                ) : (
                  <CreditCard size={18} aria-hidden="true" />
                )}
                {busy === "cash"
                  ? "Recording…"
                  : busy === "checkout"
                    ? "Opening checkout…"
                    : payMethod === "cash"
                      ? "Record " +
                        (current ? money(current.balance) : "") +
                        " cash"
                      : "Open online checkout"}
              </button>
            </footer>
          </>
        ) : (
          <>
            <div className="sage-review-body">
              <p id="payment-review-help">
                Confirm the balance before recording cash or opening secure
                hosted checkout. The server verifies the final amount.
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
          </>
        )}
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
    const unsubscribe = subscribeToLiveChanges(refresh, ["payments"]);
    return () => {
      active = false;
      unsubscribe();
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
  const navigate = useNavigate();
  // Admin desktop: Back and Print sit in a bar above the receipt.
  const desk = useAdminDesktop();
  const [receipt, setReceipt] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    const load = () =>
      api(`/payments/${paymentId}/receipt`)
        .then((r) => setReceipt(r.data))
        .catch((e) => setError(e.message));
    load();
    return subscribeToLiveChanges(load, ["payments"]);
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
        <Skeleton label="Loading receipt" layout={{ body: "receipt" }} />
      </section>
    );
  const paid = receipt.status === "paid";
  const when = receipt.paid_at ? new Date(receipt.paid_at) : null;
  const rows = [
    ["Reference", receipt.reference],
    ["Order", receipt.order_number],
    ["Booking", receipt.reservation_reference],
    ["Table", receipt.table],
    ["Paid with", receipt.method && title(receipt.method)],
    ["Cash received", receipt.cash_tendered && money(receipt.cash_tendered)],
    ["Change", receipt.cash_tendered && money(receipt.change || 0)],
    [
      "Date",
      when &&
        when.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }),
    ],
    ["Received by", receipt.received_by],
    ["Provider reference", receipt.provider_reference],
  ].filter(([, value]) => value);
  const restaurant = receipt.restaurant || { name: "DineFlow" };
  return (
    <section className="welcome receipt-page">
      <article className="receipt-paper" aria-label="Payment receipt">
        <header className="receipt-brand">
          <span className="receipt-logo" aria-hidden="true">
            <UtensilsCrossed size={22} />
          </span>
          <strong>
            {restaurant.name || "DineFlow"}
            {(!restaurant.name || restaurant.name === "DineFlow") && (
              <b className="receipt-dot">.</b>
            )}
          </strong>
          {restaurant.address && <small>{restaurant.address}</small>}
          {restaurant.phone && <small>{restaurant.phone}</small>}
        </header>
        <div className="receipt-amount" data-status={receipt.status}>
          <span className="receipt-status">
            {paid ? (
              <CheckCircle2 size={16} aria-hidden="true" />
            ) : (
              <AlertCircle size={16} aria-hidden="true" />
            )}
            {paid ? "Payment received" : title(receipt.status)}
          </span>
          <strong>{money(receipt.amount)}</strong>
          <small>
            {title(receipt.purpose)} · {receipt.currency}
          </small>
        </div>
        {(receipt.lines?.length > 0 || receipt.charges?.length > 0) && (
          <ul className="receipt-lines">
            {receipt.lines.map((line, index) => (
              <li key={index}>
                <span>
                  {line.quantity}× {line.name}
                  {line.variant && <small>{line.variant}</small>}
                </span>
                <b>{money(line.total)}</b>
              </li>
            ))}
            {(receipt.charges || []).map((charge) => (
              <li key={charge.name} className="receipt-charge">
                <span>{charge.name}</span>
                <b>
                  {Number(charge.total) < 0
                    ? `−${money(-Number(charge.total))}`
                    : money(charge.total)}
                </b>
              </li>
            ))}
          </ul>
        )}
        <dl className="receipt-rows">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <footer className="receipt-thanks">
          <p>Thank you for dining with us!</p>
          <small>Powered by DineFlow</small>
        </footer>
      </article>
      <ThermalReceipt receipt={receipt} />
      <div className="receipt-actions no-print">
        <button
          type="button"
          className="receipt-back"
          onClick={() =>
            window.history.length > 1 ? navigate(-1) : navigate("/payments")
          }
        >
          {desk && <ArrowLeft size={16} aria-hidden="true" />}
          {desk ? "Back to payments" : "Back"}
        </button>
        {/* Print shows the receipt as on screen; Save PDF names the file
            after the receipt; the thermal print and a text copy wait in ⋮. */}
        <div className="receipt-action-group">
          <button
            type="button"
            className="receipt-save"
            onClick={() =>
              printReceiptCard(
                "Receipt " + (receipt.reference || "payment " + paymentId),
              )
            }
          >
            <Download size={16} aria-hidden="true" />
            Save PDF
          </button>
          <button
            type="button"
            className="receipt-print"
            onClick={() => printReceiptCard()}
          >
            <Printer size={16} aria-hidden="true" />
            Print receipt
          </button>
          <RowMenu
            label="More receipt options"
            items={[
              {
                key: "thermal",
                label: "Thermal printer (80mm)",
                icon: Printer,
                onSelect: printThermalReceipt,
              },
              {
                key: "text",
                label: "Download text copy",
                icon: FileText,
                onSelect: () =>
                  downloadReceiptText(
                    receipt,
                    "Receipt " + (receipt.reference || "payment " + paymentId),
                  ),
              },
            ]}
          />
        </div>
      </div>
    </section>
  );
}

export function PaymentSettings() {
  const desk = useAdminDesktop();
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
  const [receivePolicy] = useLiveSettings(
    () => api("/admin/payment-policy").then((r) => r.data),
    policy,
    setPolicy,
  );
  useEffect(() => {
    setLoading(true);
    setInitialError("");
    setError("");
    api("/admin/payment-policy")
      .then((r) => receivePolicy(r.data))
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
      receivePolicy((current) => ({ ...current, ...r.data }));
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
          <Skeleton
            label="Loading payment settings"
            layout={{ body: "form", rows: 2 }}
          />
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
        {desk && (
          <CardHeading
            icon={Wallet}
            title="Checkout methods"
            description="How customers can pay at the counter and online."
          />
        )}
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
        {desk ? (
          <h3>PayMongo Hosted Checkout methods</h3>
        ) : (
          <h2>PayMongo Hosted Checkout methods</h2>
        )}
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
