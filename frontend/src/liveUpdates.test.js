// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  applyLiveUpdates,
  deferLiveResult,
  getLiveState,
  notifyLiveChange,
  protectLiveView,
  subscribeToLiveChanges,
  subscribeToMapChanges,
} from "./liveUpdates";
let stop, unsubscribe;
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  stop = protectLiveView();
});
afterEach(async () => {
  document.body.innerHTML = "";
  unsubscribe?.();
  stop();
  applyLiveUpdates();
  await vi.runAllTimersAsync();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it("coalesces server events and does not run a periodic data timer", async () => {
  const refresh = vi.fn();
  unsubscribe = subscribeToLiveChanges(refresh, ["orders"]);
  notifyLiveChange(["orders"]);
  notifyLiveChange(["orders"]);
  await vi.advanceTimersByTimeAsync(300);
  expect(refresh).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(30000);
  expect(refresh).toHaveBeenCalledTimes(1);
});
it("keeps a scrolled view stable until the reader explicitly applies updates", async () => {
  const refresh = vi.fn();
  unsubscribe = subscribeToLiveChanges(refresh);
  Object.defineProperty(window, "scrollY", { value: 700, configurable: true });
  notifyLiveChange();
  await vi.advanceTimersByTimeAsync(3000);
  expect(refresh).not.toHaveBeenCalled();
  expect(getLiveState().pending).toBe(1);
  applyLiveUpdates();
  await vi.runAllTimersAsync();
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(window.scrollY).toBe(700);
});

it("updates map geometry while scrolling without applying queued page changes", async () => {
  const page = vi.fn(),
    map = vi.fn();
  unsubscribe = subscribeToLiveChanges(page, ["locations"]);
  const stopMap = subscribeToMapChanges(map);
  Object.defineProperty(window, "scrollY", { value: 700, configurable: true });
  document.body.innerHTML = '<input aria-label="Search" />';
  document.querySelector("input").focus();
  notifyLiveChange(["locations"]);
  notifyLiveChange(["locations"]);
  await vi.advanceTimersByTimeAsync(300);
  expect(map).toHaveBeenCalledTimes(1);
  expect(page).not.toHaveBeenCalled();
  expect(document.activeElement.tagName).toBe("INPUT");
  expect(window.scrollY).toBe(700);
  stopMap();
  notifyLiveChange(["locations"]);
  await vi.advanceTimersByTimeAsync(300);
  expect(map).toHaveBeenCalledTimes(1);
});
it("defers a response that arrives after scrolling starts and a structural list change", async () => {
  Object.defineProperty(window, "scrollY", { value: 500, configurable: true });
  const committed = vi.fn();
  const response = deferLiveResult({ rows: [1] }, undefined, {
    version: -1,
    allowScrolled: false,
  }).then(committed);
  await vi.advanceTimersByTimeAsync(2000);
  expect(committed).not.toHaveBeenCalled();
  applyLiveUpdates();
  await response;
  expect(committed).toHaveBeenCalledWith({ rows: [1] });
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  const insertion = deferLiveResult(
    { rows: [1, 2] },
    undefined,
    { manual: false },
    true,
  );
  expect(getLiveState().pending).toBe(1);
  applyLiveUpdates();
  await insertion;
});
it("does not interrupt typing or move focus", async () => {
  document.body.innerHTML = '<input aria-label="Draft" />';
  const input = document.querySelector("input");
  input.focus();
  input.value = "Unsaved text";
  const refresh = vi.fn();
  unsubscribe = subscribeToLiveChanges(refresh);
  notifyLiveChange();
  await vi.advanceTimersByTimeAsync(1000);
  applyLiveUpdates();
  expect(refresh).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(input);
  expect(input.value).toBe("Unsaved text");
  input.blur();
  applyLiveUpdates();
  await vi.runAllTimersAsync();
  expect(refresh).toHaveBeenCalledTimes(1);
});
