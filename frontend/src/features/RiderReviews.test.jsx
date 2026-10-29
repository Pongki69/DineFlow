// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RiderReviews } from "./RiderReviews";
import { api } from "../api";

vi.mock("../api", () => ({ api: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const profile = (demo = false) => ({
  rider: {
    id: 4,
    name: "Preview rider",
    vehicle_type: "motorcycle",
    delivered_total: 27,
    joined_at: "2026-10",
  },
  summary: {
    average: 4.4,
    count: 25,
    demo_count: demo ? 25 : 0,
    breakdown: [
      { stars: 5, count: 15 },
      { stars: 4, count: 10 },
    ],
  },
  reviews: [
    {
      id: 1,
      display_name: "Demo customer",
      rating: 5,
      comment: "Sample feedback",
      categories: ["handling"],
      created_at: "2026-10-28T01:00:00Z",
      is_demo: demo,
    },
  ],
  meta: { total: 25, current_page: 1, last_page: 3 },
});
it("identifies sample feedback and keeps review pagination connected to the API", async () => {
  api.mockResolvedValue({ data: profile(true) });
  render(
    <MemoryRouter>
      <RiderReviews own />
    </MemoryRouter>,
  );
  await screen.findByText("Demo delivery");
  expect(screen.getByRole("status").textContent).toContain("25 sample reviews");
  expect(screen.queryByText("Verified delivery")).toBeNull();
  expect(screen.queryByText("25 verified reviews")).toBeNull();
  expect(screen.getByText("1 / 3")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Next", exact: true }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      "/rider/reviews?page=2",
      expect.any(Object),
    ),
  );
});
it("keeps genuine delivery feedback labeled as verified", async () => {
  api.mockResolvedValue({ data: profile(false) });
  render(
    <MemoryRouter>
      <RiderReviews own />
    </MemoryRouter>,
  );
  await screen.findByText("Verified delivery");
  expect(screen.queryByText("Demo reviews enabled.")).toBeNull();
  expect(
    within(screen.getByRole("region", { name: "Rating summary" })).getByText(
      "25 verified reviews",
    ),
  ).toBeTruthy();
});
