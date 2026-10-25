// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import {
  CustomerOrderProgress,
  trackingTimeline,
} from "./CustomerOrderProgress";

afterEach(cleanup);
it("shows a rider waiting at the restaurant while the kitchen is still preparing", () => {
  render(
    <CustomerOrderProgress
      data={{
        order_status: "preparing",
        status: "arrived_at_restaurant",
        rider: { name: "Rider" },
        history: [],
        order_history: [],
      }}
    />,
  );
  expect(
    within(screen.getByRole("region", { name: "Your food" })).getByRole(
      "status",
    ),
  ).toHaveTextContent("Kitchen is preparing your food");
  expect(
    within(screen.getByRole("region", { name: "Your rider" })).getByRole(
      "status",
    ),
  ).toHaveTextContent("Rider arrived at the restaurant");
  expect(screen.getByText(/while the kitchen finishes/)).toBeInTheDocument();
  expect(screen.getByText("Ready for rider pickup").closest("li")).toHaveClass(
    "upcoming",
  );
});
it("shows food ready without claiming the rider has picked it up", () => {
  render(
    <CustomerOrderProgress
      data={{
        order_status: "ready_to_serve",
        status: "arrived_at_restaurant",
        history: [],
        order_history: [],
      }}
    />,
  );
  expect(screen.getByText("Food ready for rider pickup")).toBeInTheDocument();
  expect(screen.getByText("Food picked up").closest("li")).toHaveClass(
    "upcoming",
  );
});
it("merges kitchen and delivery events in stable chronological order", () => {
  const timeline = trackingTimeline({
    order_history: [
      { id: 2, status: "preparing", at: "2026-10-23T06:01:00Z" },
      { id: 1, status: "confirmed", at: "2026-10-23T06:01:00Z" },
    ],
    history: [
      { id: 1, status: "arrived_at_restaurant", at: "2026-10-23T06:02:00Z" },
    ],
  });
  expect(timeline.map((event) => event.status)).toEqual([
    "confirmed",
    "preparing",
    "arrived_at_restaurant",
  ]);
});
it("does not complete future milestones when a delivery fails", () => {
  render(
    <CustomerOrderProgress
      data={{
        order_status: "preparing",
        status: "failed",
        failure_reason: "Vehicle problem",
        history: [{ status: "accepted", at: "2026-10-23T06:01:00Z" }],
        order_history: [],
      }}
    />,
  );
  expect(screen.getByText("Delivered").closest("li")).toHaveClass("upcoming");
  expect(screen.getByText("Vehicle problem")).toBeInTheDocument();
});
