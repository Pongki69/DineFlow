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
import { MapControls } from "./MapControls";

vi.mock("react-leaflet", () => ({ useMap: () => map }));
const map = {
  getContainer: () => target,
  setView: vi.fn(),
  fitBounds: vi.fn(),
  invalidateSize: vi.fn(),
};
let target;
beforeEach(() => {
  target = document.createElement("div");
  target.setAttribute("aria-label", "Original map");
  document.body.append(target);
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    value: null,
  });
});
afterEach(() => {
  cleanup();
  target.remove();
  vi.clearAllMocks();
});

it("recenters on current saved coordinates or all provided endpoints", () => {
  const { rerender } = render(
    <MapControls center={[14.2, 121.3]} zoom={17} />,
    { container: target },
  );
  fireEvent.click(screen.getByRole("button", { name: "Recenter map" }));
  expect(map.setView).toHaveBeenCalledWith([14.2, 121.3], 17);
  rerender(
    <MapControls
      bounds={[
        [14.2, 121.3],
        [14.21, 121.31],
      ]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Recenter map" }));
  expect(map.fitBounds).toHaveBeenCalledWith(
    [
      [14.2, 121.3],
      [14.21, 121.31],
    ],
    { padding: [45, 45], maxZoom: 16 },
  );
});

it("supports fullscreen fallback, isolates the map and restores focus and page scrolling on Escape", async () => {
  target.requestFullscreen = vi
    .fn()
    .mockRejectedValue(new Error("Unavailable"));
  const sibling = document.createElement("button");
  document.body.append(sibling);
  render(<MapControls center={[14.2, 121.3]} />, { container: target });
  const enter = screen.getByRole("button", { name: "Enter fullscreen map" });
  fireEvent.click(enter);
  await waitFor(() => expect(target).toHaveClass("dineflow-map--fullscreen"));
  expect(target).toHaveAttribute("role", "dialog");
  expect(sibling.inert).toBe(true);
  expect(document.body.style.overflow).toBe("hidden");
  fireEvent.keyDown(target, { key: "Escape" });
  await waitFor(() =>
    expect(target).not.toHaveClass("dineflow-map--fullscreen"),
  );
  expect(target).toHaveAttribute("aria-label", "Original map");
  expect(sibling.inert).toBe(false);
  expect(document.body.style.overflow).toBe("");
  expect(enter).toHaveFocus();
  sibling.remove();
});

it("uses existing workspace fullscreen and recenter behavior when supplied", () => {
  const toggle = vi.fn(),
    recenter = vi.fn();
  render(
    <MapControls
      fullscreen={{ expanded: true, toggle }}
      onRecenter={recenter}
    />,
    { container: target },
  );
  fireEvent.click(screen.getByRole("button", { name: "Exit fullscreen map" }));
  fireEvent.click(screen.getByRole("button", { name: "Recenter map" }));
  expect(toggle).toHaveBeenCalledOnce();
  expect(recenter).toHaveBeenCalledWith(map);
  expect(target).not.toHaveClass("dineflow-map--fullscreen");
});
