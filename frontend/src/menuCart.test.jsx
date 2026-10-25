// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MenuBrowser } from "./features/Menu";
import { api } from "./api";
import { readSavedCart } from "./savedCart";

vi.mock("./api", () => ({ api: vi.fn() }));
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  api.mockImplementation(async (path, options) => {
    if (path === "/menu/categories")
      return { data: [{ id: 1, name: "Mains", slug: "mains" }] };
    if (path === "/orders/dine-in-reservations")
      return {
        data: [
          {
            reference: "RSV-READY",
            table_number: "T1",
            starts_at: "2026-10-22T10:00:00Z",
            status: "seated",
            ready: true,
          },
        ],
      };
    if (path === "/orders" && options?.method === "POST")
      return { data: { order_number: "CART-1", total: 200 } };
    return {
      data: [
        { id: 7, name: "Test Dish", base_price: 100, variants: [], addons: [] },
      ],
      last_page: 1,
    };
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("keeps quantity changes and checkout notes working in the scrollable order panel", async () => {
  render(<MenuBrowser user={{ id: 1 }} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Add to order", exact: true }),
  );
  const panel = screen.getByRole("complementary", { name: "Your order" });
  const checkout = within(panel);
  fireEvent.click(
    checkout.getByRole("button", { name: "Increase Test Dish quantity" }),
  );
  expect(checkout.getByLabelText("Quantity: 2")).toBeTruthy();
  fireEvent.change(checkout.getByLabelText("Order notes (optional)"), {
    target: { value: "Pack separately" },
  });
  fireEvent.submit(
    checkout.getByRole("button", { name: "Place order" }).closest("form"),
  );
  await screen.findByText(/Order CART-1 placed/);
  const [, request] = api.mock.calls.find(([path]) => path === "/orders");
  expect(JSON.parse(request.body)).toMatchObject({
    order_type: "pickup",
    customer_notes: "Pack separately",
    items: [{ menu_item_id: 7, quantity: 2 }],
  });
  expect(readSavedCart(1)).toEqual([]);
});

it("places a dine-in order using a selected reservation without a table UUID", async () => {
  render(<MenuBrowser user={{ id: 1 }} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Add to order", exact: true }),
  );
  fireEvent.change(screen.getByLabelText("Order type"), {
    target: { value: "dine_in" },
  });
  fireEvent.click(await screen.findByRole("radio", { name: /RSV-READY/ }));
  fireEvent.submit(
    screen.getByRole("button", { name: "Place order" }).closest("form"),
  );
  await screen.findByText(/Order CART-1 placed/);
  const [, request] = api.mock.calls.find(([path]) => path === "/orders");
  expect(JSON.parse(request.body)).toMatchObject({
    order_type: "dine_in",
    table_code: "RSV-READY",
  });
  expect(readSavedCart(1)).toEqual([]);
});

it("restores quantities and instructions after leaving the menu, isolated per account", async () => {
  const first = render(<MenuBrowser user={{ id: 1 }} />);
  const add = await screen.findByRole("button", {
    name: "Add to order",
    exact: true,
  });
  fireEvent.change(
    screen.getByLabelText("Special instructions for Test Dish"),
    { target: { value: "No salt" } },
  );
  fireEvent.click(add);
  fireEvent.click(
    screen.getByRole("button", { name: "Increase Test Dish quantity" }),
  );
  first.unmount();
  const second = render(<MenuBrowser user={{ id: 2 }} />);
  expect(screen.queryByRole("button", { name: "Place order" })).toBeNull();
  second.unmount();
  render(<MenuBrowser user={{ id: 1 }} />);
  expect(screen.getByLabelText("Quantity: 2")).toBeTruthy();
  expect(readSavedCart(1)[0]).toMatchObject({
    quantity: 2,
    special_instructions: "No salt",
  });
  fireEvent.click(screen.getByRole("button", { name: "Remove Test Dish" }));
  expect(readSavedCart(1)).toEqual([]);
});

it("keeps the saved cart when checkout fails", async () => {
  render(<MenuBrowser user={{ id: 1 }} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Add to order", exact: true }),
  );
  api.mockRejectedValueOnce(new Error("Could not place order"));
  fireEvent.submit(
    screen.getByRole("button", { name: "Place order" }).closest("form"),
  );
  await screen.findByText("Could not place order");
  expect(readSavedCart(1)).toHaveLength(1);
  expect(screen.getByLabelText("Quantity: 1")).toBeTruthy();
});

it("ignores damaged saved data and works when browser storage is unavailable", async () => {
  localStorage.setItem("dineflow:cart:v1:1", "{broken");
  expect(readSavedCart(1)).toEqual([]);
  localStorage.setItem(
    "dineflow:cart:v1:1",
    JSON.stringify({ version: 1, lines: [null, {}, { quantity: -1 }] }),
  );
  expect(readSavedCart(1)).toEqual([]);
  const storage = vi
    .spyOn(Storage.prototype, "setItem")
    .mockImplementation(() => {
      throw new Error("Storage blocked");
    });
  render(<MenuBrowser user={{ id: 1 }} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Add to order", exact: true }),
  );
  expect(screen.getByLabelText("Quantity: 1")).toBeTruthy();
  storage.mockRestore();
});
