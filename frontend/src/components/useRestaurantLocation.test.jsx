// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useRestaurantLocation } from "./useRestaurantLocation";
import { api } from "../api";
import { subscribeToRestaurantLocation } from "../realtime";

vi.mock("../api", () => ({ api: vi.fn() }));
vi.mock("../realtime", () => ({ subscribeToRestaurantLocation: vi.fn() }));
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

it("reloads the saved outlet after a live change and retains the last location during connection failure", async () => {
  const first = { name: "First outlet", latitude: 14.18, longitude: 121.23 };
  const second = { name: "Current outlet", latitude: 14.19, longitude: 121.28 };
  api
    .mockResolvedValueOnce({ data: first, location_version: "first" })
    .mockResolvedValueOnce({ data: second, location_version: "second" })
    .mockRejectedValueOnce(new Error("Connection interrupted"));
  let changed;
  const stop = vi.fn();
  subscribeToRestaurantLocation.mockImplementation((refresh) => {
    changed = refresh;
    return stop;
  });
  const { result, unmount } = renderHook(() => useRestaurantLocation());
  await act(async () => {});
  expect(result.current.location).toEqual(first);
  const previousRevision = result.current.revision;
  await act(async () => {
    await changed();
  });
  expect(result.current.location).toEqual(second);
  expect(result.current.revision).not.toBe(previousRevision);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30000);
  });
  expect(result.current.location).toEqual(second);
  expect(result.current.error).toBe("Connection interrupted");
  unmount();
  expect(stop).toHaveBeenCalledOnce();
});
