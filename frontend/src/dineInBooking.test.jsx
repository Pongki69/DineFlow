// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DineInBooking } from "./components/DineInBooking";
import { api } from "./api";

vi.mock("./api", () => ({ api: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("submits the selected reservation reference and identifies bookings awaiting seating", async () => {
  api.mockResolvedValue({
    data: [
      {
        reference: "RSV-READY",
        table_number: "T1",
        starts_at: "2026-10-22T10:00:00Z",
        status: "seated",
        ready: true,
      },
      {
        reference: "RSV-WAIT",
        table_number: "T2",
        starts_at: "2026-10-22T10:00:00Z",
        status: "checked_in",
        ready: false,
      },
    ],
  });
  render(
    <form data-testid="checkout">
      <DineInBooking />
    </form>,
  );
  expect(
    (await screen.findByRole("radio", { name: /RSV-WAIT/ })).disabled,
  ).toBe(false);
  fireEvent.click(screen.getByRole("radio", { name: /RSV-WAIT/ }));
  expect(screen.getByRole("status").textContent).toContain(
    "Waiting to be seated",
  );
  expect(new FormData(screen.getByTestId("checkout")).get("table_code")).toBe(
    "RSV-WAIT",
  );
  fireEvent.click(screen.getByRole("radio", { name: /RSV-READY/ }));
  expect(new FormData(screen.getByTestId("checkout")).get("table_code")).toBe(
    "RSV-READY",
  );
  expect(screen.queryByLabelText("Reservation or table code")).toBeNull();
});

it("refreshes booking readiness after staff seats the guest", async () => {
  const booking = {
    reference: "RSV-1",
    table_number: "T1",
    starts_at: "2026-10-22T10:00:00Z",
    status: "checked_in",
    ready: false,
  };
  api.mockResolvedValueOnce({ data: [booking] }).mockResolvedValueOnce({
    data: [{ ...booking, status: "seated", ready: true }],
  });
  const onReadyChange = vi.fn();
  render(<DineInBooking onReadyChange={onReadyChange} />);
  expect((await screen.findByRole("radio", { name: /RSV-1/ })).disabled).toBe(
    false,
  );
  fireEvent.click(screen.getByRole("radio", { name: /RSV-1/ }));
  expect(onReadyChange).toHaveBeenLastCalledWith(false);
  fireEvent.click(screen.getByRole("button", { name: "Refresh reservations" }));
  expect(
    (await screen.findByRole("radio", { name: /Ready to order/ })).disabled,
  ).toBe(false);
  expect(onReadyChange).toHaveBeenLastCalledWith(true);
});

it("offers manual codes and retry when the reservation lookup fails", async () => {
  api
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValueOnce({ data: [] });
  render(
    <form data-testid="checkout">
      <DineInBooking />
    </form>,
  );
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("radio", { name: "Enter a code instead" }));
  fireEvent.change(screen.getByLabelText("Reservation or table code"), {
    target: { value: "RSV-ENTERED" },
  });
  expect(
    new FormData(screen.getByTestId("checkout")).getAll("table_code"),
  ).toEqual(["RSV-ENTERED"]);
  fireEvent.click(screen.getByRole("button", { name: "Refresh reservations" }));
  await screen.findByText(/No active bookings/);
});
