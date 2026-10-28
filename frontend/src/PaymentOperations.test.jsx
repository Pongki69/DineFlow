// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { ConfirmProvider } from "./components/ConfirmProvider";
import { PaymentDashboard } from "./PaymentOperations";
import { api } from "./api";

vi.mock("./api", () => ({ api: vi.fn() }));
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value() {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value() {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    },
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  document.body.style.overflow = "";
  document.documentElement.style.overflow = "";
});

const paid = {
  id: 88,
  reference_number: "PAY-88",
  purpose: "order",
  method: "cash",
  status: "paid",
  amount: "80.00",
  currency: "PHP",
  order: { order_number: "DF-PAID", customer_name_snapshot: "Jamie" },
};
const sessionBill = {
  id: 11,
  table_number: "T-02",
  balance_due: "300.00",
  payment_pending: false,
  orders: [{ order_number: "DF-DINING", status: "served", total: "300.00" }],
};
const collection = {
  orders: [
    {
      id: 21,
      order_number: "DF-DINING",
      customer_name: "Dine in guest",
      order_type: "dine_in",
      status: "served",
      balance_due: "300.00",
    },
    {
      id: 22,
      order_number: "DF-PICKUP",
      customer_name: "Pickup guest",
      order_type: "pickup",
      status: "ready_to_serve",
      balance_due: "100.00",
    },
  ],
  reservation_deposits: [
    {
      id: 31,
      reference: "RES-31",
      guest_name: "Reservation guest",
      starts_at: "2026-10-28T10:00:00Z",
      deposit_amount: 50,
    },
  ],
};
function fixture(path) {
  if (path.startsWith("/payments?"))
    return { data: { data: [paid], current_page: 1, last_page: 1, total: 1 } };
  if (path === "/dining-sessions/open-bills") return { data: [sessionBill] };
  if (path === "/cashier/payment-queue") return { data: collection };
  throw new Error("Unexpected endpoint: " + path);
}
function show(permissions = ["payments.manage"]) {
  return render(
    <MemoryRouter>
      <ConfirmProvider>
        <PaymentDashboard user={{ permissions }} />
      </ConfirmProvider>
    </MemoryRouter>,
  );
}

it("counts a consolidated dining bill once when its orders also appear in the cashier queue", async () => {
  api.mockImplementation(async (path) => fixture(path));
  show();
  await screen.findByRole("heading", { name: "Table T-02" });
  expect(
    within(screen.getByText("Open balances").closest("article")).getByText("3"),
  ).toBeInTheDocument();
  expect(
    within(screen.getByText("Balance to collect").closest("article")).getByText(
      "₱450.00",
    ),
  ).toBeInTheDocument();
  expect(
    screen.getAllByRole("button", { name: "Review payment" }),
  ).toHaveLength(3);
  fireEvent.click(screen.getByRole("button", { name: "Orders", exact: true }));
  const queue = screen.getByRole("region", { name: "Ready to settle" });
  expect(within(queue).getByText("DF-PICKUP")).toBeInTheDocument();
  expect(within(queue).queryByText("DF-DINING")).not.toBeInTheDocument();
});

it("records cash once through the session endpoint and restores scrolling after the review closes", async () => {
  let finish;
  api.mockImplementation((path) =>
    path.endsWith("/payments/cash")
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : Promise.resolve(fixture(path)),
  );
  document.body.style.overflow = "clip";
  document.documentElement.style.overflow = "auto";
  show();
  const review = (
    await screen.findAllByRole("button", { name: "Review payment" })
  )[0];
  fireEvent.click(review);
  const sheet = screen.getByRole("dialog", { name: "Table T-02" });
  expect(sheet).toHaveAccessibleDescription(/Confirm the balance/);
  expect(document.body.style.overflow).toBe("hidden");
  expect(document.documentElement.style.overflow).toBe("hidden");
  const cash = within(sheet).getByRole("button", {
    name: "Record cash",
    exact: true,
  });
  fireEvent.click(cash);
  fireEvent.click(cash);
  expect(
    api.mock.calls.filter(([path]) => path.endsWith("/payments/cash")),
  ).toEqual([["/dining-sessions/11/payments/cash", { method: "POST" }]]);
  expect(
    within(sheet).getByRole("button", { name: "Pay online" }),
  ).toBeDisabled();
  expect(
    within(sheet).getByRole("button", { name: "Close payment review" }),
  ).toBeDisabled();
  await act(async () => finish({ data: { id: 90, status: "paid" } }));
  await screen.findByText("Cash payment recorded for Table T-02.");
  await waitFor(() => expect(document.body.style.overflow).toBe("clip"));
  expect(document.documentElement.style.overflow).toBe("auto");
  expect(
    screen.queryByRole("dialog", { name: "Table T-02" }),
  ).not.toBeInTheDocument();
});

it("keeps cashier cash collection and manager refund permissions separate", async () => {
  api.mockImplementation(async (path) => fixture(path));
  const cashier = show();
  await screen.findByText("PAY-88");
  expect(
    screen.queryByRole("button", { name: "Full refund" }),
  ).not.toBeInTheDocument();
  cashier.unmount();
  show(["payments.refund"]);
  await screen.findByText("PAY-88");
  expect(
    screen.getByRole("button", { name: "Full refund" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", {
      name: /Review payment|Record cash|Pay online/,
    }),
  ).not.toBeInTheDocument();
});

it("does not request or expose payment records for an account without a payment permission", async () => {
  show(["orders.manage"]);
  await screen.findByText(/does not have permission/);
  expect(api).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("button", {
      name: /Review payment|Record cash|Pay online|Full refund/,
    }),
  ).not.toBeInTheDocument();
});

it("keeps initially unavailable collection metrics unknown instead of reporting zero", async () => {
  api.mockRejectedValue(new Error("Payment service is unavailable."));
  const { container } = show();
  await screen.findByText("Payment service is unavailable.");
  expect(
    [...container.querySelectorAll(".sage-stat-grid article > strong")].map(
      (node) => node.textContent,
    ),
  ).toEqual(["—", "—", "—"]);
  expect(
    screen.queryByText(/Last loaded results remain available/),
  ).not.toBeInTheDocument();
  expect(screen.queryByText("All settled for now")).not.toBeInTheDocument();
});

it("requires verification after an uncertain cash result instead of allowing an immediate replay", async () => {
  api.mockImplementation(async (path) => {
    if (path.endsWith("/payments/cash"))
      throw Object.assign(
        new Error("The request timed out. Check its status."),
        { uncertain: true },
      );
    return fixture(path);
  });
  show();
  fireEvent.click(
    (await screen.findAllByRole("button", { name: "Review payment" }))[0],
  );
  const sheet = screen.getByRole("dialog", { name: "Table T-02" });
  fireEvent.click(
    within(sheet).getByRole("button", { name: "Record cash", exact: true }),
  );
  await within(sheet).findByText(/The result needs verification/);
  const cash = within(sheet).getByRole("button", {
    name: "Record cash",
    exact: true,
  });
  expect(cash).toBeDisabled();
  expect(
    within(sheet).getByRole("button", { name: "Pay online" }),
  ).toBeDisabled();
  fireEvent.click(cash);
  expect(
    api.mock.calls.filter(([path]) => path.endsWith("/payments/cash")),
  ).toHaveLength(1);
  expect(
    api.mock.calls.filter(([path]) => path === "/dining-sessions/open-bills")
      .length,
  ).toBeGreaterThan(1);
});

it("keeps the review description available if a refreshed balance disappears", async () => {
  let removed = false;
  api.mockImplementation(async (path) => {
    if (path.endsWith("/payments/cash")) {
      removed = true;
      throw Object.assign(new Error("Verification required."), {
        uncertain: true,
      });
    }
    if (removed && path === "/dining-sessions/open-bills") return { data: [] };
    if (removed && path === "/cashier/payment-queue")
      return { data: { orders: [], reservation_deposits: [] } };
    return fixture(path);
  });
  const mounted = show();
  fireEvent.click(
    (await screen.findAllByRole("button", { name: "Review payment" }))[0],
  );
  const sheet = screen.getByRole("dialog", { name: "Table T-02" });
  fireEvent.click(
    within(sheet).getByRole("button", { name: "Record cash", exact: true }),
  );
  await within(sheet).findByText(/This balance is no longer/);
  expect(sheet).toHaveAccessibleDescription(/Confirm the balance/);
  mounted.unmount();
  expect(document.body.style.overflow).toBe("");
});
