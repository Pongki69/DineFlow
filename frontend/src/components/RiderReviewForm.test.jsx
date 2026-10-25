// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { RiderReviewForm, maskedReviewerName } from "./RiderReviewForm";
import { api } from "../api";
vi.mock("../api", () => ({ api: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("keeps names masked by default and submits chosen feedback only after selecting stars", async () => {
  api.mockResolvedValue({ data: {} });
  const saved = vi.fn();
  render(
    <RiderReviewForm
      deliveryId={9}
      user={{ name: "Alfonso Panisales" }}
      onSaved={saved}
    />,
  );
  expect(screen.getByRole("button", { name: "Submit review" })).toBeDisabled();
  expect(
    screen.getByRole("checkbox", { name: /Show my name/ }),
  ).not.toBeChecked();
  expect(screen.getByText("Al*****o")).toBeVisible();
  fireEvent.click(screen.getByRole("radio", { name: "5 stars" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "On-time delivery" }));
  fireEvent.change(screen.getByRole("textbox", { name: /Comment/ }), {
    target: { value: "On time." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit review" }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(JSON.parse(api.mock.calls[0][1].body)).toEqual({
    rating: 5,
    comment: "On time.",
    categories: ["delivery_time"],
    show_name: false,
  });
});
it("edits an existing review instead of creating a duplicate and can reveal the name", async () => {
  api.mockResolvedValue({ data: {} });
  render(
    <RiderReviewForm
      deliveryId={9}
      rating={4}
      review={{ rating: 4, comment: "Good", categories: [], show_name: false }}
      user={{ name: "Alfonso Panisales" }}
      onSaved={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit review" }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Show my name/ }));
  fireEvent.click(screen.getByRole("button", { name: "Save review" }));
  await waitFor(() => expect(api).toHaveBeenCalled());
  expect(api.mock.calls[0][1].method).toBe("PATCH");
  expect(JSON.parse(api.mock.calls[0][1].body).show_name).toBe(true);
  expect(maskedReviewerName("Bo")).toBe("B*****");
});
