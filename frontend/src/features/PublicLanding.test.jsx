// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { api } from "../api";
import { PublicLanding } from "./PublicLanding";

vi.mock("../api", () => ({ api: vi.fn() }));
const dishes = Array.from({ length: 7 }, (_, index) => ({
  id: index + 1,
  name: `Restaurant dish ${index + 1}`,
  description: "Freshly prepared by the restaurant.",
  base_price: "250.00",
  image_url: index === 0 ? "https://example.com/dish.jpg" : null,
  category: { name: index ? "Mains" : "Favorites" },
}));

function respond(path) {
  if (path === "/restaurant/branding")
    return { data: { name: "Our Actual Bistro" } };
  if (path === "/restaurant/location")
    return {
      data: {
        address: "123 Actual Street",
        is_active: false,
        phone: "0917 123 4567",
        opening_hours: {
          monday: { open: "10:00", close: "22:00" },
          sunday: { closed: true },
        },
        navigation_url:
          "https://www.google.com/maps/dir/?api=1&destination=14,121",
      },
    };
  if (path === "/menu/categories")
    return {
      data: [
        { id: 1, name: "Favorites", slug: "favorites" },
        { id: 2, name: "Mains", slug: "mains" },
      ],
    };
  const params = new URL(`https://example.com${path}`).searchParams;
  const page = Number(params.get("page") || 1);
  const matching = dishes.filter(
    (dish) =>
      (!params.get("q") || dish.name.includes(params.get("q"))) &&
      (!params.get("category") ||
        dish.category.name.toLowerCase() === params.get("category")),
  );
  return {
    data: matching.slice((page - 1) * 6, page * 6),
    total: matching.length,
    last_page: Math.max(1, Math.ceil(matching.length / 6)),
  };
}
beforeEach(() => {
  api.mockReset();
  api.mockImplementation(async (path) => respond(path));
});
afterEach(cleanup);
function show(onSignIn) {
  return render(
    <MemoryRouter>
      <PublicLanding onSignIn={onSignIn} />
    </MemoryRouter>,
  );
}

it("renders actual public restaurant data, PHP menu prices and honest delivery status", async () => {
  show();
  expect(
    screen.getByRole("status", { name: "Loading menu" }),
  ).toBeInTheDocument();
  expect(
    await screen.findByRole("link", { name: "Our Actual Bistro home" }),
  ).toBeInTheDocument();
  expect(
    await screen.findByRole("link", { name: "Order Restaurant dish 1" }),
  ).toHaveAttribute("href", "/menu");
  expect(screen.getAllByText("₱250.00").length).toBeGreaterThan(0);
  expect(screen.getByText("123 Actual Street")).toBeInTheDocument();
  expect(screen.getByText("Delivery currently paused")).toBeInTheDocument();
  expect(screen.queryByText(/Open now|Closes at/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Switch to dark theme" }));
  expect(localStorage.getItem("dineflow-theme")).toBe("dark");
  expect(document.documentElement.style.colorScheme).toBe("dark");
  fireEvent.click(
    screen.getByRole("button", { name: "Switch to light theme" }),
  );
  expect(localStorage.getItem("dineflow-theme")).toBe("light");
  fireEvent.click(screen.getByText("View restaurant hours"));
  expect(screen.getByText("10:00–22:00")).toBeVisible();
  expect(screen.getByText("Closed")).toBeVisible();
  expect(screen.getByRole("link", { name: "Get directions" })).toHaveAttribute(
    "rel",
    "noopener noreferrer",
  );
  expect(
    api.mock.calls.every(
      ([, options]) => !options.method || options.method === "GET",
    ),
  ).toBe(true);
});

it("filters and paginates through public API reads", async () => {
  show();
  await screen.findByRole("link", { name: "Order Restaurant dish 1" });
  expect(
    screen.getByRole("button", { name: "Previous menu page" }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Next menu page" }));
  await screen.findByRole("link", { name: "Order Restaurant dish 7" });
  expect(screen.getByRole("button", { name: "Next menu page" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Favorites" }));
  await screen.findByRole("link", { name: "Order Restaurant dish 1" });
  expect(screen.getByRole("button", { name: "Favorites" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByText("Showing 1–1 of 1 dishes")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "All dishes" }));
  fireEvent.change(screen.getByLabelText("Search menu"), {
    target: { value: "dish 3" },
  });
  await screen.findByRole("link", { name: "Order Restaurant dish 3" });
  expect(api.mock.calls.some(([path]) => path.includes("q=dish+3"))).toBe(true);
});

it("preserves booking and ordering destinations when sign-in is requested", async () => {
  const onSignIn = vi.fn();
  show(onSignIn);
  await screen.findByRole("link", { name: "Order Restaurant dish 1" });
  fireEvent.click(screen.getAllByRole("link", { name: "Book a table" })[0]);
  expect(onSignIn).toHaveBeenLastCalledWith("/reserve");
  fireEvent.click(
    screen.getByRole("link", { name: "Order Restaurant dish 1" }),
  );
  expect(onSignIn).toHaveBeenLastCalledWith("/menu");
});

it("recovers from menu errors and displays a clear empty search state", async () => {
  let unavailable = true;
  api.mockImplementation(async (path) => {
    if (unavailable && path.startsWith("/menu/items"))
      throw new Error("Connection interrupted");
    return respond(path);
  });
  show();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Connection interrupted",
  );
  unavailable = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("link", { name: "Order Restaurant dish 1" });
  fireEvent.change(screen.getByLabelText("Search menu"), {
    target: { value: "not available" },
  });
  expect(
    await screen.findByRole("heading", { name: "No dishes match just yet" }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Show all dishes" }));
  await screen.findByRole("link", { name: "Order Restaurant dish 1" });
});

it("keeps browsing available when optional restaurant details fail or photos break", async () => {
  api.mockImplementation(async (path) => {
    if (path === "/restaurant/location") throw new Error("Details unavailable");
    return respond(path);
  });
  show();
  await screen.findByRole("link", { name: "Order Restaurant dish 1" });
  expect(
    await screen.findByText(/Some restaurant details couldn’t refresh/),
  ).toBeInTheDocument();
  const photo = screen.getByRole("img", { name: "Restaurant dish 1" });
  fireEvent.error(photo);
  await waitFor(() =>
    expect(
      screen.queryByRole("img", { name: "Restaurant dish 1" }),
    ).not.toBeInTheDocument(),
  );
  expect(
    screen.getByRole("link", { name: "Order Restaurant dish 1" }),
  ).toBeInTheDocument();
});
