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
import { RiderDispatchPanel } from "./RiderDispatchPanel";
import { MemoryRouter } from "react-router-dom";
import { api } from "../api";
import { subscribeRiderLocation } from "./riderLocationSession";

vi.mock("../api", () => ({ api: vi.fn() }));
vi.mock("../realtime", () => ({ privateEcho: () => null }));
let offers, profile, gps, gpsError;
const lease = "432a5207-fb5f-4a77-a571-456d428d373f";
beforeEach(() => {
  offers = [
    {
      id: 17,
      expires_at: new Date(Date.now() + 25000).toISOString(),
      order_number: "DF-OFFER",
      pickup: "Restaurant",
      destination: "Home",
      eta_minutes: 4,
    },
  ];
  profile = { user_id: 3, is_online: false };
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      watchPosition: vi.fn((success, failure) => {
        gps = success;
        gpsError = failure;
        return 9;
      }),
      clearWatch: vi.fn(),
    },
  });
  api.mockImplementation(async (path, options) => {
    if (path === "/rider/dispatch")
      return {
        server_time: new Date().toISOString(),
        profile,
        offers,
        enabled: true,
      };
    if (path === "/rider/presence") {
      profile = {
        ...profile,
        is_online: JSON.parse(options.body).is_online,
        located_at: new Date().toISOString(),
      };
      return { data: profile, presence_token: lease };
    }
    if (path.endsWith("/respond")) {
      offers = [];
      return { data: { id: 4 } };
    }
    throw new Error("Unexpected request");
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.getElementById("rider-presence-slot")?.remove();
  vi.clearAllMocks();
});

it("keeps the header status and GPS session when switching between rider pages", async () => {
  const slot = document.createElement("div");
  slot.id = "rider-presence-slot";
  document.body.append(slot);
  const view = render(<RiderDispatchPanel compact />, {
    wrapper: MemoryRouter,
  });
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Rider status: Offline. Go online",
    }),
  );
  await act(async () => {
    await gps({ coords: { latitude: 14.6, longitude: 120.98, accuracy: 10 } });
  });
  expect(
    screen.getByRole("button", { name: "Rider status: Online. Go offline" }),
  ).toBeEnabled();
  view.rerender(<RiderDispatchPanel compact={false} />);
  expect(
    screen.getByRole("button", { name: "Rider status: Online. Go offline" }),
  ).toBeVisible();
  expect(navigator.geolocation.watchPosition).toHaveBeenCalledOnce();
  act(() => window.dispatchEvent(new Event("offline")));
  expect(
    screen.getByRole("button", {
      name: "Rider status: No connection. Go offline",
    }),
  ).toBeDisabled();
});

it("explains that an offline rider cannot receive new offers without starting GPS", async () => {
  offers = [];
  render(<RiderDispatchPanel />, { wrapper: MemoryRouter });
  await screen.findByRole("heading", { name: "You're offline" });
  expect(
    screen.getByText(
      "Go online and allow location access to receive nearby delivery offers.",
    ),
  ).toBeVisible();
  expect(navigator.geolocation.watchPosition).not.toHaveBeenCalled();
});

it("shows GPS paused instead of claiming an old server session is online on this device", async () => {
  const slot = document.createElement("div");
  slot.id = "rider-presence-slot";
  document.body.append(slot);
  profile = {
    ...profile,
    is_online: true,
    located_at: new Date().toISOString(),
  };
  render(<RiderDispatchPanel compact />, { wrapper: MemoryRouter });
  expect(
    await screen.findByRole("button", {
      name: "Rider status: GPS paused. Go offline",
    }),
  ).toBeVisible();
  expect(navigator.geolocation.watchPosition).not.toHaveBeenCalled();
});

it("accepts the exact offered ID and refreshes assignments without GPS permission being requested on load", async () => {
  const accepted = vi.fn();
  render(<RiderDispatchPanel onAccepted={accepted} />, {
    wrapper: MemoryRouter,
  });
  fireEvent.click(
    await screen.findByRole("button", { name: "Accept delivery offer" }),
  );
  await waitFor(() => expect(accepted).toHaveBeenCalledOnce());
  expect(api.mock.calls).toContainEqual([
    "/rider/offers/17/respond",
    expect.objectContaining({ body: JSON.stringify({ response: "accept" }) }),
  ]);
  expect(navigator.geolocation.watchPosition).not.toHaveBeenCalled();
});

it("hides expired offers instead of allowing a late acceptance", async () => {
  offers[0].expires_at = new Date(Date.now() - 5000).toISOString();
  render(<RiderDispatchPanel />);
  await screen.findByRole("heading", { name: "You're offline" });
  expect(
    screen.queryByRole("button", { name: "Accept delivery offer" }),
  ).not.toBeInTheDocument();
});

it("shares GPS only after an explicit online action and clears the watcher when going offline", async () => {
  render(<RiderDispatchPanel />);
  fireEvent.click(await screen.findByRole("button", { name: "Go online" }));
  await act(async () => {
    await gps({ coords: { latitude: 14.6, longitude: 120.98, accuracy: 10 } });
  });
  expect(
    screen.getByRole("status", { name: "Rider availability" }),
  ).toHaveTextContent("Online · location is up to date");
  const presence = api.mock.calls.find(([path]) => path === "/rider/presence");
  expect(JSON.parse(presence[1].body)).toMatchObject({
    is_online: true,
    start: true,
    accuracy_meters: 10,
  });
  fireEvent.click(screen.getByRole("button", { name: "Go offline" }));
  await waitFor(() =>
    expect(navigator.geolocation.clearWatch).toHaveBeenCalledWith(9),
  );
  expect(api.mock.calls).toContainEqual([
    "/rider/presence",
    expect.objectContaining({ body: JSON.stringify({ is_online: false }) }),
  ]);
});

it("explains denied GPS access without sending online coordinates", async () => {
  render(<RiderDispatchPanel />);
  fireEvent.click(await screen.findByRole("button", { name: "Go online" }));
  act(() => {
    gpsError({ code: 1 });
  });
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Location permission denied",
  );
  expect(api.mock.calls.some(([path]) => path === "/rider/presence")).toBe(
    false,
  );
});

it("stops availability sharing without disabling an explicitly enabled local map", async () => {
  const localMap = vi.fn();
  const stopMap = subscribeRiderLocation(
    navigator.geolocation,
    localMap,
    vi.fn(),
  );
  render(<RiderDispatchPanel />);
  fireEvent.click(await screen.findByRole("button", { name: "Go online" }));
  expect(navigator.geolocation.watchPosition).toHaveBeenCalledOnce();
  await act(async () => {
    gps({ coords: { latitude: 14.6, longitude: 120.98, accuracy: 10 } });
  });
  fireEvent.click(screen.getByRole("button", { name: "Go offline" }));
  await screen.findByRole("button", { name: "Go online" });
  expect(navigator.geolocation.clearWatch).not.toHaveBeenCalled();
  api.mockClear();
  await act(async () => {
    gps({ coords: { latitude: 14.61, longitude: 120.99, accuracy: 10 } });
  });
  expect(localMap).toHaveBeenCalledTimes(2);
  expect(api.mock.calls.some(([path]) => path === "/rider/presence")).toBe(
    false,
  );
  stopMap();
  expect(navigator.geolocation.clearWatch).toHaveBeenCalledOnce();
});

it("queues new offers without moving the focused card until Show new offers is clicked", async () => {
  render(<RiderDispatchPanel />, { wrapper: MemoryRouter });
  const accept = await screen.findByRole("button", {
    name: "Accept delivery offer",
  });
  const card = screen.getByRole("article", { name: "Delivery offer DF-OFFER" });
  accept.focus();
  const extra = { ...offers[0], id: 18, order_number: "DF-NEW" };
  offers = [extra, offers[0]];
  await act(async () => window.dispatchEvent(new Event("online")));
  expect(screen.getByText("1 new offer available")).toBeVisible();
  expect(screen.queryByText("Order DF-NEW")).not.toBeInTheDocument();
  expect(screen.getByRole("article", { name: "Delivery offer DF-OFFER" })).toBe(
    card,
  );
  expect(document.activeElement).toBe(accept);
  fireEvent.click(screen.getByRole("button", { name: "Show new offers" }));
  expect(
    screen
      .getAllByRole("article")
      .map((node) => node.getAttribute("aria-label")),
  ).toEqual(["Delivery offer DF-OFFER", "Delivery offer DF-NEW"]);
});

it("leaves an expired card in place with disabled actions until the rider refreshes", async () => {
  vi.useFakeTimers();
  offers[0].expires_at = new Date(Date.now() + 2000).toISOString();
  render(<RiderDispatchPanel />, { wrapper: MemoryRouter });
  await act(async () => {});
  const card = screen.getByRole("article");
  act(() => vi.advanceTimersByTime(3000));
  expect(screen.getByText("Expired")).toBeVisible();
  expect(screen.getByRole("article")).toBe(card);
  expect(
    screen.getByRole("button", { name: "Accept delivery offer" }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Refresh list" }));
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
});

it("blocks repeat acceptance and keeps the pending card through background updates", async () => {
  const originalApi = api.getMockImplementation();
  let finish;
  api.mockImplementation((path, options) =>
    path.endsWith("/respond")
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : originalApi(path, options),
  );
  render(<RiderDispatchPanel />, { wrapper: MemoryRouter });
  const accept = await screen.findByRole("button", {
    name: "Accept delivery offer",
  });
  const card = screen.getByRole("article");
  fireEvent.click(accept);
  fireEvent.click(accept);
  offers = [{ ...offers[0], id: 18, order_number: "DF-NEW" }];
  await act(async () => window.dispatchEvent(new Event("online")));
  expect(screen.getByRole("article")).toBe(card);
  expect(screen.getByText("Processing…")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Show new offers" }),
  ).toBeDisabled();
  expect(
    api.mock.calls.filter(([path]) => path.endsWith("/respond")),
  ).toHaveLength(1);
  await act(async () => finish({ data: { id: 4 } }));
  expect(screen.getByRole("article")).toBe(card);
  expect(
    screen.getByRole("link", { name: "View my deliveries" }),
  ).toBeVisible();
});

it("reconnects stale GPS directly without taking the rider offline", async () => {
  profile = {
    user_id: 3,
    is_online: true,
    located_at: new Date(Date.now() - 120000).toISOString(),
  };
  render(
    <MemoryRouter>
      <div id="rider-presence-slot" />
      <RiderDispatchPanel compact headerOnly />
    </MemoryRouter>,
  );
  const reconnect = await screen.findByRole("button", {
    name: "Reconnect GPS",
  });
  fireEvent.click(reconnect);
  await act(async () =>
    gps({ coords: { latitude: 14.18, longitude: 121.23, accuracy: 10 } }),
  );
  const writes = api.mock.calls
    .filter(([path]) => path === "/rider/presence")
    .map(([, options]) => JSON.parse(options.body));
  expect(writes.some((body) => body.is_online && body.start)).toBe(true);
  expect(writes.some((body) => body.is_online === false)).toBe(false);
});
