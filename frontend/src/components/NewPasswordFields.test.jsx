// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NewPasswordFields } from "./NewPasswordFields";
import { validateNewPasswordForm } from "./passwordValidation";

afterEach(cleanup);
function setup(optional = false) {
  const submit = vi.fn();
  render(
    <form
      aria-label="Password test"
      onSubmit={(event) => {
        event.preventDefault();
        if (validateNewPasswordForm(event.currentTarget, { optional }))
          submit();
      }}
    >
      <NewPasswordFields optional={optional} />
      <button>Save</button>
      <button type="reset">Reset</button>
    </form>,
  );
  return {
    submit,
    password: screen.getByLabelText("Password", { exact: true }),
    confirmation: screen.getByLabelText("Confirm password", { exact: true }),
    form: screen.getByRole("form", { name: "Password test" }),
  };
}
it("updates missing rules and blocks a matching password that still lacks a symbol", () => {
  const { password, confirmation, form, submit } = setup();
  fireEvent.change(password, { target: { value: "LongPassword123" } });
  fireEvent.change(confirmation, { target: { value: "LongPassword123" } });
  expect(screen.getByText(/Password still needs: a symbol/)).toBeVisible();
  expect(screen.getByText("Passwords match.")).toBeVisible();
  expect(password).toHaveAttribute("aria-invalid", "true");
  fireEvent.submit(form);
  expect(submit).not.toHaveBeenCalled();
});
it("reports mismatches immediately, rechecks after edits, and submits only a valid matching pair", () => {
  const { password, confirmation, form, submit } = setup();
  fireEvent.change(password, { target: { value: "LongPassword123!" } });
  fireEvent.change(confirmation, {
    target: { value: "DifferentPassword123!" },
  });
  expect(screen.getByText("Passwords do not match.")).toBeVisible();
  expect(confirmation).toHaveAttribute("aria-invalid", "true");
  fireEvent.submit(form);
  expect(submit).not.toHaveBeenCalled();
  fireEvent.change(confirmation, { target: { value: "LongPassword123!" } });
  expect(screen.getByText("Passwords match.")).toBeVisible();
  fireEvent.change(password, { target: { value: "LongPassword123!!" } });
  expect(screen.getByText("Passwords do not match.")).toBeVisible();
  fireEvent.change(confirmation, { target: { value: "LongPassword123!!" } });
  fireEvent.submit(form);
  expect(submit).toHaveBeenCalledTimes(1);
});
it("allows blank optional fields and resets validation and password visibility with the form", () => {
  const { password, confirmation, form, submit } = setup(true);
  fireEvent.submit(form);
  expect(submit).toHaveBeenCalledTimes(1);
  fireEvent.change(confirmation, { target: { value: "OnlyConfirmation123!" } });
  fireEvent.submit(form);
  expect(submit).toHaveBeenCalledTimes(1);
  fireEvent.click(
    screen.getByRole("button", { name: "Show new password and confirmation" }),
  );
  expect(password).toHaveAttribute("type", "text");
  fireEvent.click(screen.getByRole("button", { name: "Reset", exact: true }));
  expect(password).toHaveValue("");
  expect(confirmation).toHaveValue("");
  expect(password).toHaveAttribute("type", "password");
  expect(screen.queryByText("Passwords do not match.")).toBeNull();
  fireEvent.submit(form);
  expect(submit).toHaveBeenCalledTimes(2);
});
it("validates autofilled DOM values again at submission", () => {
  const { password, confirmation, form, submit } = setup();
  password.value = "AutofilledPassword123!";
  confirmation.value = "WrongAutofill123!";
  fireEvent.submit(form);
  expect(submit).not.toHaveBeenCalled();
  expect(confirmation.validationMessage).toBe("Passwords do not match.");
  confirmation.value = password.value;
  fireEvent.submit(form);
  expect(submit).toHaveBeenCalledOnce();
});
