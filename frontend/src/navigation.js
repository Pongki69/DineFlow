export const navigationByPermission = [
  ["Browse menu", "customer.account", "/menu"],
  ["Restaurant location", "customer.account", "/restaurant"],
  ["Reserve a table", "reservations.create", "/reserve"],
  ["My reservations", "reservations.view_own", "/my-reservations"],
  ["My orders", "customer.account", "/my-orders"],
  ["My account", "customer.account", "/account"],
  ["Overview", "dashboard.view", "/dashboard"],
  ["Reservations", "reservations.manage", "/reservations"],
  ["Floor plan", "floorplan.manage", "/admin/floor-plan"],
  ["Orders", "orders.manage", "/orders"],
  ["Menu management", "menu.manage", "/admin/menu"],
  ["Kitchen queue", "kitchen.orders.view", "/kitchen"],
  ["Service tables", "service.tables.view", "/service"],
  ["Deliveries", "deliveries.manage", "/admin/deliveries"],
  ["My deliveries", "deliveries.assigned", "/rider"],
  ["Payments & refunds", "payments.manage|payments.refund", "/payments"],
  ["Daily transactions", "reports.daily_transactions", "/cashier/summary"],
  ["Reports", "reports.operations", "/reports"],
  ["Team & access", "users.manage", "/admin/users"],
  ["Reservation settings", "settings.manage", "/admin/settings"],
  ["Payment settings", "settings.manage", "/admin/payment-settings"],
  ["Delivery settings", "settings.manage", "/admin/delivery"],
  ["Business settings", "settings.manage", "/admin/business-settings"],
  ["Audit log", "audit.view", "/admin/audit"],
];

export function visibleNavigation(permissions = [], roles = []) {
  const granted = new Set(permissions);
  const isCustomer = roles.includes("customer");
  return navigationByPermission.filter(
    ([, permission]) =>
      permission.split("|").some((value) => granted.has(value)) &&
      (permission !== "customer.account" || isCustomer),
  );
}
