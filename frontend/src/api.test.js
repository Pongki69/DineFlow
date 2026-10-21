// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { api } from "./api";

afterEach(() => vi.unstubAllGlobals());

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
