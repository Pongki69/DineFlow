// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { OrdersView } from "./Orders";
import { api } from "../api";

vi.mock("../api", () => ({ api: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it.each([
  ["completed", 100, false],
  ["cancelled", 100, false],
  ["preparing", 100, true],
  ["preparing", 0, false],
])(
  "shows online payment only for active orders with a balance: %s / %s",
  async (status, balance, payable) => {
    api.mockResolvedValue({
      data: [
        {
          id: 1,
          order_number: "DF-PAYMENT",
          order_type: "delivery",
          status,
          items: [],
          total: 100,
          payment_summary: { paid: 100 - balance, balance_due: balance },
        },
      ],
    });
    render(
      <MemoryRouter>
        <OrdersView />
      </MemoryRouter>,
    );
    await screen.findByText("DF-PAYMENT");
    expect(Boolean(screen.queryByRole("button", { name: /Pay online/ }))).toBe(
      payable,
    );
  },
);

const staffOrder = {
  id: 9,
  order_number: "DF-STAFF",
  order_type: "delivery",
  status: "pending",
  customer_name_snapshot: "Jamie Cruz",
  total: "610.00",
  items: [],
  payment_summary: { paid: "0.00", balance_due: "610.00" },
};

it("locks the entire order workbench while recording cash to prevent duplicate submissions", async () => {
  let finish;
  api.mockImplementation((path) =>
    path.endsWith("/payments/cash")
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : Promise.resolve({ data: [staffOrder] }),
  );
  render(
    <MemoryRouter>
      <OrdersView staff user={{ permissions: ["payments.manage"] }} />
    </MemoryRouter>,
  );
  const cash = await screen.findByRole("button", {
    name: "Record cash · ₱610.00",
  });
  fireEvent.click(cash);
  fireEvent.click(cash);
  expect(
    api.mock.calls.filter(([path]) => path.endsWith("/payments/cash")),
  ).toHaveLength(1);
  expect(
    screen.getByRole("spinbutton", { name: "Prep time for DF-STAFF" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("combobox", { name: "Vehicle needed for DF-STAFF" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Confirm order", exact: true }),
  ).toBeDisabled();
  await act(async () => finish({ data: {} }));
  await screen.findByText("Cash payment recorded.");
  await waitFor(() => expect(cash).toBeEnabled());
});

it("rejects invalid preparation times and sends valid preparation choices with a status update", async () => {
  api.mockResolvedValue({ data: [staffOrder] });
  render(
    <MemoryRouter>
      <OrdersView staff />
    </MemoryRouter>,
  );
  const minutes = await screen.findByRole("spinbutton", {
    name: "Prep time for DF-STAFF",
  });
  fireEvent.change(minutes, { target: { value: "0" } });
  fireEvent.click(
    screen.getByRole("button", { name: "Confirm order", exact: true }),
  );
  await screen.findByText(/Enter a kitchen prep time from 1 to 180 minutes/);
  expect(
    api.mock.calls.filter(([path]) => path.endsWith("/status")),
  ).toHaveLength(0);
  fireEvent.change(minutes, { target: { value: "20" } });
  fireEvent.change(
    screen.getByRole("combobox", { name: "Vehicle needed for DF-STAFF" }),
    { target: { value: "car" } },
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Confirm order", exact: true }),
  );
  await screen.findByText("Order updated.");
  const [, options] = api.mock.calls.find(([path]) => path.endsWith("/status"));
  expect(JSON.parse(options.body)).toEqual({
    status: "confirmed",
    prep_minutes: 20,
    delivery_vehicle_class: "car",
  });
});
