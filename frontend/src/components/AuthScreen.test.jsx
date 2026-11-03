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

vi.mock("../api", () => ({ api: vi.fn(), csrf: vi.fn() }));
const user = { id: 1, name: "Customer", email: "customer@example.test" };
beforeEach(() => {
  vi.resetAllMocks();
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

it("sends an explicit remember preference and signs in through the ordinary form", async () => {
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
  complete({ user });
  await waitFor(() => expect(signedIn).toHaveBeenCalledWith(user));
});

it("leaves saved logins to the browser and preserves the remember preference", async () => {
  render(<AuthScreen onSignedIn={vi.fn()} />);
  expect(
    screen.queryByRole("button", { name: "Use a saved login" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText(/password manager can save/),
  ).not.toBeInTheDocument();
  fill();
  fireEvent.click(screen.getByLabelText("Remember me"));
  fireEvent.click(screen.getByRole("button", { name: "Sign in", exact: true }));
  await waitFor(() => expect(api).toHaveBeenCalled());
  expect(JSON.parse(api.mock.calls[0][1].body)).toMatchObject({
    remember: true,
    password: "Test-Password-123!",
  });
});

it("keeps native autofill attributes and shows failed authentication feedback", async () => {
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
});
