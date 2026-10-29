// @vitest-environment jsdom
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { OutletAddressSearch } from "./OutletAddressSearch";
import { api } from "../api";

vi.mock("../api", () => ({ api: vi.fn() }));
const bay = {
  label: "Bay, Laguna, Philippines",
  latitude: 14.18,
  longitude: 121.28,
};
const manila = {
  label: "Manila, Philippines",
  latitude: 14.6,
  longitude: 120.98,
};
beforeEach(() => {
  vi.useFakeTimers();
  api.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
async function tick(ms = 500) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
function setup() {
  const select = vi.fn();
  render(<OutletAddressSearch onSelect={select} />);
  return {
    input: screen.getByRole("combobox", { name: "Find outlet address" }),
    select,
  };
}
it("debounces typed queries, requires three characters, and selects by keyboard without another lookup", async () => {
  api.mockResolvedValue({ data: [bay, manila] });
  const { input, select } = setup();
  fireEvent.change(input, { target: { value: "Ba" } });
  await tick();
  expect(api).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "Bay" } });
  await tick(250);
  fireEvent.change(input, { target: { value: "Bay Laguna" } });
  await tick();
  expect(api).toHaveBeenCalledTimes(1);
  expect(api.mock.calls[0][0]).toBe("/maps/search?q=Bay%20Laguna");
  expect(screen.getAllByRole("option")).toHaveLength(2);
  fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(screen.getByRole("option", { name: bay.label })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  fireEvent.keyDown(input, { key: "Enter" });
  expect(select).toHaveBeenCalledWith(bay);
  expect(input).toHaveValue(bay.label);
  expect(input).toHaveAttribute("aria-expanded", "false");
  await tick();
  expect(api).toHaveBeenCalledTimes(1);
});
it("ignores responses from superseded searches even when a provider finishes an aborted request", async () => {
  const pending = [];
  api.mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
  const { input } = setup();
  fireEvent.change(input, { target: { value: "Manila" } });
  await tick();
  const firstSignal = api.mock.calls[0][1].signal;
  fireEvent.change(input, { target: { value: "Bay Laguna" } });
  await tick();
  expect(firstSignal.aborted).toBe(true);
  await act(async () => pending[1]({ data: [bay] }));
  await act(async () => pending[0]({ data: [manila] }));
  expect(screen.getByRole("option", { name: bay.label })).toBeVisible();
  expect(screen.queryByRole("option", { name: manila.label })).toBeNull();
});
it("closes on Escape or outside interaction and reuses cached searches", async () => {
  api.mockResolvedValue({ data: [bay] });
  const { input } = setup();
  fireEvent.change(input, { target: { value: "Bay Laguna" } });
  await tick();
  fireEvent.keyDown(input, { key: "Escape" });
  expect(input).toHaveAttribute("aria-expanded", "false");
  fireEvent.change(input, { target: { value: "Ba" } });
  fireEvent.change(input, { target: { value: "Bay Laguna" } });
  await tick();
  expect(api).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("option", { name: bay.label })).toBeVisible();
  fireEvent.pointerDown(document.body);
  expect(input).toHaveAttribute("aria-expanded", "false");
});
it("shows useful empty and failure states and supports an explicit retry", async () => {
  api
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValueOnce({ data: [] });
  const { input } = setup();
  fireEvent.change(input, { target: { value: "Bay Laguna" } });
  await tick();
  expect(screen.getByRole("status")).toHaveTextContent(
    "Address suggestions are unavailable",
  );
  fireEvent.click(screen.getByRole("button", { name: "Retry suggestions" }));
  await tick(0);
  expect(screen.getByRole("status")).toHaveTextContent("No matching addresses");
});
