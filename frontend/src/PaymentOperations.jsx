import { EmptyState, Feedback, Skeleton } from "./components/ui";
import { usePrompt } from "./components/ConfirmProvider";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "./api";

const money = (value) => `₱${Number(value || 0).toFixed(2)}`;
const title = (value) => String(value || "").replaceAll("_", " ");

export function PaymentDashboard({ user = { permissions: [] } }) {
  const [loading, setLoading] = useState(true);
  const ask = usePrompt();
  const [payments, setPayments] = useState([]),
    [bills, setBills] = useState([]),
    [queue, setQueue] = useState({ orders: [], reservation_deposits: [] }),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const canCash = user.permissions?.includes("payments.manage"),
    canRefund = user.permissions?.includes("payments.refund");
  async function load() {
    setError("");
    try {
      const requests = [api("/payments")];
      if (canCash)
        requests.push(
          api("/dining-sessions/open-bills"),
          api("/cashier/payment-queue"),
        );
      const [p, b, q] = await Promise.all(requests);
      setPayments(p.data?.data || []);
      setBills(b?.data || []);
      setQueue(q?.data || { orders: [], reservation_deposits: [] });
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    const id = setInterval(load, 12000);
    return () => clearInterval(id);
  }, []);
  async function refund(payment) {
    const notes = await ask(
      `Confirm full refund of ${money(payment.amount)}. Enter a short reason note:`,
    );
    if (!notes) return;
    const reason = await ask(
      "Refund category: duplicate, fraudulent, requested_by_customer, or others",
      "requested_by_customer",
    );
    if (!reason) return;
    try {
      await api(`/admin/payments/${payment.id}/refund`, {
        method: "POST",
        body: JSON.stringify({ reason, notes }),
      });
      setNotice(
        "Refund request recorded. Provider refunds may remain processing until PayMongo confirms completion.",
      );
      await load();
    } catch (e) {
      setError(e.message);
    }
  }
  async function payBill(bill, method) {
    try {
      const p = await api(`/dining-sessions/${bill.id}/payments/${method}`, {
        method: "POST",
      });
      if (method === "checkout") window.location.assign(p.data.checkout_url);
      else {
        setNotice(`Cash payment recorded for Table ${bill.table_number}.`);
        await load();
      }
    } catch (e) {
      setError(e.message);
    }
  }
  async function payOrder(order, method) {
    try {
      const p = await api(`/orders/${order.id}/payments/${method}`, {
        method: "POST",
      });
      if (method === "checkout") window.location.assign(p.data.checkout_url);
      else {
        setNotice(`Cash payment recorded for ${order.order_number}.`);
        await load();
      }
    } catch (e) {
      setError(e.message);
    }
  }
  async function cashDeposit(item) {
    try {
      await api(`/reservations/${item.id}/deposit/cash`, { method: "POST" });
      setNotice(`Cash deposit recorded for ${item.reference}.`);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <section className="welcome payment-dashboard">
      <span className="eyebrow">PAYMENTS</span>
      <h1>Payments and dining bills</h1>
      <p>
        Paid status comes from verified PayMongo events or an authorized staff
        cash record.
      </p>
      {loading && <Skeleton label="Loading your content" />}
      {!loading &&
        !error &&
        payments.length === 0 &&
        bills.length === 0 &&
        queue.orders.length === 0 &&
        queue.reservation_deposits.length === 0 && (
          <EmptyState
            title="All clear for now"
            description="Dining bills, deposits and transactions appear here as service gets underway."
          />
        )}
      {error && <Feedback onRetry={load}>{error}</Feedback>}
      {notice && <Feedback tone="success">{notice}</Feedback>}
      <button className="refresh-button" onClick={load}>
        Refresh
      </button>
      {canCash && (
        <>
          <h2>Open dine-in bills</h2>
          <div className="payment-bills">
            {bills
              .filter((b) => Number(b.balance_due) > 0)
              .map((b) => (
                <article className="payment-row" key={b.id}>
                  <div>
                    <strong>
                      Table {b.table_number} · {money(b.balance_due)} due
                    </strong>
                    <small>
                      {b.orders
                        .map((o) => `${o.order_number} (${title(o.status)})`)
                        .join(" · ")}
                    </small>
                  </div>
                  <div>
                    <button
                      disabled={b.payment_pending}
                      onClick={() => payBill(b, "checkout")}
                    >
                      {b.payment_pending ? "Checkout pending" : "Pay online"}
                    </button>
                    <button
                      disabled={b.payment_pending}
                      onClick={() => payBill(b, "cash")}
                    >
                      Record cash
                    </button>
                  </div>
                </article>
              ))}
          </div>
          <h2>Orders with a balance</h2>
          <div className="payment-bills">
            {queue.orders.map((o) => (
              <article className="payment-row" key={o.id}>
                <div>
                  <strong>
                    {o.order_number} · {money(o.balance_due)} due
                  </strong>
                  <small>
                    {o.customer_name} · {title(o.order_type)} ·{" "}
                    {title(o.status)}
                  </small>
                </div>
                <div>
                  <button
                    disabled={o.payment_pending}
                    onClick={() => payOrder(o, "checkout")}
                  >
                    Pay online
                  </button>
                  <button
                    disabled={o.payment_pending}
                    onClick={() => payOrder(o, "cash")}
                  >
                    Record cash
                  </button>
                </div>
              </article>
            ))}
          </div>
          <h2>Reservation deposits due</h2>
          <div className="payment-bills">
            {queue.reservation_deposits.map((r) => (
              <article className="payment-row" key={r.id}>
                <div>
                  <strong>
                    {r.reference} · {money(r.deposit_amount)} deposit
                  </strong>
                  <small>
                    {r.guest_name} · {new Date(r.starts_at).toLocaleString()}
                  </small>
                </div>
                <button
                  disabled={r.payment_pending}
                  onClick={() => cashDeposit(r)}
                >
                  Record cash deposit
                </button>
              </article>
            ))}
          </div>
        </>
      )}
      <h2>Recent transactions</h2>
      <div className="payment-list">
        {payments.map((p) => (
          <article className="payment-row" key={p.id}>
            <div>
              <strong>
                {p.reference_number || `Payment #${p.id}`} · {title(p.status)}
              </strong>
              <small>
                {p.order?.order_number ||
                  p.reservation?.reference ||
                  `Table session ${p.dining_session_id || "—"}`}{" "}
                ·{" "}
                {p.received_by?.name ||
                  p.order?.customer_name_snapshot ||
                  "Online customer"}
              </small>
              <small>
                {title(p.purpose)} · {title(p.method)} · {money(p.amount)}{" "}
                {p.currency}
              </small>
            </div>
            <div>
              <Link className="receipt-link" to={`/payments/${p.id}/receipt`}>
                Receipt
              </Link>
              {canRefund && p.status === "paid" && (
                <button className="danger-button" onClick={() => refund(p)}>
                  Full refund
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
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
