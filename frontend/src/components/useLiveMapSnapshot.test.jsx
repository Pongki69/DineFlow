// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import { notifyLiveChange } from "../liveUpdates";
import { mergeFleetLocations, useLiveMapSnapshot } from "./useLiveMapSnapshot";
vi.mock("../api", () => ({ api: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
it("loads only on map events, retains pins on failure, and cancels on unmount", async () => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  api
    .mockResolvedValueOnce({ data: { fleet: [{ id: 1, latitude: 14.2 }] } })
    .mockRejectedValueOnce(new Error("Offline"));
  const { result, unmount } = renderHook(() =>
    useLiveMapSnapshot("/admin/operations-overview"),
  );
  expect(api).not.toHaveBeenCalled();
  await act(async () => {
    notifyLiveChange(["locations"]);
    await vi.advanceTimersByTimeAsync(150);
  });
  expect(result.current.fleet[0].latitude).toBe(14.2);
  expect(api.mock.calls[0][1].mapSnapshot).toBe(true);
  await act(async () => {
    notifyLiveChange(["locations"]);
    await vi.advanceTimersByTimeAsync(150);
  });
  expect(result.current.fleet[0].latitude).toBe(14.2);
  const signal = api.mock.calls[0][1].signal;
  unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => {
    notifyLiveChange(["locations"]);
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(api).toHaveBeenCalledTimes(2);
});
it("merges coordinates without introducing new riders or changing status and ignores older snapshots", () => {
  const rider = {
    id: 1,
    name: "Rider",
    latitude: 14,
    longitude: 121,
    located_at: "2026-10-30T05:00:00Z",
    status: "available",
  };
  const result = mergeFleetLocations(
    [rider],
    [
      {
        ...rider,
        latitude: 15,
        status: "on_delivery",
        located_at: "2026-10-30T05:01:00Z",
      },
      { id: 2 },
    ],
  );
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({ latitude: 15, status: "available" });
  expect(mergeFleetLocations(result, [rider])).toEqual(result);
});
