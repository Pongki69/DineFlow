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
import { MemoryRouter } from "react-router-dom";
import { RiderHistory } from "./RiderWorkspace";
import { api } from "../api";

vi.mock("../api", () => ({ api: vi.fn() }));
const latestParams = () =>
  new URL(api.mock.calls.at(-1)[0], "http://example.test").searchParams;
beforeEach(() => {
  api.mockImplementation(async (path) => {
    const params = new URL(path, "http://example.test").searchParams;
    const page = Number(params.get("page"));
    const query = params.get("q");
    const total = query ? 1 : 21;
    return {
      data: [
        {
          id: page,
          status: "delivered",
          history: [],
          order: {
            order_number: query ? "DF-MATCH" : `DF-PAGE-${page}`,
            total: 100,
            destination: { address: "Laguna" },
          },
        },
      ],
      meta: { current_page: page, last_page: query ? 1 : 3, total },
    };
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("paginates history and resets to page one when searching all records", async () => {
  render(<RiderHistory />, { wrapper: MemoryRouter });
  await screen.findByRole("link", { name: "DF-PAGE-1" });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByRole("link", { name: "DF-PAGE-2" });
  expect(latestParams().get("page")).toBe("2");
  fireEvent.change(
    screen.getByRole("searchbox", { name: "Search deliveries" }),
    { target: { value: "MATCH" } },
  );
  await screen.findByRole("link", { name: "DF-MATCH" });
  expect(latestParams().get("q")).toBe("MATCH");
  expect(latestParams().get("page")).toBe("1");
  expect(screen.getByRole("button", { name: "Next" }).disabled).toBe(true);
});

it("combines outcome filters and page size, and clears filters", async () => {
  render(<RiderHistory />, { wrapper: MemoryRouter });
  await screen.findByRole("link", { name: "DF-PAGE-1" });
  fireEvent.change(screen.getByLabelText("Delivery outcome"), {
    target: { value: "failed" },
  });
  await waitFor(() => expect(latestParams().get("status")).toBe("failed"));
  fireEvent.change(screen.getByLabelText("Per page"), {
    target: { value: "50" },
  });
  await waitFor(() => expect(latestParams().get("per_page")).toBe("50"));
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  await waitFor(() => expect(latestParams().has("status")).toBe(false));
  expect(latestParams().get("page")).toBe("1");
});
