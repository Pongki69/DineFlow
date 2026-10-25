// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
