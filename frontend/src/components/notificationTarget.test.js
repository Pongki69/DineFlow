import { describe, expect, it } from "vitest";
import { notificationTarget } from "./notificationTarget";

const customer = {
  roles: ["customer"],
  permissions: ["customer.account", "reservations.view_own"],
};
const rider = { roles: ["rider"], permissions: ["deliveries.assigned"] };
const manager = {
  roles: ["manager"],
  permissions: ["deliveries.manage", "orders.manage", "reservations.manage"],
};
const kitchen = { roles: ["kitchen_staff"], permissions: [] };
const alert = (event, context) => ({ data: { event, context } });

describe("notificationTarget", () => {
  it("sends customers to the record the alert is about", () => {
    expect(
      notificationTarget(alert("delivery.accepted", { delivery_id: 4 }), customer),
    ).toBe("/delivery/4/tracking");
    expect(
      notificationTarget({ data: { delivery_id: 9, status: "in_transit" } }, customer),
    ).toBe("/delivery/9/tracking");
    expect(
      notificationTarget(alert("order.status_changed", { order_id: 2 }), customer),
    ).toBe("/my-orders?order=2");
    expect(
      notificationTarget(alert("reservation.created", { reservation_id: 1 }), customer),
    ).toBe("/my-reservations");
    expect(
      notificationTarget(alert("payment.paid", { payment_id: 7, order_id: 2 }), customer),
    ).toBe("/payments/7/receipt");
  });

  it("sends riders to offers or the delivery", () => {
    expect(
      notificationTarget(alert("delivery.offer", { offer_id: 3 }), rider),
    ).toBe("/rider/offers");
    expect(
      notificationTarget(alert("delivery.assigned", { delivery_id: 5 }), rider),
    ).toBe("/rider/deliveries/5");
  });

  it("sends staff only to pages they can open", () => {
    expect(
      notificationTarget(alert("delivery.dispatch_exhausted", { delivery_id: 5 }), manager),
    ).toBe("/admin/deliveries");
    expect(
      notificationTarget(alert("order.placed", { order_id: 2 }), kitchen),
    ).toBeNull();
    expect(notificationTarget(alert("system", {}), manager)).toBeNull();
  });
});
