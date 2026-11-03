// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { api } from "./api";
import { applyLiveUpdates, getLiveState, runLiveRequest } from "./liveUpdates";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("keeps map snapshots outside the page's protected list version", async () => {
  vi.useFakeTimers();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: 1 }] }),
    })
    .mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: 1 }, { id: 2 }] }),
    });
  vi.stubGlobal("fetch", fetch);
  await api("/map-cache-isolation");
  await api("/map-cache-isolation", { mapSnapshot: true });
  expect(fetch.mock.calls[1][1].mapSnapshot).toBeUndefined();
  let applied = false;
  const result = runLiveRequest(() => api("/map-cache-isolation")).then(() => {
    applied = true;
  });
  await vi.advanceTimersByTimeAsync(0);
  expect(applied).toBe(false);
  expect(getLiveState().pending).toBeGreaterThan(0);
  applyLiveUpdates();
  await result;
  expect(applied).toBe(true);
});

it("reuses the submission key after a network failure and starts a fresh submission after success", async () => {
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new TypeError("Connection lost"))
    .mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ data: { id: 1 } }),
    });
  vi.stubGlobal("fetch", fetch);
  const options = {
    method: "POST",
    body: JSON.stringify({ order_type: "pickup" }),
  };
  await expect(api("/orders", options)).rejects.toThrow("Connection lost");
  await api("/orders", options);
  await api("/orders", options);
  expect(fetch.mock.calls[0][1].headers["Idempotency-Key"]).toBe(
    fetch.mock.calls[1][1].headers["Idempotency-Key"],
  );
  expect(fetch.mock.calls[2][1].headers["Idempotency-Key"]).not.toBe(
    fetch.mock.calls[1][1].headers["Idempotency-Key"],
  );
});

it("preserves validation errors and session failures for the calling screen", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        code: "validation_failed",
        message: "Review the form.",
        errors: { name: ["Required."] },
      }),
    }),
  );
  await expect(api("/me", { method: "PATCH" })).rejects.toMatchObject({
    status: 422,
    code: "validation_failed",
    errors: { name: ["Required."] },
  });
});

it("bounds a stalled request without retrying a mutation", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn(() => new Promise(() => {}));
  vi.stubGlobal("fetch", fetch);
  const failure = api("/rider/deliveries/12/status", {
    method: "PATCH",
    body: JSON.stringify({ status: "delivered" }),
    timeoutMs: 50,
  }).catch((error) => error);
  await vi.advanceTimersByTimeAsync(50);
  expect(await failure).toMatchObject({
    name: "TimeoutError",
    code: "request_timeout",
    uncertain: true,
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  expect(fetch.mock.calls[0][1].timeoutMs).toBeUndefined();
});

it("keeps the timeout active while a response body is stalled", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => new Promise(() => {}),
    }),
  );
  const failure = api("/rider/summary", { timeoutMs: 50 }).catch(
    (error) => error,
  );
  await vi.advanceTimersByTimeAsync(50);
  expect(await failure).toMatchObject({
    name: "TimeoutError",
    uncertain: false,
  });
});

it("preserves caller cancellation and cleans up its timer", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn(() => new Promise(() => {}));
  vi.stubGlobal("fetch", fetch);
  const controller = new AbortController();
  const failure = api("/rider/summary", { signal: controller.signal }).catch(
    (error) => error,
  );
  controller.abort();
  expect(await failure).toMatchObject({ name: "AbortError" });
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it("does not start a request when its caller already cancelled it", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const controller = new AbortController();
  controller.abort();
  await expect(
    api("/rider/summary", { signal: controller.signal }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(fetch).not.toHaveBeenCalled();
});

it("keeps a protected submission key after a timed-out response body", async () => {
  vi.useFakeTimers();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: () => new Promise(() => {}),
    })
    .mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ data: { id: 42 } }),
    });
  vi.stubGlobal("fetch", fetch);
  const options = {
    method: "POST",
    body: JSON.stringify({
      order_type: "takeaway",
      notes: "timeout-key-check",
    }),
    timeoutMs: 50,
  };
  const failure = api("/orders", options).catch((error) => error);
  await vi.advanceTimersByTimeAsync(50);
  expect((await failure).code).toBe("request_timeout");
  await api("/orders", options);
  expect(fetch.mock.calls[1][1].headers["Idempotency-Key"]).toBe(
    fetch.mock.calls[0][1].headers["Idempotency-Key"],
  );
});
