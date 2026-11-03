// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SwipeToConfirm } from "./SwipeToConfirm";

function setPointer(coarse) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: coarse })),
  );
}
beforeEach(() => {
  // jsdom has no PointerEvent; MouseEvent carries clientX for the drag.
  if (!window.PointerEvent) vi.stubGlobal("PointerEvent", MouseEvent);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderTrack(onConfirm) {
  setPointer(true);
  render(<SwipeToConfirm onConfirm={onConfirm}>Pick up order</SwipeToConfirm>);
  const track = screen.getByRole("button", { name: "Pick up order" });
  Object.defineProperty(track, "clientWidth", { value: 300 });
  return track;
}

it("keeps a plain button for mouse users", () => {
  setPointer(false);
  const onConfirm = vi.fn();
  render(<SwipeToConfirm onConfirm={onConfirm}>Mark delivered</SwipeToConfirm>);
  const button = screen.getByRole("button", { name: "Mark delivered" });
  expect(button.className).toContain("ui-button");
  fireEvent.click(button, { detail: 1 });
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

it("confirms on touch only after a near-complete swipe", () => {
  const onConfirm = vi.fn();
  const track = renderTrack(onConfirm);
  expect(track.getAttribute("aria-describedby")).toBeTruthy();

  fireEvent.pointerDown(track, { clientX: 10, pointerId: 1 });
  fireEvent.pointerMove(track, { clientX: 120, pointerId: 1 });
  fireEvent.pointerUp(track, { clientX: 120, pointerId: 1 });
  fireEvent.click(track);
  expect(onConfirm).not.toHaveBeenCalled();

  fireEvent.pointerDown(track, { clientX: 10, pointerId: 1 });
  fireEvent.pointerMove(track, { clientX: 290, pointerId: 1 });
  fireEvent.pointerUp(track, { clientX: 290, pointerId: 1 });
  fireEvent.click(track);
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

it("ignores a tap on touch but still confirms keyboard activation", () => {
  const onConfirm = vi.fn();
  const track = renderTrack(onConfirm);
  fireEvent.pointerDown(track, { clientX: 20, pointerId: 1 });
  fireEvent.pointerUp(track, { clientX: 21, pointerId: 1 });
  fireEvent.click(track);
  expect(onConfirm).not.toHaveBeenCalled();

  fireEvent.click(track);
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

it("does not confirm while disabled", () => {
  setPointer(true);
  const onConfirm = vi.fn();
  render(
    <SwipeToConfirm disabled onConfirm={onConfirm}>
      Pick up order
    </SwipeToConfirm>,
  );
  const track = screen.getByRole("button", { name: "Pick up order" });
  expect(track.disabled).toBe(true);
  fireEvent.click(track);
  expect(onConfirm).not.toHaveBeenCalled();
});
