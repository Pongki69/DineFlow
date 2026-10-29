// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DeleteCustomerAccount } from "./DeleteCustomerAccount";
import { api } from "../api";
import { saveCart } from "../savedCart";

vi.mock("../api", () => ({ api: vi.fn() }));
vi.mock("../savedCart", () => ({ saveCart: vi.fn() }));
const customer = { id: 7, roles: ["customer"] };
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
  vi.restoreAllMocks();
  vi.clearAllMocks();
  delete HTMLDialogElement.prototype.showModal;
  delete HTMLDialogElement.prototype.close;
});

it("hides account deletion for staff and mixed roles", () => {
  const { rerender } = render(
    <DeleteCustomerAccount
      user={{ ...customer, roles: ["rider"] }}
      onDeleted={vi.fn()}
    />,
  );
  expect(
    screen.queryByRole("button", { name: "Delete my account" }),
  ).toBeNull();
  rerender(
    <DeleteCustomerAccount
      user={{ ...customer, roles: ["customer", "administrator"] }}
      onDeleted={vi.fn()}
    />,
  );
  expect(
    screen.queryByRole("button", { name: "Delete my account" }),
  ).toBeNull();
});

it("requires password and acknowledgement, prevents duplicate deletion, and clears the saved cart after success", async () => {
  let finish;
  api.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const deleted = vi.fn();
  render(<DeleteCustomerAccount user={customer} onDeleted={deleted} />);
  fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));
  const button = screen.getByRole("button", {
    name: "Permanently delete account",
  });
  expect(button.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Current password"), {
    target: { value: "Current-Password-123!" },
  });
  expect(button.disabled).toBe(true);
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(button);
  fireEvent.submit(button.closest("form"));
  expect(api).toHaveBeenCalledTimes(1);
  expect(api).toHaveBeenCalledWith("/me", {
    method: "DELETE",
    body: JSON.stringify({
      current_password: "Current-Password-123!",
      confirmation: true,
    }),
  });
  await act(async () => finish({ message: "Deleted" }));
  expect(deleted).toHaveBeenCalledOnce();
  expect(saveCart).toHaveBeenCalledWith(customer.id, []);
});

it("keeps the account after failure, clears the password, and lets the customer cancel", async () => {
  api.mockRejectedValue({
    message: "Blocked",
    errors: { account: ["Finish active orders first."] },
  });
  const deleted = vi.fn();
  render(<DeleteCustomerAccount user={customer} onDeleted={deleted} />);
  const trigger = screen.getByRole("button", { name: "Delete my account" });
  fireEvent.click(trigger);
  fireEvent.change(screen.getByLabelText("Current password"), {
    target: { value: "Current-Password-123!" },
  });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(
    screen.getByRole("button", { name: "Permanently delete account" }),
  );
  await screen.findByText("Finish active orders first.");
  expect(screen.getByLabelText("Current password").value).toBe("");
  expect(deleted).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Keep my account" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(document.activeElement).toBe(trigger);
});
