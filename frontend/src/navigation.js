export const navigationByPermission = [
  ["Browse menu", "customer.account", "/menu"],
  ["Restaurant location", "customer.account", "/restaurant"],
  ["Reserve a table", "reservations.create", "/reserve"],
  ["My reservations", "reservations.view_own", "/my-reservations"],
  ["My orders", "customer.account", "/my-orders"],
  ["Overview", "dashboard.view", "/dashboard"],
  ["Reservations", "reservations.manage", "/reservations"],
  ["Floor plan", "floorplan.manage", "/admin/floor-plan"],
  ["Orders", "orders.manage", "/orders"],
  ["Menu management", "menu.manage", "/admin/menu"],
  ["Kitchen queue", "kitchen.orders.view", "/kitchen"],
  ["Service tables", "service.tables.view", "/service"],
  ["Deliveries", "deliveries.manage", "/admin/deliveries"],
  ["Dashboard", "deliveries.assigned", "/rider"],
  ["My deliveries", "deliveries.assigned", "/rider/deliveries"],
  ["Delivery offers", "deliveries.assigned", "/rider/offers"],
  ["Delivery history", "deliveries.assigned", "/rider/history"],
  ["Ratings & reviews", "deliveries.assigned", "/rider/reviews"],
  ["Payments & refunds", "payments.manage|payments.refund", "/payments"],
  ["Daily transactions", "reports.daily_transactions", "/cashier/summary"],
  ["Reports", "reports.operations", "/reports"],
  ["Team & access", "users.manage", "/admin/users"],
  ["Reservation settings", "settings.manage", "/admin/settings"],
  ["Payment settings", "settings.manage", "/admin/payment-settings"],
  ["Delivery settings", "settings.manage", "/admin/delivery"],
  ["Business settings", "settings.manage", "/admin/business-settings"],
  ["Audit log", "audit.view", "/admin/audit"],
  ["Settings", "*", "/settings"],
];

export function visibleNavigation(permissions = [], roles = []) {
  const granted = new Set(permissions);
  const isCustomer = roles.includes("customer");
  return navigationByPermission.filter(
    ([, permission]) =>
      (permission === "*" ||
        permission.split("|").some((value) => granted.has(value))) &&
      (permission !== "customer.account" || isCustomer) &&
      (permission !== "deliveries.assigned" || roles.includes("rider")),
  );
}

export function navigationGroup(path, roles = []) {
  if (path === "/settings") return "Your account";
  if (roles.includes("rider") && path.startsWith("/rider")) {
    return ["/rider/history", "/rider/reviews"].includes(path)
      ? "Records & feedback"
      : "Delivery work";
  }
  if (["/my-orders", "/my-reservations"].includes(path)) return "Your activity";
  if (["/menu", "/reserve", "/restaurant"].includes(path))
    return "Order & reserve";
  if (path === "/dashboard") return "Overview";
  if (["/payments", "/cashier/summary", "/reports"].includes(path))
    return "Finance & insights";
  if (["/admin/users", "/admin/audit"].includes(path)) return "Team & security";
  if (path.startsWith("/admin/") && path !== "/admin/deliveries")
    return "Restaurant setup";
  return "Live operations";
}

export function navigationContext(pathname, links = []) {
  const exact = links.find(([, , path]) => path === pathname);
  if (exact) return { title: exact[0], path: exact[2] };
  if (pathname === "/account")
    return { title: "Profile & security", path: "/account" };
  const detail = /^\/rider\/deliveries\/[^/]+\/?$/.test(pathname)
    ? ["Delivery record", "/rider/history"]
    : /^\/delivery\/[^/]+\/tracking\/?$/.test(pathname)
      ? ["Delivery tracking", "/my-orders"]
      : /^\/payments\/[^/]+\/receipt\/?$/.test(pathname)
        ? [
            "Payment receipt",
            links.some(([, , path]) => path === "/payments")
              ? "/payments"
              : "/my-orders",
          ]
        : null;
  if (detail) {
    const parent = links.find(([, , path]) => path === detail[1]);
    return {
      title: detail[0],
      path: parent?.[2],
      parent: parent ? { title: parent[0], path: parent[2] } : null,
    };
  }
  if (/^\/riders\/[^/]+\/?$/.test(pathname)) return { title: "Rider profile" };
  if (pathname === "/payment-return") return { title: "Payment result" };
  return { title: "Your workspace" };
}
