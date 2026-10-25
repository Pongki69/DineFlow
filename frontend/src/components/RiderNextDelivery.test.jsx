// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RiderNextDelivery } from "./RiderNextDelivery";
afterEach(cleanup);
function show(status) {
  return render(
    <MemoryRouter>
      <RiderNextDelivery
        activeCount={1}
        delivery={{
          id: 123,
          status,
          order: {
            order_number: "DF-123",
            pickup: { address: "Restaurant address" },
            destination: {
              address: "Customer address",
              recipient_name: "Guest",
            },
          },
        }}
      />
    </MemoryRouter>,
  );
}
it("prioritizes the customer after pickup and points to the active delivery workspace", () => {
  const { container } = show("in_transit");
  expect(container.querySelector(".rider-next-stop").textContent).toContain(
    "Customer address",
  );
  expect(
    screen
      .getByRole("link", { name: "Continue drop-off" })
      .getAttribute("href"),
  ).toBe("/rider/deliveries?delivery=123");
  expect(
    container.querySelector('[aria-current="step"]').textContent,
  ).toContain("On the way");
});
it("prioritizes pickup and assignment review before acceptance", () => {
  const { container } = show("assigned");
  expect(container.querySelector(".rider-next-stop").textContent).toContain(
    "Restaurant address",
  );
  expect(screen.getByRole("link", { name: "Review assignment" })).toBeTruthy();
  expect(
    container.querySelector('[aria-current="step"]').textContent,
  ).toContain("Pickup");
});
it("provides an honest empty state with a path to offers", () => {
  render(
    <MemoryRouter>
      <RiderNextDelivery activeCount={0} delivery={null} />
    </MemoryRouter>,
  );
  expect(screen.getByText("No active delivery")).toBeTruthy();
  expect(
    screen.getByRole("link", { name: /Browse offers/ }).getAttribute("href"),
  ).toBe("/rider/offers");
  expect(screen.queryByRole("list", { name: "Delivery progress" })).toBeNull();
});
