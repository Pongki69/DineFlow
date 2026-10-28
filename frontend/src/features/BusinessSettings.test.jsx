// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { BusinessSettings } from "./BusinessSettings";
import { api } from "../api";

vi.mock("../api", () => ({ api: vi.fn() }));
const response = {
  data: {
    business_profile: {
      restaurant_name: "DineFlow",
      timezone: "Asia/Manila",
      brand_color: "#2e5a43",
      notifications_enabled: true,
    },
    tax_percent: 12,
    service_charge_percent: 5,
  },
};
beforeEach(() => api.mockReset());
afterEach(() => cleanup());
function show() {
  return render(
    <MemoryRouter initialEntries={["/admin/system-settings"]}>
      <BusinessSettings />
    </MemoryRouter>,
  );
}

it("explains the disabled save action and lets administrators discard drafts", async () => {
  api.mockResolvedValue(response);
  show();
  await screen.findByDisplayValue("DineFlow");
  const save = screen.getByRole("button", { name: "Save business settings" });
  expect(save).toBeDisabled();
  expect(save.closest("footer")).toHaveAttribute("data-pinned", "false");
  expect(save).toHaveAccessibleDescription("Change a field to enable saving.");
  fireEvent.change(screen.getByLabelText("Restaurant name"), {
    target: { value: "New restaurant name" },
  });
  expect(save).toBeEnabled();
  expect(save.closest("footer")).toHaveAttribute("data-pinned", "true");
  fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
  expect(screen.getByLabelText("Restaurant name")).toHaveValue("DineFlow");
  expect(save).toBeDisabled();
  expect(save.closest("footer")).toHaveAttribute("data-pinned", "false");
  expect(
    screen.getByRole("link", { name: /Delivery settings/ }),
  ).toHaveAttribute("href", "/admin/delivery");
  expect(
    screen.getByRole("link", { name: /Reservation settings/ }),
  ).toHaveAttribute("href", "/admin/settings");
  expect(
    screen.getByRole("link", { name: /Payment settings/ }),
  ).toHaveAttribute("href", "/admin/payment-settings");
});

it("locks duplicate saves and submits typed pricing and notification values", async () => {
  let finish;
  api.mockImplementation((path, options) =>
    options?.method === "PUT"
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : Promise.resolve(response),
  );
  show();
  await screen.findByDisplayValue("DineFlow");
  fireEvent.change(screen.getByLabelText("Tax rate (%)"), {
    target: { value: "8.25" },
  });
  fireEvent.click(
    screen.getByRole("checkbox", { name: /Enable operational notifications/ }),
  );
  const form = screen
    .getByRole("button", { name: "Save business settings" })
    .closest("form");
  fireEvent.submit(form);
  fireEvent.submit(form);
  const writes = api.mock.calls.filter(
    ([, options]) => options?.method === "PUT",
  );
  expect(writes).toHaveLength(1);
  expect(JSON.parse(writes[0][1].body)).toMatchObject({
    tax_percent: 8.25,
    service_charge_percent: 5,
    notifications_enabled: false,
  });
  expect(
    screen.getByRole("button", { name: "Saving business settings…" }),
  ).toBeDisabled();
  await act(async () =>
    finish({
      data: {
        ...response.data,
        tax_percent: 8.25,
        business_profile: {
          ...response.data.business_profile,
          notifications_enabled: false,
        },
      },
    }),
  );
  expect(await screen.findByText(/Business settings saved\./)).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Save business settings" }),
  ).toBeDisabled();
});

it("keeps editable draft values when the server rejects a save", async () => {
  api.mockImplementation((path, options) =>
    options?.method === "PUT"
      ? Promise.reject(new Error("The settings could not be saved."))
      : Promise.resolve(response),
  );
  show();
  await screen.findByDisplayValue("DineFlow");
  fireEvent.change(screen.getByLabelText("Restaurant name"), {
    target: { value: "Keep my draft" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Save business settings" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The settings could not be saved.",
  );
  expect(screen.getByLabelText("Restaurant name")).toHaveValue("Keep my draft");
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Save business settings" }),
    ).toBeEnabled(),
  );
});

it("retries a failed initial settings request", async () => {
  api
    .mockRejectedValueOnce(new Error("Could not connect."))
    .mockResolvedValue(response);
  show();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not connect.",
  );
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByDisplayValue("DineFlow")).toBeVisible();
});
