// Pure helpers for the cashier desk: money, labels and the collection queue.

const PESO = new Intl.NumberFormat("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** ₱1,285.00 everywhere, never ₱1285.00. */
export function peso(value) {
  const number = Number(value);
  return `₱${PESO.format(Number.isFinite(number) ? number : 0)}`;
}

/** "Table 6" stays "Table 6"; "6" becomes "Table 6". */
export function tableLabel(table) {
  if (!table) return "Table";
  return /^table\s/i.test(String(table)) ? String(table) : `Table ${table}`;
}

const readable = (value) =>
  String(value || "")
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());

/**
 * Turns open bills and the payment queue into the cashier's groups, in the
 * order they should be handled:
 *   requested: tables that asked for the bill (oldest request first)
 *   tables:    other open table bills
 *   counter:   pickups, walk-in dine-in orders and reservation deposits
 *   delivery:  delivery orders (usually paid online or to the rider)
 */
export function collectionGroups(bills = [], queue = {}) {
  const groups = { requested: [], tables: [], counter: [], delivery: [] };
  const onBills = new Set();
  for (const bill of bills) {
    if (!(Number(bill.balance_due) > 0)) continue;
    (bill.orders || []).forEach((order) => onBills.add(order.order_number));
    const entry = {
      kind: "session",
      id: bill.id,
      key: `session-${bill.id}`,
      title: tableLabel(bill.table_number),
      detail: [
        `${(bill.orders || []).length} ${(bill.orders || []).length === 1 ? "order" : "orders"}`,
        bill.guest_count ? `${bill.guest_count} guests` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      search: [
        bill.table_number,
        ...(bill.orders || []).map((o) => o.order_number),
      ].join(" "),
      balance: Number(bill.balance_due),
      paymentPending: Boolean(bill.payment_pending),
      requestedAt: bill.bill_requested_at || null,
      since: bill.opened_at,
    };
    (entry.requestedAt ? groups.requested : groups.tables).push(entry);
  }
  for (const order of queue.orders || []) {
    if (onBills.has(order.order_number) || order.dining_session_id) continue;
    const entry = {
      kind: "order",
      id: order.id,
      key: `order-${order.id}`,
      title: order.order_number,
      detail: [
        readable(order.order_type),
        order.customer_name,
        readable(order.status),
      ]
        .filter(Boolean)
        .join(" · "),
      search: [
        order.order_number,
        order.customer_name,
        order.table_number,
      ].join(" "),
      brief: [readable(order.order_type), order.customer_name]
        .filter(Boolean)
        .join(" · "),
      balance: Number(order.balance_due),
      paymentPending: Boolean(order.payment_pending),
      orderType: order.order_type,
      status: order.status,
      since: order.created_at,
    };
    (order.order_type === "delivery" ? groups.delivery : groups.counter).push(
      entry,
    );
  }
  for (const deposit of queue.reservation_deposits || []) {
    groups.counter.push({
      kind: "reservation",
      id: deposit.id,
      key: `reservation-${deposit.id}`,
      title: deposit.reference,
      detail: ["Booking deposit", deposit.guest_name]
        .filter(Boolean)
        .join(" · "),
      search: [deposit.reference, deposit.guest_name].join(" "),
      balance: Number(deposit.deposit_amount),
      paymentPending: Boolean(deposit.payment_pending),
      since: deposit.starts_at,
    });
  }
  groups.requested.sort(
    (a, b) => new Date(a.requestedAt) - new Date(b.requestedAt),
  );
  const oldest = (a, b) =>
    (a.since ? new Date(a.since).getTime() : Infinity) -
      (b.since ? new Date(b.since).getTime() : Infinity) || 0;
  groups.tables.sort(oldest);
  groups.counter.sort(
    (a, b) => Number(isUrgent(b)) - Number(isUrgent(a)) || oldest(a, b),
  );
  return groups;
}

/** How long someone has been waiting: "4 min", "1 h 12 min". */
export function waitingFor(since, now = Date.now()) {
  const at = since ? new Date(since).getTime() : NaN;
  if (!Number.isFinite(at)) return "";
  const minutes = Math.max(0, Math.floor((now - at) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours >= 24) return `${Math.floor(hours / 24)} d`;
  return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
}

/** Someone is waiting to pay right now: asked for the bill, or food is out. */
export function isUrgent(entry) {
  return Boolean(
    entry.requestedAt ||
    (entry.kind === "order" &&
      ["ready_to_serve", "served", "completed"].includes(entry.status)),
  );
}

/** What the counter needs to know about an order, in a word or two. */
export function counterTag(entry) {
  if (entry.kind === "reservation")
    return { text: "Booking deposit", tone: "neutral" };
  if (entry.kind !== "order") return null;
  if (entry.status === "ready_to_serve")
    return { text: "Ready · customer waiting", tone: "ready" };
  if (["served", "completed"].includes(entry.status))
    return { text: "Handed over · unpaid", tone: "late" };
  if (["confirmed", "preparing"].includes(entry.status))
    return { text: "In the kitchen", tone: "cooking" };
  return { text: "Not started", tone: "neutral" };
}

/** Keeps entries whose table, order number or name contains the search. */
export function matchesSearch(entry, query) {
  const needle = String(query || "")
    .trim()
    .toLowerCase();
  return (
    !needle || `${entry.title} ${entry.search}`.toLowerCase().includes(needle)
  );
}

/**
 * Quick "cash received" buttons: the exact amount, then the next round
 * amounts a guest is likely to hand over (₱100 steps, then ₱500 and ₱1,000).
 */
export function quickCashAmounts(amount) {
  const due = Math.max(0, Number(amount) || 0);
  if (!due) return [];
  const options = [due];
  for (const step of [100, 500, 1000]) {
    const rounded = Math.ceil(due / step) * step;
    if (rounded > due) options.push(rounded);
  }
  if (due < 1000) options.push(1000);
  return [...new Set(options.map((value) => Math.round(value * 100) / 100))]
    .sort((a, b) => a - b)
    .slice(0, 4);
}

/** Totals per method for paid payments, biggest first: [{ method, total, count }]. */
export function totalsByMethod(payments = []) {
  const totals = new Map();
  for (const payment of payments) {
    if (payment.status !== "paid") continue;
    const method = payment.method || "other";
    const row = totals.get(method) || { method, total: 0, count: 0 };
    row.total =
      Math.round((row.total + Number(payment.amount || 0)) * 100) / 100;
    row.count += 1;
    totals.set(method, row);
  }
  return [...totals.values()].sort((a, b) => b.total - a.total);
}
