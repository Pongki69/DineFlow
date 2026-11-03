// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const playSound = vi.fn();
vi.mock("../uiSound", () => ({ playSound: (...args) => playSound(...args) }));
const api = vi.fn();
vi.mock("../api", () => ({ api: (...args) => api(...args) }));

const { KitchenSoldOut, useNewTicketAlert } = await import("./KitchenTools");

beforeEach(() => {
  playSound.mockClear();
  api.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("new ticket alert", () => {
  it("stays quiet on the first load, then chimes for arrivals only", () => {
    const first = [{ id: 1, status: "confirmed" }];
    const { result, rerender } = renderHook(
      ({ orders, ready }) => useNewTicketAlert(orders, ready),
      { initialProps: { orders: first, ready: true } },
    );
    expect(playSound).not.toHaveBeenCalled();
    rerender({ orders: [...first, { id: 2, status: "preparing" }], ready: true });
    expect(playSound).not.toHaveBeenCalled();
    rerender({
      orders: [...first, { id: 2, status: "preparing" }, { id: 3, status: "confirmed" }],
      ready: true,
    });
    expect(playSound).toHaveBeenCalledWith("newTicket");
    expect(result.current.has(3)).toBe(true);
    expect(result.current.has(1)).toBe(false);
  });

  it("waits until the queue has loaded before learning what is already there", () => {
    const { rerender } = renderHook(
      ({ orders, ready }) => useNewTicketAlert(orders, ready),
      { initialProps: { orders: [], ready: false } },
    );
    rerender({ orders: [{ id: 9, status: "confirmed" }], ready: true });
    expect(playSound).not.toHaveBeenCalled();
  });
});

describe("kitchen sold-out panel", () => {
  it("lists dishes and marks one sold out", async () => {
    api.mockImplementation(async (path) =>
      path === "/kitchen/menu"
        ? { data: [{ id: 4, name: "Tapsilog", category: "Silog", is_sold_out: false }] }
        : { data: { id: 4, is_sold_out: true } },
    );
    render(<KitchenSoldOut canUpdate />);
    fireEvent.click(await screen.findByRole("button", { name: /Menu availability/ }));
    const toggle = await screen.findByRole("switch", { name: "Tapsilog available" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    await act(async () => fireEvent.click(toggle));
    expect(api).toHaveBeenCalledWith("/kitchen/menu/4/sold-out", {
      method: "PATCH",
      body: JSON.stringify({ is_sold_out: true }),
    });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("1 sold out")).toBeTruthy();
  });

  it("is read-only without kitchen update access", async () => {
    api.mockResolvedValue({ data: [{ id: 4, name: "Tapsilog", is_sold_out: false }] });
    render(<KitchenSoldOut canUpdate={false} />);
    fireEvent.click(await screen.findByRole("button", { name: /Menu availability/ }));
    expect((await screen.findByRole("switch")).disabled).toBe(true);
  });
});
