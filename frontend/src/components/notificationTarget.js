import { visibleNavigation } from "../navigation";

/** Where an alert should take its reader: the page that holds the record it
 * is about, limited to pages this account can open. Null when there is none.
 * @param {{data?: object}} item
 * @param {{roles: string[], permissions: string[]}} user
 */
export function notificationTarget(item, user) {
  if (!user) return null;
  const data = item?.data || {};
  const context = data.context || {};
  const value = (key) => context[key] ?? data[key];
  const event = data.event || "";
  const roles = user.roles || [];
  const paths = new Set(
    visibleNavigation(user.permissions, roles).map(([, , path]) => path),
  );
  const first = (...candidates) =>
    candidates.find((path) => path && paths.has(path.split(/[?#]/)[0])) || null;
  const deliveryId = value("delivery_id");
  const orderId = value("order_id");
  const reservationId = value("reservation_id");
  const paymentId = value("payment_id");

  if (roles.includes("rider") && paths.has("/rider")) {
    if (value("offer_id") || event === "delivery.offer") return "/rider/offers";
    if (deliveryId) return `/rider/deliveries/${deliveryId}`;
  }
  if (roles.includes("customer")) {
    if (deliveryId) return `/delivery/${deliveryId}/tracking`;
    if (paymentId && event === "payment.paid")
      return `/payments/${paymentId}/receipt`;
    if (reservationId) return first("/my-reservations");
    if (orderId) return `${first("/my-orders")}?order=${orderId}`;
    if (paymentId) return first("/my-orders");
  }
  if (value("dining_session_id") || event === "bill.requested")
    return first("/payments");
  if (deliveryId)
    return first("/admin/deliveries", "/admin/tracking", "/admin/dashboard");
  if (reservationId) return first("/reservations");
  if (paymentId) return first("/payments", "/cashier/summary");
  if (orderId) {
    const list = first("/admin/orders", "/orders");
    return list ? `${list}?order=${orderId}` : first("/kitchen", "/service");
  }
  return null;
}
