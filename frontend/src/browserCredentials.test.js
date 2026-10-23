// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  getSavedLogin,
  offerToSaveLogin,
  supportsSavedLogins,
} from "./browserCredentials";

afterEach(() => vi.unstubAllGlobals());

function browser(store = vi.fn().mockResolvedValue(undefined)) {
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("PasswordCredential", function (values) {
    Object.assign(this, values, { type: "password" });
  });
  const credentials = { store, get: vi.fn().mockResolvedValue(null) };
  vi.stubGlobal("navigator", { credentials });
  return credentials;
}

it("offers credentials to the browser rather than web storage", async () => {
  const credentials = browser();
  const local = vi.spyOn(Storage.prototype, "setItem");
  await offerToSaveLogin({
    email: "customer@example.test",
    password: "Test-Password-123!",
    name: "Customer",
  });
  expect(credentials.store).toHaveBeenCalledWith(
    expect.objectContaining({
      id: "customer@example.test",
      type: "password",
      name: "Customer",
    }),
  );
  expect(local).not.toHaveBeenCalled();
  local.mockRestore();
});

it("requires a user-mediated password chooser and handles cancellation", async () => {
  const credentials = browser();
  await expect(getSavedLogin()).resolves.toBeNull();
  expect(credentials.get).toHaveBeenCalledWith({
    password: true,
    mediation: "required",
  });
  credentials.get.mockRejectedValue(
    new DOMException("Dismissed", "NotAllowedError"),
  );
  await expect(getSavedLogin()).resolves.toBeNull();
});

it("falls back cleanly when browser support or secure context is unavailable", async () => {
  const credentials = browser();
  vi.stubGlobal("isSecureContext", false);
  expect(supportsSavedLogins()).toBe(false);
  await expect(
    offerToSaveLogin({ email: "customer@example.test", password: "test" }),
  ).resolves.toBe(false);
  expect(credentials.store).not.toHaveBeenCalled();
});

it("does not turn a blocked save request into an authentication failure", async () => {
  browser(
    vi.fn().mockRejectedValue(new DOMException("Blocked", "NotAllowedError")),
  );
  await expect(
    offerToSaveLogin({ email: "customer@example.test", password: "test" }),
  ).resolves.toBe(false);
});
