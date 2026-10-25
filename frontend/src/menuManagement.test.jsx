// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MenuAdmin } from "./features/CatalogAdmin";
import { api } from "./api";

const confirm = vi.hoisted(() => vi.fn());
vi.mock("./api", () => ({ api: vi.fn() }));
vi.mock("./components/ConfirmProvider", () => ({ useConfirm: () => confirm }));
const item = {
  id: 1,
  name: "Party Platter",
  category_id: 1,
  category: { name: "Mains" },
  base_price: "350.00",
  pieces: 6,
  servings: 2,
  is_active: true,
  is_available: true,
  variants: [],
  addons: [],
};

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  confirm.mockResolvedValue(true);
  let deleted = false;
  api.mockImplementation(async (path, options) => {
    if (path.endsWith("/deletion-preview"))
      return { data: { id: 1, name: "Mains", dishes: [item] } };
    if (options?.method === "DELETE") {
      deleted = true;
      return null;
    }
    if (options?.method === "PUT" || options?.method === "POST")
      return { data: item };
    if (path === "/menu/categories")
      return { data: [{ id: 1, name: "Mains", is_active: true }] };
    return { data: deleted ? [] : [item] };
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("shows portion details and lets managers clear both optional counts when editing", async () => {
  render(<MenuAdmin />);
  await screen.findByText("6 pcs · 2 servings");
  fireEvent.click(screen.getByRole("button", { name: "Edit dish" }));
  const dialog = await screen.findByRole("dialog", { name: "Edit dish" });
  const pieces = within(dialog).getByLabelText("Pieces (optional)");
  const servings = within(dialog).getByLabelText("Servings (optional)");
  expect(pieces.value).toBe("6");
  expect(servings.value).toBe("2");
  expect(pieces.required).toBe(false);
  expect(servings.required).toBe(false);
  fireEvent.change(pieces, { target: { value: "" } });
  fireEvent.change(servings, { target: { value: "" } });
  fireEvent.submit(
    within(dialog).getByRole("button", { name: "Save dish" }).closest("form"),
  );
  await waitFor(() =>
    expect(
      api.mock.calls.some(([, options]) => options?.method === "PUT"),
    ).toBe(true),
  );
  const [, request] = api.mock.calls.find(
    ([, options]) => options?.method === "PUT",
  );
  expect(JSON.parse(request.body)).toMatchObject({ pieces: "", servings: "" });
});

it("cancels deletion without changing the menu and deletes only after confirmation", async () => {
  render(<MenuAdmin />);
  await screen.findByText("Party Platter");
  confirm.mockResolvedValueOnce(false);
  fireEvent.click(screen.getByRole("button", { name: "Delete dish" }));
  await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
  expect(
    api.mock.calls.some(([, options]) => options?.method === "DELETE"),
  ).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Delete dish" }));
  await screen.findByText("Party Platter deleted.");
  expect(api).toHaveBeenCalledWith("/menu/items/1", { method: "DELETE" });
  expect(screen.queryByRole("button", { name: "Edit dish" })).toBeNull();
});

it("switches from device upload to a pasted image link and saves it", async () => {
  render(<MenuAdmin />);
  fireEvent.click(await screen.findByRole("button", { name: "Edit dish" }));
  const dialog = await screen.findByRole("dialog", { name: "Edit dish" });
  expect(within(dialog).getByLabelText("Choose an image").type).toBe("file");
  fireEvent.click(within(dialog).getByRole("button", { name: "From link" }));
  expect(within(dialog).queryByLabelText("Choose an image")).toBeNull();
  fireEvent.change(within(dialog).getByLabelText("Image link"), {
    target: { value: "https://images.example.test/dish.jpg" },
  });
  expect(
    within(dialog).getByAltText("Selected image preview").getAttribute("src"),
  ).toBe("https://images.example.test/dish.jpg");
  fireEvent.submit(
    within(dialog).getByRole("button", { name: "Save dish" }).closest("form"),
  );
  await waitFor(() =>
    expect(
      api.mock.calls.some(([, options]) => options?.method === "PUT"),
    ).toBe(true),
  );
  const [, request] = api.mock.calls.find(
    ([, options]) => options?.method === "PUT",
  );
  expect(JSON.parse(request.body).image_source_url).toBe(
    "https://images.example.test/dish.jpg",
  );
});

it("filters dishes by category and combines sorting with search", async () => {
  api.mockImplementation(async (path) =>
    path === "/menu/categories"
      ? {
          data: [
            { id: 1, name: "Mains", is_active: true },
            { id: 2, name: "Drinks", is_active: true },
          ],
        }
      : {
          data: [
            item,
            {
              ...item,
              id: 2,
              name: "Iced Tea",
              category_id: 2,
              category: { name: "Drinks" },
              base_price: 60,
            },
            { ...item, id: 3, name: "Soup", base_price: 100 },
          ],
        },
  );
  render(<MenuAdmin />);
  await screen.findByText("Showing 3 of 3 dishes");
  const names = () =>
    screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
  expect(names()).toEqual(["Iced Tea", "Party Platter", "Soup"]);
  fireEvent.change(
    screen.getByRole("combobox", { name: "Category", exact: true }),
    { target: { value: "1" } },
  );
  expect(names()).toEqual(["Party Platter", "Soup"]);
  fireEvent.change(screen.getByRole("combobox", { name: "Sort by" }), {
    target: { value: "price-asc" },
  });
  expect(names()).toEqual(["Soup", "Party Platter"]);
  fireEvent.change(
    screen.getByRole("textbox", { name: "Search menu management" }),
    { target: { value: "platter" } },
  );
  expect(names()).toEqual(["Party Platter"]);
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(names()).toEqual(["Iced Tea", "Soup", "Party Platter"]);
});

it("deletes an existing category with confirmation and clears its selected filter", async () => {
  render(<MenuAdmin />);
  await screen.findByText("Party Platter");
  fireEvent.change(
    screen.getByRole("combobox", { name: "Category", exact: true }),
    { target: { value: "1" } },
  );
  fireEvent.click(screen.getByRole("button", { name: /Mains Edit category/ }));
  const dialog = await screen.findByRole("dialog", { name: "Edit category" });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Delete category" }),
  );
  const review = await screen.findByRole("dialog", {
    name: "Delete category and dishes?",
  });
  await within(review).findByText("Party Platter");
  expect(
    api.mock.calls.some(([, options]) => options?.method === "DELETE"),
  ).toBe(false);
  fireEvent.click(
    within(review).getByRole("button", { name: "Delete category and 1 dish" }),
  );
  await screen.findByText("Mains category and 1 dish deleted.");
  expect(api).toHaveBeenCalledWith("/menu/categories/1", {
    method: "DELETE",
    body: JSON.stringify({ dish_ids: [1] }),
  });
  expect(
    screen.getByRole("combobox", { name: "Category", exact: true }).value,
  ).toBe("");
  expect(screen.queryByRole("dialog", { name: "Edit category" })).toBeNull();
});

it("requires a refreshed review if the affected dishes change", async () => {
  render(<MenuAdmin />);
  await screen.findByText("Party Platter");
  fireEvent.click(screen.getByRole("button", { name: /Mains Edit category/ }));
  const dialog = await screen.findByRole("dialog", { name: "Edit category" });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Delete category" }),
  );
  const review = await screen.findByRole("dialog", {
    name: "Delete category and dishes?",
  });
  await within(review).findByText("Party Platter");
  api.mockImplementationOnce(async () => {
    throw Object.assign(new Error("Validation failed"), {
      errors: { dish_ids: ["The dishes have changed. Refresh the list."] },
    });
  });
  fireEvent.click(
    within(review).getByRole("button", { name: "Delete category and 1 dish" }),
  );
  await within(review).findByText("The dishes have changed. Refresh the list.");
  expect(
    within(review).getByRole("button", { name: "Delete category and 1 dish" })
      .disabled,
  ).toBe(true);
  expect(
    within(review).getByRole("button", { name: "Refresh list" }),
  ).toBeTruthy();
  fireEvent.click(within(review).getByRole("button", { name: "Cancel" }));
  expect(screen.getByRole("dialog", { name: "Edit category" })).toBeTruthy();
});
