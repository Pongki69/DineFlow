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
import { AuthScreen } from "./AuthScreen";
import { api, csrf } from "../api";
import {
  getSavedLogin,
  offerToSaveLogin,
  supportsSavedLogins,
} from "../browserCredentials";

vi.mock("../api", () => ({ api: vi.fn(), csrf: vi.fn() }));
vi.mock("../browserCredentials", () => ({
  getSavedLogin: vi.fn(),
  offerToSaveLogin: vi.fn(),
  supportsSavedLogins: vi.fn(),
}));
const user = { id: 1, name: "Customer", email: "customer@example.test" };
beforeEach(() => {
  vi.resetAllMocks();
  supportsSavedLogins.mockReturnValue(true);
  offerToSaveLogin.mockResolvedValue(true);
  csrf.mockResolvedValue(undefined);
  api.mockResolvedValue({ user });
});
afterEach(cleanup);

function fill() {
  fireEvent.change(screen.getByLabelText("Email", { exact: true }), {
    target: { value: user.email },
  });
  fireEvent.change(screen.getByLabelText("Password", { exact: true }), {
    target: { value: "Test-Password-123!" },
  });
}

it("sends an explicit remember preference and offers saving only after authentication", async () => {
  let complete;
  api.mockReturnValue(
    new Promise((resolve) => {
      complete = resolve;
    }),
  );
  const signedIn = vi.fn();
  render(<AuthScreen onSignedIn={signedIn} />);
  fill();
  expect(screen.getByLabelText("Remember me")).not.toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Sign in", exact: true }));
  await waitFor(() => expect(api).toHaveBeenCalled());
  expect(JSON.parse(api.mock.calls[0][1].body).remember).toBe(false);
  expect(offerToSaveLogin).not.toHaveBeenCalled();
  complete({ user });
  await waitFor(() => expect(signedIn).toHaveBeenCalledWith(user));
  expect(offerToSaveLogin).toHaveBeenCalledWith(
    expect.objectContaining({ email: user.email }),
  );
});

it("fills a chosen login without submitting and preserves the device preference", async () => {
  getSavedLogin.mockResolvedValue({
    type: "password",
    id: user.email,
    password: "Saved-Password-123!",
  });
  render(<AuthScreen onSignedIn={vi.fn()} />);
  fireEvent.click(screen.getByLabelText("Remember me"));
  fireEvent.click(screen.getByRole("button", { name: "Use a saved login" }));
  await waitFor(() =>
    expect(screen.getByLabelText("Email", { exact: true })).toHaveValue(
      user.email,
    ),
  );
  expect(api).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Remember me")).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Sign in", exact: true }));
  await waitFor(() => expect(api).toHaveBeenCalled());
  expect(JSON.parse(api.mock.calls[0][1].body)).toMatchObject({
    remember: true,
    password: "Saved-Password-123!",
  });
});

it("never saves failed credentials and supports ordinary autofill without the chooser API", async () => {
  supportsSavedLogins.mockReturnValue(false);
  api.mockRejectedValue(new Error("Incorrect credentials."));
  render(<AuthScreen onSignedIn={vi.fn()} />);
  fill();
  expect(
    screen.queryByRole("button", { name: "Use a saved login" }),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("Email", { exact: true })).toHaveAttribute(
    "autocomplete",
    "username",
  );
  expect(screen.getByLabelText("Password", { exact: true })).toHaveAttribute(
    "autocomplete",
    "current-password",
  );
  fireEvent.click(screen.getByRole("button", { name: "Sign in", exact: true }));
  await screen.findByRole("alert");
  expect(offerToSaveLogin).not.toHaveBeenCalled();
});
