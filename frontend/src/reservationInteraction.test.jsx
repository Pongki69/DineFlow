// @vitest-environment jsdom
import React from "react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { ReservationBooking } from "./Reservations";
import { api } from "./api";
const resumePov = vi.hoisted(() => vi.fn());

vi.mock("./api", () => ({ api: vi.fn() }));
vi.mock("./realtime", () => ({ subscribeToFloorChanges: () => () => {} }));
vi.mock("./FloorScene", () => ({
  FloorScene: ({ onInteract, bookingOverlay, resumeControls }) => {
    React.useImperativeHandle(resumeControls, () => ({ resume: resumePov }));
    return (
      <div data-testid="fullscreen-scene">
        <button onClick={() => onInteract(7)}>Interact available</button>
        <button onClick={() => onInteract(8)}>Interact unavailable</button>
        {bookingOverlay}
      </div>
    );
  },
}));

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  api.mockImplementation(async (path, options) => {
    if (path === "/floor-plan/floors")
      return { data: [{ id: 1, name: "Main floor", objects: [] }] };
    if (path.startsWith("/reservations/availability"))
      return {
        data: [
          { id: 7, table_number: "T7", capacity: 4, available: true },
          { id: 8, table_number: "T8", capacity: 4, available: false },
          { id: 9, table_number: "T9", capacity: 4, available: true },
        ],
      };
    if (path === "/reservations" && options?.method === "POST")
      return {
        data: {
          id: 1,
          reference: "BOOK-1",
          status: "confirmed",
          tables: [{ table_number: "T7" }],
        },
      };
    throw new Error(`Unexpected request: ${path}`);
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

async function openScene() {
  render(
    <ReservationBooking
      user={{ name: "Test Guest", email: "guest@example.test" }}
    />,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "3D view", exact: true }),
  );
  await screen.findByRole("button", { name: "Interact available" });
}

it("opens the booking modal for a table and books only after explicit confirmation", async () => {
  await openScene();
  fireEvent.click(screen.getByRole("button", { name: "Interact available" }));
  const dialog = await screen.findByRole("dialog", { name: "Confirm T7" });
  expect(screen.getByTestId("fullscreen-scene").contains(dialog)).toBe(true);
  expect(within(dialog).getByLabelText("Name").value).toBe("Test Guest");
  expect(
    api.mock.calls.some(
      ([path, options]) =>
        path === "/reservations" && options?.method === "POST",
    ),
  ).toBe(false);
  fireEvent.submit(
    within(dialog)
      .getByRole("button", { name: "Confirm reservation" })
      .closest("form"),
  );
  await screen.findByText(/Reservation BOOK-1/);
  const [, request] = api.mock.calls.find(
    ([path, options]) => path === "/reservations" && options?.method === "POST",
  );
  expect(JSON.parse(request.body)).toMatchObject({
    table_ids: [7],
    guest_name: "Test Guest",
    guest_count: 2,
  });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

it("rejects unavailable interaction and lets the guest close without booking", async () => {
  await openScene();
  fireEvent.click(screen.getByRole("button", { name: "Interact unavailable" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Interact available" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Close booking dialog" }),
  );
  expect(resumePov).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(
    screen.getByRole("button", { name: /T7/ }).getAttribute("aria-pressed"),
  ).toBe("false");
  expect(
    api.mock.calls.some(
      ([path, options]) =>
        path === "/reservations" && options?.method === "POST",
    ),
  ).toBe(false);
});

it("keeps the POV booking choice separate from normal multi-selection and discards it on close", async () => {
  await openScene();
  fireEvent.click(screen.getByRole("button", { name: /T9/ }));
  fireEvent.click(screen.getByRole("button", { name: "Interact available" }));
  const dialog = await screen.findByRole("dialog", { name: "Confirm T7" });
  expect(within(dialog).getByText(/4 combined seats/)).toBeTruthy();
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Close booking dialog" }),
  );
  expect(
    screen.getByRole("button", { name: /T7/ }).getAttribute("aria-pressed"),
  ).toBe("false");
  expect(
    screen.getByRole("button", { name: /T9/ }).getAttribute("aria-pressed"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Interact available" }));
  const reopened = await screen.findByRole("dialog", { name: "Confirm T7" });
  fireEvent.submit(
    within(reopened)
      .getByRole("button", { name: "Confirm reservation" })
      .closest("form"),
  );
  await screen.findByText(/Reservation BOOK-1/);
  const [, request] = api.mock.calls.find(
    ([path, options]) => path === "/reservations" && options?.method === "POST",
  );
  expect(JSON.parse(request.body).table_ids).toEqual([7]);
});

it("blocks confirmation when the chosen seats do not cover the party", async () => {
  await openScene();
  fireEvent.change(screen.getByRole("spinbutton", { name: "Guests" }), {
    target: { value: "6" },
  });
  await screen.findByRole("button", { name: /T7/ });
  fireEvent.click(screen.getByRole("button", { name: "Interact available" }));
  const dialog = await screen.findByRole("dialog");
  expect(
    within(dialog).getByRole("button", { name: "Confirm reservation" })
      .disabled,
  ).toBe(true);
  expect(within(dialog).getByRole("status").textContent).toContain(
    "choose more tables",
  );
});
