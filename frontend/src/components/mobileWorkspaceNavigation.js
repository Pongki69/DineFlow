import { visibleNavigation } from "../navigation";

export function mobileWorkspaceNavigation(user) {
  const links = visibleNavigation(user.permissions, user.roles);
  const granted = new Set(links.map(([, , path]) => path));
  const hasRole = (role) => user.roles.includes(role);
  const preferred =
    hasRole("administrator") || hasRole("manager")
      ? [
          ["Home", "/admin/dashboard"],
          ["Orders", "/admin/orders"],
          ["Live", "/admin/tracking"],
        ]
      : hasRole("customer")
        ? [
            ["Menu", "/menu"],
            ["Orders", "/my-orders"],
            ["Bookings", "/my-reservations"],
          ]
        : hasRole("cashier")
          ? [
              ["Collect", "/payments"],
              ["Today", "/cashier/summary"],
            ]
          : hasRole("kitchen_staff")
            ? [["Kitchen", "/kitchen"]]
            : hasRole("waiter")
              ? [
                  ["Tables", "/service"],
                  ["Bookings", "/reservations"],
                  ["Orders", "/orders"],
                ]
              : links.slice(0, 3).map(([label, , path]) => [label, path]);
  const items = preferred.filter(([, path]) => granted.has(path));
  const menu = links.filter(
    ([, , path]) =>
      !(path === "/orders" && granted.has("/admin/orders")) &&
      !(path === "/dashboard" && granted.has("/admin/dashboard")),
  );
  return { items, menu };
}

export function mobileWorkspaceTitle(pathname, fallback) {
  return (
    {
      "/menu": "Menu",
      "/my-orders": "My orders",
      "/reserve": "Book a table",
      "/my-reservations": "My bookings",
      "/admin/dashboard": "Home",
      "/dashboard": "Overview",
      "/admin/orders": "Orders",
      "/orders": "Orders",
      "/admin/tracking": "Live",
      "/admin/system-settings": "System settings",
      "/admin/business-settings": "Business settings",
      "/payments": "Payments",
      "/cashier/summary": "Today",
      "/kitchen": "Kitchen",
      "/service": "Tables",
      "/reservations": "Bookings",
      "/settings": "Preferences",
      "/account": "My account",
    }[pathname] || fallback
  );
}
