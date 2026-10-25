// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CountUp } from "./CountUp";

let frames;
beforeEach(() => {
  frames = new Map();
  let id = 0;
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback) => {
      frames.set(++id, callback);
      return id;
    }),
  );
  vi.stubGlobal(
    "cancelAnimationFrame",
    vi.fn((key) => frames.delete(key)),
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function advance(time) {
  act(() => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(time));
  });
}

it("counts up, retains the exact accessible value, and does not restart on unchanged data", () => {
  const { rerender } = render(<CountUp value={20} />);
  const counter = screen.getByLabelText("20");
  expect(counter.textContent).toBe("0");
  advance(0);
  advance(375);
  expect(Number(counter.textContent)).toBeGreaterThan(0);
  expect(Number(counter.textContent)).toBeLessThan(20);
  advance(750);
  expect(counter.textContent).toBe("20");
  rerender(<CountUp value={20} />);
  expect(frames.size).toBe(0);
});

it("respects reduced motion and cancels pending animation on unmount", () => {
  matchMedia.mockReturnValue({ matches: true });
  const { unmount } = render(<CountUp value={4.8} decimals={1} />);
  advance(0);
  expect(screen.getByLabelText("4.8").textContent).toBe("4.8");
  expect(frames.size).toBe(0);
  unmount();
  matchMedia.mockReturnValue({ matches: false });
  const next = render(<CountUp value={10} />);
  expect(frames.size).toBe(1);
  next.unmount();
  expect(frames.size).toBe(0);
});
