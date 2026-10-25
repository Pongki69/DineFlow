// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { usePollingResource } from "./usePollingResource";

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("deduplicates overlapping polls and aborts its pending request on unmount", async () => {
  let signal;
  const loader = vi.fn((options) => {
    signal = options.signal;
    return new Promise(() => {});
  });
  const { result, unmount } = renderHook(() =>
    usePollingResource(loader, { intervalMs: 100 }),
  );
  await act(async () => {});
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
  act(() => {
    result.current.refresh();
  });
  expect(loader).toHaveBeenCalledTimes(1);
  unmount();
  expect(signal.aborted).toBe(true);
});

it("retains previous data and update time when a refresh fails, then recovers", async () => {
  const loader = vi
    .fn()
    .mockResolvedValueOnce({ active_count: 3 })
    .mockRejectedValueOnce(new Error("Connection unavailable"))
    .mockResolvedValueOnce({ active_count: 2 });
  const { result } = renderHook(() =>
    usePollingResource(loader, { intervalMs: 100 }),
  );
  await act(async () => {});
  const updatedAt = result.current.updatedAt;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(result.current.data).toEqual({ active_count: 3 });
  expect(result.current.error).toBe("Connection unavailable");
  expect(result.current.updatedAt).toBe(updatedAt);
  expect(result.current.refreshing).toBe(false);
  await act(async () => {
    await result.current.refresh();
  });
  expect(result.current.data).toEqual({ active_count: 2 });
  expect(result.current.error).toBe("");
});

it("pauses background polling when hidden and reloads on return", async () => {
  const visibility = vi
    .spyOn(document, "visibilityState", "get")
    .mockReturnValue("visible");
  const loader = vi.fn().mockResolvedValue({ active_count: 1 });
  renderHook(() =>
    usePollingResource(loader, {
      intervalMs: 100,
      eventName: "rider-deliveries-updated",
    }),
  );
  await act(async () => {});
  visibility.mockReturnValue("hidden");
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("rider-deliveries-updated"));
    await vi.advanceTimersByTimeAsync(300);
  });
  expect(loader).toHaveBeenCalledTimes(1);
  visibility.mockReturnValue("visible");
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(loader).toHaveBeenCalledTimes(2);
});

it("aborts an obsolete resource and ignores its late response", async () => {
  let finishOld;
  let oldSignal;
  const { result, rerender } = renderHook(
    ({ queue }) =>
      usePollingResource(
        ({ signal }) => {
          if (queue === "old") {
            oldSignal = signal;
            return new Promise((resolve) => {
              finishOld = resolve;
            });
          }
          return Promise.resolve({ queue });
        },
        { resourceKey: queue },
      ),
    { initialProps: { queue: "old" } },
  );
  await act(async () => {});
  rerender({ queue: "new" });
  await act(async () => {});
  expect(oldSignal.aborted).toBe(true);
  expect(result.current.data).toEqual({ queue: "new" });
  await act(async () => {
    finishOld({ queue: "old" });
  });
  expect(result.current.data).toEqual({ queue: "new" });
});
