// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { OrderStatusPill, orderStateKey } from "./OrderStatusPill";

afterEach(cleanup);

it("shows a written label and the shared tone for each state", () => {
  const cases = [
    ["pending", "Pending", "pending"],
    ["preparing", "Preparing", "progress"],
    ["ready", "Ready", "success"],
    ["dispatched", "Out for delivery", "progress"],
    ["delivered", "Delivered", "success"],
    ["confirmed", "Confirmed", "pending"],
    ["served", "Served", "success"],
    ["completed", "Completed", "success"],
    ["cancelled", "Cancelled", "danger"],
    ["failed", "Unsuccessful", "danger"],
  ];
  for (const [status, label, tone] of cases) {
    const { unmount } = render(<OrderStatusPill status={status} />);
    const pill = screen.getByText(label);
    expect(pill.dataset.tone).toBe(tone);
    expect(pill.dataset.state).toBe(status);
    unmount();
  }
});

it("maps existing backend wording and falls back to pending", () => {
  expect(orderStateKey("in_transit")).toBe("dispatched");
  expect(orderStateKey("out_for_delivery")).toBe("dispatched");
  expect(orderStateKey("ready_to_serve")).toBe("ready");
  expect(orderStateKey("completed")).toBe("completed");
  expect(orderStateKey("something_new")).toBe("pending");
  expect(orderStateKey(undefined)).toBe("pending");
});
