// @vitest-environment jsdom
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RiderDeliveries } from "./DeliveryOperations";
import { api } from "./api";
const { ask } = vi.hoisted(() => ({ ask: vi.fn() }));
vi.mock("./api", () => ({ api: vi.fn() }));
vi.mock("./components/ConfirmProvider", () => ({ usePrompt: () => ask }));
beforeEach(() => {
  api.mockReset();
  ask.mockReset();
});
afterEach(() => cleanup());
const row = (id, status = "assigned") => ({
  id,
  status,
  history: [],
  order: {
    order_number: `DF-${id}`,
    status: "ready_to_serve",
    total: 100,
    items: [],
    pickup: { address: "Restaurant" },
    destination: { address: `Stop ${id}`, recipient_name: "Preview" },
  },
});
function mockApi(handle) {
  api.mockImplementation((path, options) => {
    if (path === "/restaurant/location") return Promise.resolve({ data: {} });
    if (path === "/rider/route-plan")
      return Promise.resolve({
        data: { stops: [], legs: [], missing_locations: [] },
      });
    return handle(path, options);
  });
}
const mount = () => render(<RiderDeliveries />, { wrapper: MemoryRouter });
const assignmentCalls = () =>
  api.mock.calls.filter(([path]) => path.startsWith("/rider/assignments"));
async function openAssignment(id) {
  const picker = await screen.findByRole("combobox", {
    name: "Jump to an active delivery",
  });
  fireEvent.change(picker, { target: { value: String(id) } });
  fireEvent.click(
    screen.getByRole("button", {
      name: "Selected delivery",
      exact: true,
    }),
  );
  expect(picker.value).toBe(String(id));
}
async function openMoreActions(id) {
  await openAssignment(id);
  const summary = screen.getByText("More actions and details");
  fireEvent.click(summary);
  expect(summary.closest("details").open).toBe(true);
}
it("deduplicates manual refresh while keeping the refresh state recoverable", async () => {
  let finish;
  let calls = 0;
  mockApi(() =>
    ++calls === 1
      ? Promise.resolve({ data: [] })
      : new Promise((resolve) => {
          finish = resolve;
        }),
  );
  mount();
  await screen.findByText("Ready for your next delivery");
  fireEvent.click(screen.getByRole("button", { name: "Refresh assignments" }));
  expect(
    screen.getByRole("button", { name: "Refreshing assignments…" }).disabled,
  ).toBe(true);
  expect(screen.queryByText("Ready for your next delivery")).toBeNull();
  await waitFor(() => expect(assignmentCalls()).toHaveLength(2));
  act(() => window.dispatchEvent(new Event("rider-deliveries-updated")));
  expect(assignmentCalls()).toHaveLength(2);
  await act(async () => finish({ data: [] }));
  expect(screen.getByText("Ready for your next delivery")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Refresh assignments" }).disabled,
  ).toBe(false);
});
it("keeps loaded work on refresh failure and permits a retry", async () => {
  let fails = false;
  mockApi(() =>
    fails
      ? Promise.reject(new Error("Unable to refresh assignments"))
      : Promise.resolve({ data: [row(9)] }),
  );
  mount();
  await screen.findByText("Order DF-9");
  fails = true;
  fireEvent.click(screen.getByRole("button", { name: "Refresh assignments" }));
  await screen.findByText("Unable to refresh assignments");
  expect(screen.getByText("Order DF-9")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Refresh assignments" }).disabled,
  ).toBe(false);
});
it("locks route edits during saving and preserves the saved drop-off order", async () => {
  const deliveries = [3, 1, 2].map((id) => row(id));
  let saved = [3, 1, 2],
    finish;
  mockApi((path, options) => {
    if (path === "/rider/route-order")
      return new Promise((resolve) => {
        finish = () => {
          saved = JSON.parse(options.body).delivery_ids;
          resolve({ delivery_order: saved });
        };
      });
    return Promise.resolve({ data: deliveries, delivery_order: saved });
  });
  mount();
  const picker = await screen.findByRole("combobox", {
    name: "Jump to an active delivery",
  });
  const switchOrder = () =>
    within(picker)
      .getAllByRole("option")
      .filter((option) => option.value)
      .map((option) => option.textContent.match(/DF-\d+/)[0]);
  expect(switchOrder()).toEqual(["DF-3", "DF-1", "DF-2"]);
  fireEvent.click(
    screen.getByRole("button", { name: "Route order", exact: true }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Move DF-1 earlier" }));
  expect(switchOrder()).toEqual(["DF-1", "DF-3", "DF-2"]);
  fireEvent.click(screen.getByRole("button", { name: "Apply route order" }));
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  expect(screen.getByRole("button", { name: "Suggest order" }).disabled).toBe(
    true,
  );
  expect(
    screen.getByRole("button", { name: "Move DF-3 earlier" }).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Move DF-3 earlier" }));
  expect(switchOrder()).toEqual(["DF-1", "DF-3", "DF-2"]);
  await act(async () => finish());
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Suggest order" }).disabled).toBe(
      false,
    ),
  );
  expect(saved).toEqual([1, 3, 2]);
  expect(switchOrder()).toEqual(["DF-1", "DF-3", "DF-2"]);
});
it("prevents repeated status submissions while an assignment is being updated", async () => {
  let finish,
    status = "accepted";
  mockApi((path) =>
    path.endsWith("/status")
      ? new Promise((resolve) => {
          finish = () => {
            status = "arrived_at_restaurant";
            resolve({ data: {} });
          };
        })
      : Promise.resolve({ data: [row(9, status)], delivery_order: [9] }),
  );
  mount();
  await openAssignment(9);
  const action = await screen.findByRole("button", {
    name: "Arrived at restaurant",
  });
  fireEvent.click(action);
  fireEvent.click(action);
  expect(
    api.mock.calls.filter(([path]) => path.endsWith("/status")),
  ).toHaveLength(1);
  const [path, options] = api.mock.calls.find(([endpoint]) =>
    endpoint.endsWith("/status"),
  );
  expect(path).toBe("/rider/deliveries/9/status");
  expect(options.method).toBe("PATCH");
  expect(JSON.parse(options.body)).toEqual({ status: "arrived_at_restaurant" });
  expect(action.disabled).toBe(true);
  await act(async () => finish());
  await screen.findByRole("button", { name: "Pick up order" });
});
it("cancels unsuccessful-delivery reporting without changing status", async () => {
  ask.mockResolvedValue(null);
  mockApi(() => Promise.resolve({ data: [row(9, "accepted")] }));
  mount();
  await openMoreActions(9);
  fireEvent.click(
    await screen.findByRole("button", { name: "Mark delivery unsuccessful" }),
  );
  await waitFor(() => expect(ask).toHaveBeenCalled());
  expect(ask.mock.calls[0][2]).toMatchObject({
    confirmLabel: "Mark unsuccessful",
    destructive: true,
    required: true,
    minLength: 3,
  });
  expect(
    api.mock.calls.filter(([path]) => path.endsWith("/status")),
  ).toHaveLength(0);
});
it("submits failure only after the rider supplies a valid explicit reason", async () => {
  let confirmReason;
  ask.mockImplementation(
    () =>
      new Promise((resolve) => {
        confirmReason = resolve;
      }),
  );
  mockApi((path) =>
    Promise.resolve(
      path.endsWith("/status") ? { data: {} } : { data: [row(9, "accepted")] },
    ),
  );
  mount();
  await openMoreActions(9);
  fireEvent.click(
    await screen.findByRole("button", { name: "Mark delivery unsuccessful" }),
  );
  expect(api.mock.calls.some(([path]) => path.endsWith("/status"))).toBe(false);
  await act(async () =>
    confirmReason("  Recipient cannot receive the order  "),
  );
  await waitFor(() =>
    expect(api.mock.calls.some(([path]) => path.endsWith("/status"))).toBe(
      true,
    ),
  );
  const [, options] = api.mock.calls.find(([path]) => path.endsWith("/status"));
  expect(JSON.parse(options.body)).toEqual({
    status: "failed",
    reason: "Recipient cannot receive the order",
  });
});
