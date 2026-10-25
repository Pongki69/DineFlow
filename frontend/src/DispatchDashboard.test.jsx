// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
  waitFor,
} from "@testing-library/react";
import { DispatchDashboard } from "./DeliveryOperations";
import { api } from "./api";
import { dispatchQueue } from "./components/dispatchQueues";
const { ask } = vi.hoisted(() => ({ ask: vi.fn() }));
vi.mock("./api", () => ({ api: vi.fn() }));
vi.mock("./components/ConfirmProvider", () => ({ usePrompt: () => ask }));
beforeEach(() => {
  api.mockReset();
  ask.mockReset();
});
afterEach(() => cleanup());
const row = (id, status, dispatch_status) => ({
  id,
  status,
  dispatch_status,
  order: {
    order_number: `DF-${id}`,
    total: 100,
    delivery_address: `Street ${id}`,
  },
});
const response = (data, page = 1) => ({
  data,
  riders: [{ id: 8, name: "Rider Eight", vehicle_type: "motorcycle" }],
  counts: { attention: 201, waiting: 42, pickup: 3, road: 4, finished: 90 },
  meta: {
    current_page: page,
    last_page: 3,
    total: 45,
    per_page: 20,
    from: (page - 1) * 20 + 1,
    to: Math.min(page * 20, 45),
  },
});
it("separates exceptions, active work and finished deliveries", () => {
  expect(dispatchQueue(row(1, "failed"))).toBe("attention");
  expect(dispatchQueue(row(2, "pending_assignment", "exhausted"))).toBe(
    "attention",
  );
  expect(dispatchQueue(row(3, "in_transit"))).toBe("road");
  expect(dispatchQueue(row(4, "delivered"))).toBe("finished");
});
it("requests server-side queues and prevents repeated manual assignment", async () => {
  let finish;
  api.mockImplementation(async (path) => {
    if (path.endsWith("/assign"))
      return new Promise((resolve) => {
        finish = resolve;
      });
    const params = new URL(path, "http://test").searchParams;
    return response([
      params.get("queue") === "waiting"
        ? row(2, "pending_assignment", "searching")
        : row(1, "pending_assignment", "exhausted"),
    ]);
  });
  render(<DispatchDashboard />);
  await screen.findByText("DF-1");
  expect(
    screen.getByRole("button", { name: /Needs attention 201/ }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Awaiting rider/ }));
  await screen.findByText("DF-2");
  expect(screen.queryByText("DF-1")).toBeNull();
  fireEvent.change(
    screen.getByRole("combobox", { name: "Assign rider for DF-2" }),
    { target: { value: "8" } },
  );
  const button = screen.getByRole("button", { name: "Assign rider" });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(
    api.mock.calls.filter(([path]) => path.endsWith("/assign")),
  ).toHaveLength(1);
  expect(button.closest("fieldset").disabled).toBe(true);
  await act(async () => finish({ data: {} }));
  await screen.findByText("Update saved.");
});
it("paginates server results and resets to the first page for a search", async () => {
  api.mockImplementation(async (path) => {
    const p = new URL(path, "http://test").searchParams;
    return response(
      [row(Number(p.get("page") || 1), "failed")],
      Number(p.get("page") || 1),
    );
  });
  render(<DispatchDashboard />);
  await screen.findByText("DF-1");
  fireEvent.click(screen.getByRole("button", { name: "Next", exact: true }));
  await screen.findByText("DF-2");
  expect(
    api.mock.calls.some(
      ([path]) => new URL(path, "http://test").searchParams.get("page") === "2",
    ),
  ).toBe(true);
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "Far-away customer" },
  });
  await waitFor(() =>
    expect(
      api.mock.calls.some(([path]) => {
        const p = new URL(path, "http://test").searchParams;
        return p.get("q") === "Far-away customer" && p.get("page") === "1";
      }),
    ).toBe(true),
  );
});
function recoverable() {
  return {
    ...row(9, "failed"),
    can_recover: true,
    recovery_status: "in_transit",
    rider: { name: "Rider Nine" },
  };
}
it("does not recover a delivery after the manager cancels", async () => {
  ask.mockResolvedValue(null);
  api.mockResolvedValue(response([recoverable()]));
  render(<DispatchDashboard />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Review and restore delivery" }),
  );
  await waitFor(() => expect(ask).toHaveBeenCalled());
  expect(ask.mock.calls[0][2]).toMatchObject({
    required: true,
    minLength: 3,
    confirmLabel: "Restore delivery",
  });
  expect(ask.mock.calls[0][2].confirmationLabel).toContain("same rider");
  expect(api.mock.calls.some(([path]) => path.endsWith("/recover"))).toBe(
    false,
  );
});
it("sends the manager's reason and custody confirmation when restoring", async () => {
  ask.mockResolvedValue("  Rider confirmed the same order can continue  ");
  api.mockResolvedValue(response([recoverable()]));
  render(<DispatchDashboard />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Review and restore delivery" }),
  );
  await waitFor(() =>
    expect(api.mock.calls.some(([path]) => path.endsWith("/recover"))).toBe(
      true,
    ),
  );
  const [, opts] = api.mock.calls.find(([path]) => path.endsWith("/recover"));
  expect(JSON.parse(opts.body)).toEqual({
    reason: "Rider confirmed the same order can continue",
    custody_confirmed: true,
  });
});
