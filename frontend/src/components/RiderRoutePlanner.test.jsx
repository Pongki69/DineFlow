// @vitest-environment jsdom
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RiderRoutePlanner } from "./RiderRoutePlanner";
import { api } from "../api";

vi.mock("../api", () => ({ api: vi.fn() }));
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children, scrollWheelZoom }) => (
    <div data-testid="map" data-wheel={String(scrollWheelZoom)}>
      {children}
    </div>
  ),
  TileLayer: () => null,
  Marker: ({ children, ref }) => {
    React.useLayoutEffect(() => {
      ref?.({ openPopup: openCustomerPopup });
      return () => ref?.(null);
    }, [ref]);
    return <div>{children}</div>;
  },
  Popup: ({ children }) => <div>{children}</div>,
  Polyline: ({ pathOptions, children }) => (
    <div data-testid="route-line" data-color={pathOptions.color}>
      {children}
    </div>
  ),
  Circle: () => null,
  useMap: () => map,
}));
const map = {
  fitBounds: vi.fn(),
  panTo: vi.fn(),
  setView: vi.fn(),
  getZoom: vi.fn(() => 14),
  invalidateSize: vi.fn(),
  getContainer: () => document.body,
};
const openCustomerPopup = vi.fn();
const deliveries = [1, 2].map((id) => ({
  id,
  status: "in_transit",
  batch_key: "pair",
  batch_sequence: id,
  order: {
    order_number: `DF-${id}`,
    pickup: { latitude: 14.18, longitude: 121.23 },
    destination: {
      address: `Address ${id}`,
      latitude: 14.2 + id / 100,
      longitude: 121.25,
    },
  },
}));
const response = {
  data: {
    stops: [],
    legs: [],
    distance_km: 3,
    duration_minutes: 9,
    missing_locations: [],
  },
};
beforeEach(() => {
  api.mockResolvedValue(response);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("loads all active stops, keeps paired order, and never starts GPS without a click", async () => {
  const watchPosition = vi.fn();
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { watchPosition },
  });
  render(<RiderRoutePlanner deliveries={deliveries} />);
  await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
  expect(JSON.parse(api.mock.calls[0][1].body).delivery_ids).toEqual([1, 2]);
  expect(
    screen.getByRole("button", { name: "Move DF-2 earlier" }).disabled,
  ).toBe(true);
  expect(watchPosition).not.toHaveBeenCalled();
});

it("updates live location, limits road refresh frequency, and clears GPS on exit", async () => {
  let update;
  const clearWatch = vi.fn();
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      watchPosition: vi.fn((callback) => {
        update = callback;
        return 7;
      }),
      clearWatch,
    },
  });
  const { unmount } = render(<RiderRoutePlanner deliveries={deliveries} />);
  await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "Use live location" }));
  act(() =>
    update({ coords: { latitude: 14.1, longitude: 121.2, accuracy: 10 } }),
  );
  await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
  expect(JSON.parse(api.mock.calls[1][1].body).origin).toEqual({
    latitude: 14.1,
    longitude: 121.2,
  });
  act(() =>
    update({ coords: { latitude: 14.11, longitude: 121.21, accuracy: 10 } }),
  );
  expect(api).toHaveBeenCalledTimes(2);
  unmount();
  expect(clearWatch).toHaveBeenCalledWith(7);
});

it("offers route retry after an unavailable request and preserves local reordering", async () => {
  api.mockRejectedValueOnce(new Error("Route unavailable"));
  render(
    <RiderRoutePlanner
      deliveries={deliveries.map((d) => ({ ...d, batch_key: null }))}
    />,
  );
  await screen.findByText("Route unavailable");
  fireEvent.click(screen.getByRole("button", { name: "Retry route" }));
  await screen.findByText("3 km · about 9 min");
  fireEvent.click(screen.getByRole("button", { name: "Move DF-2 earlier" }));
  await waitFor(() => expect(api).toHaveBeenCalledTimes(3));
  expect(JSON.parse(api.mock.calls[2][1].body).delivery_ids).toEqual([2, 1]);
});

it("keeps editable drop-offs in fullscreen, enables wheel zoom, and exits with Escape", async () => {
  render(
    <RiderRoutePlanner
      deliveries={deliveries.map((d) => ({ ...d, batch_key: null }))}
    />,
  );
  await screen.findByText("3 km · about 9 min");
  expect(screen.getByTestId("map").dataset.wheel).toBe("true");
  fireEvent.click(
    screen.getByRole("button", { name: "Fullscreen", exact: true }),
  );
  await screen.findByRole("dialog", { name: "Your delivery route" });
  expect(
    screen.getByRole("button", { name: "Move DF-2 earlier" }).disabled,
  ).toBe(false);
  expect(document.body.style.overflow).toBe("hidden");
  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(document.body.style.overflow).toBe("");
});

it("shows per-stop ETAs and overlays red only for returned congestion", async () => {
  const geometry = [
    [121.1, 14.1],
    [121.2, 14.2],
  ];
  api.mockResolvedValueOnce({
    data: {
      ...response.data,
      traffic_available: true,
      has_congestion: true,
      starts_at_live_location: true,
      stops: [
        {
          delivery_id: 1,
          kind: "dropoff",
          latitude: 14.1,
          longitude: 121.1,
          order_numbers: ["DF-1"],
          address: "Address 1",
          eta_at: "2026-10-24T12:20:00+08:00",
        },
      ],
      legs: [
        {
          geometry,
          traffic_segments: [
            { geometry, congestion: "heavy" },
            { geometry, congestion: "unknown" },
          ],
        },
      ],
    },
  });
  render(<RiderRoutePlanner deliveries={deliveries} />);
  await screen.findByText(/^ETA /);
  expect(
    screen.getByText("Congestion reported · red route sections"),
  ).toBeTruthy();
  expect(
    screen.getAllByTestId("route-line").map((el) => el.dataset.color),
  ).toEqual(["#ffffff", "#2563eb", "#c43d38"]);
});

it("keeps the store after the last delivery and requests a return route", async () => {
  const store = {
    key: "store-one",
    name: "Demo store",
    address: "Restaurant pickup",
    latitude: 14.18,
    longitude: 121.23,
  };
  api.mockResolvedValue({
    data: {
      ...response.data,
      stores: [store],
      return_to_store: true,
      stops: [{ ...store, kind: "return", order_numbers: [] }],
    },
  });
  const { rerender } = render(<RiderRoutePlanner deliveries={deliveries} />);
  await screen.findByText("Demo store");
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: "Return to store after last drop-off",
    }),
  );
  await waitFor(() =>
    expect(JSON.parse(api.mock.calls.at(-1)[1].body).return_to_store).toBe(
      true,
    ),
  );
  rerender(<RiderRoutePlanner deliveries={[]} />);
  await waitFor(() =>
    expect(JSON.parse(api.mock.calls.at(-1)[1].body).delivery_ids).toEqual([]),
  );
  expect(JSON.parse(api.mock.calls.at(-1)[1].body).return_to_store).toBe(true);
  expect(screen.getByText("Demo store")).toBeTruthy();
  expect(screen.getByText(/No active drop-offs/)).toBeTruthy();
});

it("focuses the chosen customer on the map and opens its pin without reordering deliveries", async () => {
  render(<RiderRoutePlanner deliveries={deliveries} />);
  await screen.findByText("3 km · about 9 min");
  const stop = screen.getByRole("button", { name: "Show DF-2 on map" });
  fireEvent.click(stop);
  expect(map.setView).toHaveBeenCalledWith(
    [deliveries[1].order.destination.latitude, 121.25],
    16,
    {
      animate: false,
    },
  );
  expect(openCustomerPopup).toHaveBeenCalled();
  expect(stop.getAttribute("aria-pressed")).toBe("true");
  expect(
    screen.getByRole("button", { name: "Move DF-2 earlier" }).disabled,
  ).toBe(true);
});

it("does not offer map focus when a customer has no valid pin", async () => {
  render(
    <RiderRoutePlanner
      deliveries={[
        {
          ...deliveries[0],
          order: {
            ...deliveries[0].order,
            destination: { address: "Missing pin" },
          },
        },
      ]}
    />,
  );
  await screen.findByText("3 km · about 9 min");
  expect(
    screen.getByRole("button", { name: "Show DF-1 on map" }).disabled,
  ).toBe(true);
  expect(map.setView).not.toHaveBeenCalled();
});
