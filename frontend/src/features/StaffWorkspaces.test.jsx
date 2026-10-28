// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { OrdersView } from "./Orders";
import { TableOccupancy } from "../Reservations";
import { ConfirmProvider } from "../components/ConfirmProvider";
import { api } from "../api";

vi.mock("../api", () => ({ api: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const ticket = {
  id: 42,
  order_number: "DF-KITCHEN",
  order_type: "delivery",
  status: "confirmed",
  created_at: new Date(Date.now() - 12 * 60000).toISOString(),
  total: 610,
  items: [
    {
      id: 1,
      item_name_snapshot: "Noodle bowl",
      quantity: 2,
      variant_name_snapshot: "Large",
      addons: [{ addon_name_snapshot: "Extra tofu" }],
      special_instructions: "No onions",
    },
  ],
};

it("keeps KDS preparation details and actions connected without exposing financial totals", async () => {
  let state = "confirmed";
  api.mockImplementation(async (_path, options) => {
    if (options?.method === "PATCH") state = "preparing";
    return { data: [{ ...ticket, status: state }] };
  });
  render(
    <MemoryRouter>
      <OrdersView
        kitchen
        staff
        user={{ permissions: ["kitchen.orders.view", "kitchen.orders.update"] }}
      />
    </MemoryRouter>,
  );
  await screen.findByRole("heading", { name: "DF-KITCHEN" });
  expect(screen.getByText("No onions", { exact: false })).toBeInTheDocument();
  expect(screen.getByText("Extra tofu", { exact: false })).toBeInTheDocument();
  expect(screen.queryByText(/₱610/)).not.toBeInTheDocument();
  fireEvent.change(
    screen.getByRole("spinbutton", { name: "Prep time for DF-KITCHEN" }),
    { target: { value: "24" } },
  );
  fireEvent.change(
    screen.getByRole("combobox", { name: "Vehicle needed for DF-KITCHEN" }),
    { target: { value: "car" } },
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Start preparing", exact: true }),
  );
  await screen.findByRole("button", { name: "Mark ready", exact: true });
  const mutation = api.mock.calls.find(
    ([, options]) => options?.method === "PATCH",
  );
  expect(mutation[0]).toBe("/orders/42/status");
  expect(JSON.parse(mutation[1].body)).toEqual({
    status: "preparing",
    prep_minutes: 24,
    delivery_vehicle_class: "car",
  });
});

it("does not present failed initial kitchen reads as zero tickets", async () => {
  api.mockRejectedValue(new Error("Kitchen connection unavailable"));
  const { container } = render(
    <MemoryRouter>
      <OrdersView
        kitchen
        staff
        user={{ permissions: ["kitchen.orders.view"] }}
      />
    </MemoryRouter>,
  );
  await screen.findByRole("alert");
  expect(
    [...container.querySelectorAll(".sage-stat-grid strong")].map(
      (node) => node.textContent,
    ),
  ).toEqual(["—", "—", "—"]);
});

it("keeps preparation mutation controls out of a view-only kitchen account", async () => {
  api.mockResolvedValue({ data: [ticket] });
  render(
    <MemoryRouter>
      <OrdersView
        kitchen
        staff
        user={{ permissions: ["kitchen.orders.view"] }}
      />
    </MemoryRouter>,
  );
  await screen.findByRole("heading", { name: "DF-KITCHEN" });
  expect(
    screen.queryByRole("button", { name: "Start preparing", exact: true }),
  ).not.toBeInTheDocument();
  expect(
    api.mock.calls.some(([, options]) => options?.method === "PATCH"),
  ).toBe(false);
});

it("keeps failed initial dining-room reads distinct from an empty room", async () => {
  api.mockRejectedValue(new Error("Table connection unavailable"));
  const { container } = render(
    <MemoryRouter>
      <ConfirmProvider>
        <TableOccupancy />
      </ConfirmProvider>
    </MemoryRouter>,
  );
  await screen.findByRole("alert");
  await waitFor(() =>
    expect(
      [...container.querySelectorAll(".sage-stat-grid strong")].map(
        (node) => node.textContent,
      ),
    ).toEqual(["—", "—", "—", "—"]),
  );
  expect(
    screen.getByText("Table status unavailable. Refresh to reconnect."),
  ).toBeInTheDocument();
});
