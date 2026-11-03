// Plain-text receipts for 80mm thermal printers: 40 characters a line,
// spaces only (no tabs or tables), header and footer centred, prices right.

export const RECEIPT_WIDTH = 40;
const QTY = 4; // "12x "
const PRICE = 11; // "  12,345.00"
const NAME = RECEIPT_WIDTH - QTY - PRICE;

const amount = (value) =>
  Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** Breaks text into lines no longer than `width`, splitting long words. */
export function wrap(text, width) {
  const words = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const lines = [];
  let line = "";
  for (let word of words) {
    while (word.length > width) {
      if (line) {
        lines.push(line);
        line = "";
      }
      lines.push(word.slice(0, width));
      word = word.slice(width);
    }
    if (!line) line = word;
    else if (line.length + 1 + word.length <= width) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

export function center(text) {
  return wrap(text, RECEIPT_WIDTH).map((line) => {
    const left = Math.floor((RECEIPT_WIDTH - line.length) / 2);
    return " ".repeat(left) + line;
  });
}

/** Label on the left, value on the right, together exactly 40 wide. */
export function row(label, value) {
  const right = String(value ?? "");
  const room = RECEIPT_WIDTH - right.length - 1;
  const [first, ...rest] = wrap(label, Math.max(1, room));
  return [
    first +
      " ".repeat(Math.max(1, RECEIPT_WIDTH - first.length - right.length)) +
      right,
    ...rest,
  ];
}

const rule = (char) => char.repeat(RECEIPT_WIDTH);
const titleCase = (value) =>
  String(value || "")
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
const TYPES = { dine_in: "Dine-in", pickup: "Take-out", delivery: "Delivery" };
const METHODS = { gcash: "GCash", qrph: "QR Ph", card: "Card", cash: "Cash" };

/** One dish: quantity and name on the left, price on the right, extras below. */
function itemLines(line) {
  const qty = `${line.quantity}x`.padEnd(QTY);
  const name = [line.name, line.variant && `(${line.variant})`]
    .filter(Boolean)
    .join(" ");
  const [first, ...rest] = wrap(name, NAME);
  const out = [qty + first.padEnd(NAME) + amount(line.total).padStart(PRICE)];
  for (const more of rest) out.push(" ".repeat(QTY) + more);
  const extras = [
    ...(line.addons || []),
    ...(line.note ? [`Note: ${line.note}`] : []),
  ];
  for (const extra of extras)
    for (const [index, part] of wrap(extra, RECEIPT_WIDTH - QTY - 4).entries())
      out.push(" ".repeat(QTY) + (index ? "    " : "  - ") + part);
  return out;
}

/** The whole receipt as text, every line at most 40 characters. */
export function formatThermalReceipt(receipt, { now = new Date() } = {}) {
  const shop = receipt.restaurant || {};
  const when = receipt.paid_at ? new Date(receipt.paid_at) : now;
  const lines = [];
  const push = (...more) => lines.push(...more.flat());

  // Store header.
  push(center((shop.name || "DineFlow").toUpperCase()));
  if (shop.address) push(center(shop.address));
  if (shop.phone) push(center(`Tel: ${shop.phone}`));
  push(rule("="));

  // Order details.
  const date = when.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
  const time = when.toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  });
  push(row(`Date: ${date}`, `Time: ${time}`));
  if (receipt.order_number) push(row("Order No:", receipt.order_number));
  if (receipt.reservation_reference)
    push(row("Booking:", receipt.reservation_reference));
  if (receipt.order_type)
    push(
      row(
        "Order Type:",
        TYPES[receipt.order_type] || titleCase(receipt.order_type),
      ),
    );
  if (receipt.table) push(row("Table:", receipt.table));
  if (receipt.reference) push(row("Receipt No:", receipt.reference));
  if (receipt.received_by) push(row("Cashier:", receipt.received_by));
  push(rule("-"));

  // Items.
  const items = receipt.lines || [];
  if (items.length) {
    push("QTY".padEnd(QTY) + "ITEM".padEnd(NAME) + "PRICE".padStart(PRICE));
    push(rule("-"));
    for (const line of items) push(itemLines(line));
    push(rule("-"));
  }

  // Money.
  const itemTotal = items.reduce(
    (sum, line) => sum + Number(line.total || 0),
    0,
  );
  const charges = receipt.charges || [];
  const tax = charges.find((charge) => /tax|vat/i.test(charge.name));
  if (items.length) {
    push(row("Item Total", amount(itemTotal)));
    push(row("Subtotal", amount(receipt.subtotal ?? itemTotal)));
  }
  for (const charge of charges) {
    if (charge === tax) continue;
    const value = Number(charge.total);
    push(row(charge.name, value < 0 ? `-${amount(-value)}` : amount(value)));
  }
  push(row(tax ? "Tax/VAT" : "Tax/VAT (incl.)", amount(tax?.total || 0)));
  push(rule("="));
  const total =
    receipt.order_total && items.length ? receipt.order_total : receipt.amount;
  push(row("GRAND TOTAL", `PHP ${amount(total)}`));
  push(rule("="));
  const method =
    METHODS[String(receipt.method || "").toLowerCase()] ||
    titleCase(receipt.method || "cash");
  push(row("Payment Method:", method));
  if (Number(receipt.amount) !== Number(total))
    push(row("Paid This Receipt:", amount(receipt.amount)));
  const tendered = receipt.cash_tendered ?? receipt.amount;
  push(
    row(
      method === "Cash" ? "Cash Received:" : "Amount Received:",
      amount(tendered),
    ),
  );
  push(row("Change Due:", amount(receipt.change ?? 0)));
  if (receipt.status && receipt.status !== "paid") {
    push(rule("-"));
    push(center(`*** ${titleCase(receipt.status).toUpperCase()} ***`));
  }
  push(rule("-"));

  // Footer.
  push(center("Thank you for dining with us!"));
  push(center("Please come again."));
  if (shop.social) push(center(shop.social));
  push(center("Powered by DineFlow"));
  return lines.join("\n");
}
