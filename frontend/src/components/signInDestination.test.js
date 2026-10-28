import { expect, it } from "vitest";
import { signInDestination } from "./signInDestination";
const origin = "http://127.0.0.1:5191";
const customer = {
  roles: ["customer"],
  permissions: ["customer.account", "reservations.create"],
};
it.each([
  "https://example.com/steal",
  "//example.com/steal",
  "javascript:alert(1)",
  "/admin/users",
  "/admin/system-settings",
])("rejects an external or unauthorized return path: %s", (path) => {
  expect(signInDestination(customer, path, origin)).toBe("/");
});
it("preserves permitted booking and payment-return context", () => {
  expect(signInDestination(customer, "/reserve", origin)).toBe("/reserve");
  expect(
    signInDestination(
      customer,
      "/payment-return?payment_id=42&result=success",
      origin,
    ),
  ).toBe("/payment-return?payment_id=42&result=success");
});
it("keeps rider detail navigation scoped to the rider role and permission", () => {
  expect(signInDestination(customer, "/rider/deliveries/42", origin)).toBe("/");
  expect(
    signInDestination(
      { roles: ["rider"], permissions: ["deliveries.assigned"] },
      "/rider/deliveries/42",
      origin,
    ),
  ).toBe("/rider/deliveries/42");
});
