import { expect, it } from "vitest";
import { visibleNavigation } from "../navigation";
import { mobileWorkspaceNavigation } from "./mobileWorkspaceNavigation";

it.each([
  [
    "administrator",
    ["deliveries.manage", "orders.manage", "settings.manage", "users.manage"],
    ["Home", "Orders", "Live"],
  ],
  [
    "manager",
    ["deliveries.manage", "orders.manage"],
    ["Home", "Orders", "Live"],
  ],
  [
    "cashier",
    ["payments.manage", "reports.daily_transactions", "dashboard.view"],
    // The overview lives under More; the counter desk and today come first.
    ["Collect", "Today"],
  ],
  ["kitchen_staff", ["kitchen.orders.view"], ["Kitchen"]],
  [
    "waiter",
    ["service.tables.view", "reservations.manage", "orders.manage"],
    ["Tables", "Bookings", "Orders"],
  ],
  [
    "customer",
    ["customer.account", "reservations.create", "reservations.view_own"],
    ["Menu", "Orders", "Bookings"],
  ],
])("shows only permitted mobile tasks for %s", (role, permissions, labels) => {
  const user = { roles: [role], permissions };
  const result = mobileWorkspaceNavigation(user);
  expect(result.items.map(([label]) => label)).toEqual(labels);
  const allowed = visibleNavigation(permissions, [role]).map(
    ([, , path]) => path,
  );
  expect(result.menu.every(([, , path]) => allowed.includes(path))).toBe(true);
  expect(result.items.every(([, path]) => allowed.includes(path))).toBe(true);
});
it("never adds a primary task when its permission was removed", () => {
  const result = mobileWorkspaceNavigation({
    roles: ["administrator"],
    permissions: [],
  });
  expect(result.items).toEqual([]);
  expect(result.menu.map(([, , path]) => path)).toEqual([
    "/activity",
    "/settings",
  ]);
});
