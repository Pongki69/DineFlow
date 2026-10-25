// @vitest-environment jsdom
import React from "react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ConfirmProvider, usePrompt } from "./ConfirmProvider";
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function () {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function () {
      this.removeAttribute("open");
    },
  });
});
afterEach(() => {
  cleanup();
  delete HTMLDialogElement.prototype.showModal;
  delete HTMLDialogElement.prototype.close;
  vi.restoreAllMocks();
});
function Prompt({ onResult }) {
  const ask = usePrompt();
  return (
    <button
      onClick={async () =>
        onResult(
          await ask("Restore delivery?", "", {
            description: "Check the original rider and order before restoring.",
            label: "Recovery reason",
            confirmLabel: "Restore delivery",
            confirmationLabel: "I confirmed the order is with the same rider",
            required: true,
            minLength: 3,
            multiline: true,
          }),
        )
      }
    >
      Review recovery
    </button>
  );
}
it("requires a reason and explicit custody confirmation before browser submission", async () => {
  const result = vi.fn();
  render(
    <ConfirmProvider>
      <Prompt onResult={result} />
    </ConfirmProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Review recovery" }));
  const reason = await screen.findByRole("textbox", {
    name: "Recovery reason",
  });
  const form = reason.closest("form");
  expect(form.checkValidity()).toBe(false);
  fireEvent.change(reason, {
    target: { value: "Rider and store confirmed continuation" },
  });
  expect(form.checkValidity()).toBe(false);
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: "I confirmed the order is with the same rider",
    }),
  );
  expect(form.checkValidity()).toBe(true);
  fireEvent.submit(form);
  await waitFor(() =>
    expect(result).toHaveBeenCalledWith(
      "Rider and store confirmed continuation",
    ),
  );
});
it("cancelling returns null without requiring form fields", async () => {
  const result = vi.fn();
  render(
    <ConfirmProvider>
      <Prompt onResult={result} />
    </ConfirmProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Review recovery" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Cancel", exact: true }),
  );
  await waitFor(() => expect(result).toHaveBeenCalledWith(null));
});
