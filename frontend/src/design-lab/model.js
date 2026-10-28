// @ts-check
import { MOCK_ORDERS } from "../mocks/productionTestData";

/** @typedef {import('./types').MockOrder} MockOrder */
/** @typedef {'landing'|'administrator'|'manager'|'cashier'|'kitchen_staff'|'waiter'|'rider'|'customer'} PreviewRole */

/** @type {Record<PreviewRole, { label: string, title: string, summary: string, tasks: string[] }>} */
export const ROLE_LAYOUTS = {
  landing: {
    label: "Public landing",
    title: "Less waiting. More savoring.",
    summary:
      "Restaurant discovery, menu, reservations and delivery eligibility.",
    tasks: ["Explore menu", "Book a table", "Delivery area"],
  },
  administrator: {
    label: "Administrator",
    title: "Your restaurant, at a glance",
    summary:
      "Keep service moving. Resolve delivery exceptions before they become delays.",
    tasks: [
      "Dashboard",
      "Live delivery tracking",
      "Restaurant outlets",
      "Order management",
      "Rider fleet",
      "System settings",
    ],
  },
  manager: {
    label: "Manager",
    title: "Make this a smooth service",
    summary: "Orders, tables and deliveries in one operational view.",
    tasks: [
      "Overview",
      "Orders",
      "Reservations",
      "Table service",
      "Menu management",
      "Dispatch",
      "Reports",
    ],
  },
  cashier: {
    label: "Cashier",
    title: "Payments, without the wait",
    summary: "Review outstanding bills and choose the next payment to settle.",
    tasks: ["Payment queue", "Dining bills", "Transactions", "Daily summary"],
  },
  kitchen_staff: {
    label: "Kitchen Staff",
    title: "A clear queue. A calmer kitchen.",
    summary:
      "Read the ticket, check the options, then bump it to the next stage.",
    tasks: ["Kitchen queue", "Preparing", "Ready for pickup"],
  },
  waiter: {
    label: "Waiter",
    title: "Every table, well looked after",
    summary: "See who needs you next and keep the dining room in sync.",
    tasks: ["Floor overview", "Reservations", "Orders", "Table service"],
  },
  rider: {
    label: "Delivery Rider",
    title: "Your next stop, made clear",
    summary: "Review your assignment before heading to the restaurant.",
    tasks: ["Today", "My deliveries", "Offers", "History", "Ratings"],
  },
  customer: {
    label: "Customer",
    title: "What are you craving?",
    summary:
      "Fresh favorites, your way. Choose pickup, delivery or a table with us.",
    tasks: ["Menu", "My orders", "Reservations", "Restaurant"],
  },
};

/** @param {string|null} value @returns {PreviewRole} */
export function previewRole(value) {
  return value && Object.hasOwn(ROLE_LAYOUTS, value)
    ? /** @type {PreviewRole} */ (value)
    : "landing";
}

/** Keep the supplied four records unchanged. Volume clones are explicitly synthetic. @param {boolean} volume @returns {MockOrder[]} */
export function orderDataset(volume) {
  if (!volume) return MOCK_ORDERS;
  return Array.from({ length: 128 }, (_, index) => ({
    ...MOCK_ORDERS[index % MOCK_ORDERS.length],
    id: `sample_${String(index + 1).padStart(4, "0")}`,
    customerName: `${MOCK_ORDERS[index % MOCK_ORDERS.length].customerName} · sample ${index + 1}`,
  }));
}

/** @param {number} amount */
export function money(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

/** @param {number} value @param {number} [digits] */
export function decimal(value, digits = 1) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
  }).format(value);
}
