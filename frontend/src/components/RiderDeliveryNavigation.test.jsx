// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { RiderDeliveryNavigation } from "./RiderDeliveryDetails";

afterEach(cleanup);

it("switches navigation from the store to the customer only after pickup", () => {
  const order = {
    pickup: { latitude: 14.19, longitude: 121.28 },
    destination: { latitude: 14.21, longitude: 121.29 },
  };
  const { rerender } = render(
    <RiderDeliveryNavigation order={order} status="accepted" />,
  );
  expect(
    screen
      .getByRole("link", { name: "Navigate to pickup" })
      .getAttribute("href"),
  ).toContain("destination=14.19,121.28");
  rerender(
    <RiderDeliveryNavigation order={order} status="arrived_at_restaurant" />,
  );
  expect(screen.getByRole("link", { name: "Navigate to pickup" })).toBeTruthy();
  for (const status of ["picked_up", "in_transit"]) {
    rerender(<RiderDeliveryNavigation order={order} status={status} />);
    expect(
      screen
        .getByRole("link", { name: "Navigate to customer" })
        .getAttribute("href"),
    ).toContain("destination=14.21,121.29");
  }
});
