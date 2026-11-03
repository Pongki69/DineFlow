// @vitest-environment jsdom
import { useState } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { notifyLiveChange } from "../liveUpdates";
import { useLiveSettings } from "./useLiveSettings";
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function useDraft(loader) {
  const [draft, edit] = useState({ rate: 0 });
  const [receive] = useLiveSettings(loader, draft, edit);
  return { draft, edit, receive };
}
it("updates clean settings and preserves a locally edited draft", async () => {
  const loader = vi.fn().mockResolvedValue({ rate: 10 });
  const { result } = renderHook(() => useDraft(loader));
  act(() => result.current.receive({ rate: 5 }));
  await act(async () => {
    notifyLiveChange(["settings"]);
    await vi.advanceTimersByTimeAsync(300);
  });
  expect(result.current.draft).toEqual({ rate: 10 });
  act(() => result.current.edit({ rate: 12 }));
  await act(async () => {
    notifyLiveChange(["settings"]);
    await vi.advanceTimersByTimeAsync(300);
  });
  expect(loader).toHaveBeenCalledTimes(1);
  expect(result.current.draft).toEqual({ rate: 12 });
});
it("discards a remote result when editing begins during the request", async () => {
  let resolve;
  const loader = () =>
    new Promise((done) => {
      resolve = done;
    });
  const { result } = renderHook(() => useDraft(loader));
  act(() => result.current.receive({ rate: 5 }));
  await act(async () => {
    notifyLiveChange(["settings"]);
    await vi.advanceTimersByTimeAsync(300);
  });
  act(() => result.current.edit({ rate: 20 }));
  await act(async () => resolve({ rate: 10 }));
  expect(result.current.draft).toEqual({ rate: 20 });
});
