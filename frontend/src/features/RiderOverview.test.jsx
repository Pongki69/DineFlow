// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RiderOverview } from "./RiderWorkspace";
import { api } from "../api";
import { useRiderPresence } from "../components/riderPresence";

vi.mock("../api", () => ({ api: vi.fn() }));
vi.mock("../components/riderPresence", () => ({ useRiderPresence: vi.fn() }));
vi.mock("../components/CountUp", () => ({
  CountUp: ({ value }) => <span>{value}</span>,
}));

const user = { name: "Alex Rider" };
let summary;
let history;

beforeEach(() => {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  useRiderPresence.mockReturnValue({ state: "offline", locatedAt: null });
  summary = {
    active_count: 1,
    completed_today: 0,
    delivered_total: 0,
    rating_count: 0,
    rating_average: null,
    // Match RiderWorkOrder::nextSummary: no pickup or recipient fields.
    next_delivery: {
      id: 41,
      status: "assigned",
      order: {
        order_number: "DF-41",
        destination: { address: "Guest destination" },
      },
    },
  };
  history = [];
  api.mockImplementation(async (path) => {
    if (path === "/rider/summary") return { data: summary };
    if (path === "/restaurant/location") {
      return {
        data: {
          address: "Configured restaurant pickup",
          phone: "+63 912 345 6789",
        },
      };
    }
    if (
      path === "/rider/assignments?scope=history&status=delivered&per_page=10"
    ) {
      return { data: history };
    }
    throw new Error("Unexpected request: " + path);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const mount = () =>
  render(<RiderOverview user={user} />, { wrapper: MemoryRouter });

it("uses the already loaded restaurant pickup for the lightweight next-assignment payload", async () => {
  mount();
  const next = await screen.findByRole("region", { name: "Next stop: Pickup" });
  expect(
    await within(next).findByText("Configured restaurant pickup"),
  ).toBeTruthy();
  expect(
    within(next)
      .getByRole("link", { name: "Review assignment" })
      .getAttribute("href"),
  ).toBe("/rider/deliveries?delivery=41");
  expect(
    within(next).queryByText("Restaurant location not recorded"),
  ).toBeNull();
  expect(new Set(api.mock.calls.map(([path]) => path))).toEqual(
    new Set([
      "/restaurant/location",
      "/rider/summary",
      "/rider/assignments?scope=history&status=delivered&per_page=10",
    ]),
  );
});

it("preserves an assignment pickup snapshot when the summary includes one", async () => {
  summary.next_delivery.order.pickup = { address: "Original order pickup" };
  mount();
  const next = await screen.findByRole("region", { name: "Next stop: Pickup" });
  expect(within(next).getByText("Original order pickup")).toBeTruthy();
  expect(within(next).queryByText("Configured restaurant pickup")).toBeNull();
});

it.each([
  ["disconnected", "No connection", "Review connection status"],
  ["unknown", "Status unavailable", "Review availability"],
])(
  "keeps %s availability distinct from an offline rider",
  async (state, label, action) => {
    useRiderPresence.mockReturnValue({ state, locatedAt: null });
    mount();
    const availability = await screen.findByRole("complementary", {
      name: "Availability & support",
    });
    expect(within(availability).getByText(label, { exact: true })).toBeTruthy();
    expect(
      within(availability)
        .getByRole("link", { name: action })
        .getAttribute("href"),
    ).toBe("/rider/offers");
    expect(
      within(availability).queryByText("Offline", { exact: true }),
    ).toBeNull();
    expect(
      within(availability).queryByRole("link", {
        name: "Go online",
        exact: true,
      }),
    ).toBeNull();
  },
);

it("keeps a completed history record out of the next assignment when no active work remains", async () => {
  summary.active_count = 0;
  summary.next_delivery = null;
  history = [
    {
      id: 12,
      status: "delivered",
      order: {
        order_number: "DF-12",
        destination: { address: "Completed drop-off" },
      },
      history: [{ to_status: "delivered", created_at: "2026-10-27T10:00:00Z" }],
    },
  ];
  mount();
  expect(await screen.findByText("No active delivery")).toBeTruthy();
  const historyLink = await screen.findByRole("link", { name: /DF-12/ });
  expect(historyLink.getAttribute("href")).toBe("/rider/deliveries/12");
  expect(screen.queryByRole("link", { name: "Review assignment" })).toBeNull();
  expect(screen.queryByRole("list", { name: "Delivery progress" })).toBeNull();
});
