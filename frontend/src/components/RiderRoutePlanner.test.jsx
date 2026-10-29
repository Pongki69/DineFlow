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
import { setTemporaryRiderIdentity } from "./temporaryRiderLocation";

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
  Polyline: ({ pathOptions, children, positions }) => (
    <div
      data-testid="route-line"
      data-color={pathOptions.color}
      data-opacity={pathOptions.opacity}
      data-points={JSON.stringify(positions)}
    >
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
const scrollMapIntoView = vi.fn();
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
  Object.defineProperty(document.body, "scrollIntoView", {
    configurable: true,
    value: scrollMapIntoView,
  });
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
  setTemporaryRiderIdentity(null);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  delete document.body.scrollIntoView;
});

it("starts the configured rider map at the exact demo point without starting GPS or presence sharing", async () => {
  vi.stubEnv("DEV", true);
  vi.stubEnv("VITE_RIDER_PREVIEW_USER_ID", "4");
  vi.stubEnv("VITE_RIDER_PREVIEW_LATITUDE", "14.186648");
  vi.stubEnv("VITE_RIDER_PREVIEW_LONGITUDE", "121.231433");
  vi.stubEnv(
    "VITE_RIDER_PREVIEW_EXPIRES_AT",
    new Date(Date.now() + 3600000).toISOString(),
  );
  setTemporaryRiderIdentity(4);
  const watchPosition = vi.fn();
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { watchPosition },
  });
  render(<RiderRoutePlanner deliveries={deliveries} />);
  await screen.findByText("3 km · about 9 min");
  expect(JSON.parse(api.mock.calls[0][1].body).origin).toEqual({
    latitude: 14.186648,
    longitude: 121.231433,
  });
  expect(screen.getByText("Temporary demo location")).toBeTruthy();
  expect(watchPosition).not.toHaveBeenCalled();
  expect(api.mock.calls.every(([url]) => url === "/rider/route-plan")).toBe(
    true,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Clear temporary location preview" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Preview demo location" }),
  );
  await waitFor(() =>
    expect(JSON.parse(api.mock.calls.at(-1)[1].body).origin).toEqual({
      latitude: 14.186648,
      longitude: 121.231433,
    }),
  );
  expect(watchPosition).not.toHaveBeenCalled();
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

it("links the current outlet immediately and recalculates when the saved location changes", async () => {
  const first = {
    name: "Current Bay outlet",
    address: "Current entrance",
    latitude: 14.19,
    longitude: 121.28,
  };
  const { rerender } = render(
    <RiderRoutePlanner deliveries={deliveries} restaurantLocation={first} />,
  );
  await screen.findByText("3 km · about 9 min");
  expect(screen.getByText("Current Bay outlet")).toBeTruthy();
  expect(screen.getByText("Current restaurant outlet")).toBeTruthy();
  const before = api.mock.calls.length;
  rerender(
    <RiderRoutePlanner
      deliveries={deliveries}
      restaurantLocation={{
        ...first,
        name: "Updated outlet",
        longitude: 121.29,
      }}
    />,
  );
  await waitFor(() => expect(api.mock.calls.length).toBeGreaterThan(before));
  expect(screen.getByText("Updated outlet")).toBeTruthy();
  expect(JSON.parse(api.mock.calls.at(-1)[1].body)).not.toHaveProperty(
    "outlet_signature",
  );
  expect(deliveries[0].order.pickup).toEqual({
    latitude: 14.18,
    longitude: 121.23,
  });
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
  const nextRefresh = Date.now() + 16000;
  vi.spyOn(Date, "now").mockReturnValue(nextRefresh);
  act(() =>
    update({ coords: { latitude: 14.10001, longitude: 121.2, accuracy: 10 } }),
  );
  expect(api).toHaveBeenCalledTimes(2);
  act(() =>
    update({ coords: { latitude: 14.12, longitude: 121.22, accuracy: 10 } }),
  );
  await waitFor(() => expect(api).toHaveBeenCalledTimes(3));
  expect(JSON.parse(api.mock.calls[2][1].body).origin).toEqual({
    latitude: 14.12,
    longitude: 121.22,
  });
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
    screen.getByRole("button", { name: "Enter fullscreen", exact: true }),
  );
  const dialog = await screen.findByRole("dialog", {
    name: "Route & tracking",
  });
  expect(dialog.getAttribute("aria-modal")).toBe("true");
  expect(
    screen
      .getByRole("button", { name: "Exit fullscreen" })
      .getAttribute("aria-expanded"),
  ).toBe("true");
  expect(
    screen.getByRole("button", { name: "Move DF-2 earlier" }).disabled,
  ).toBe(false);
  expect(document.body.style.overflow).toBe("hidden");
  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(document.body.style.overflow).toBe("");
  expect(
    screen
      .getByRole("button", { name: "Enter fullscreen" })
      .getAttribute("aria-expanded"),
  ).toBe("false");
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
  ).toEqual(["#ffffff", "#64748b", "#c43d38"]);
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
    19,
    {
      animate: false,
    },
  );
  expect(openCustomerPopup).toHaveBeenCalled();
  expect(stop.getAttribute("aria-pressed")).toBe("true");
  expect(
    screen.getByRole("button", { name: "Move DF-2 earlier" }).disabled,
  ).toBe(true);
  expect(
    api.mock.calls.every(
      ([, options]) =>
        JSON.stringify(JSON.parse(options.body).delivery_ids) === "[1,2]",
    ),
  ).toBe(true);
});

it("keeps the page position on initial assignment focus and scrolls the map after explicit rider selection", async () => {
  function SelectedAssignment() {
    const [selected, setSelected] = React.useState(1);
    return (
      <RiderRoutePlanner
        deliveries={deliveries}
        selectedDeliveryId={selected}
        onSelectDelivery={setSelected}
      />
    );
  }
  render(<SelectedAssignment />);
  await screen.findByText("3 km · about 9 min");
  await waitFor(() =>
    expect(map.setView).toHaveBeenCalledWith(
      [deliveries[0].order.destination.latitude, 121.25],
      19,
      { animate: false },
    ),
  );
  expect(openCustomerPopup).toHaveBeenCalled();
  expect(scrollMapIntoView).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Show DF-2 on map" }));
  await waitFor(() =>
    expect(map.setView).toHaveBeenLastCalledWith(
      [deliveries[1].order.destination.latitude, 121.25],
      19,
      { animate: false },
    ),
  );
  expect(scrollMapIntoView).toHaveBeenCalledWith({
    block: "nearest",
    behavior: "smooth",
  });
  expect(
    screen
      .getByRole("button", { name: "Show DF-2 on map" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  expect(JSON.parse(api.mock.calls.at(-1)[1].body).delivery_ids).toEqual([
    1, 2,
  ]);
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

it("shows the next drivable road leg and highlights a selected route after a stationary pickup", async () => {
  vi.stubEnv("DEV", true);
  vi.stubEnv("VITE_RIDER_PREVIEW_USER_ID", "4");
  vi.stubEnv("VITE_RIDER_PREVIEW_LATITUDE", "14.186648");
  vi.stubEnv("VITE_RIDER_PREVIEW_LONGITUDE", "121.231433");
  vi.stubEnv(
    "VITE_RIDER_PREVIEW_EXPIRES_AT",
    new Date(Date.now() + 60_000).toISOString(),
  );
  setTemporaryRiderIdentity(4);
  const firstRoad = [
    [121.231433, 14.186648],
    [121.24, 14.19],
    [121.25, 14.21],
  ];
  api.mockResolvedValue({
    data: {
      stops: [
        {
          kind: "pickup",
          latitude: 14.186648,
          longitude: 121.231433,
          order_numbers: ["DF-1"],
        },
        {
          kind: "dropoff",
          delivery_id: 1,
          latitude: 14.21,
          longitude: 121.25,
          order_numbers: ["DF-1"],
        },
        {
          kind: "dropoff",
          delivery_id: 2,
          latitude: 14.22,
          longitude: 121.25,
          order_numbers: ["DF-2"],
        },
      ],
      legs: [
        { stop_index: 0, distance_km: 0, duration_minutes: 0, geometry: [] },
        {
          stop_index: 1,
          distance_km: 1,
          duration_minutes: 3,
          geometry: firstRoad,
        },
        {
          stop_index: 2,
          distance_km: 1,
          duration_minutes: 3,
          geometry: [
            [121.25, 14.21],
            [121.251, 14.215],
            [121.25, 14.22],
          ],
        },
      ],
      distance_km: 2,
      duration_minutes: 6,
      missing_locations: [],
      route_unavailable: false,
    },
  });
  render(<RiderRoutePlanner deliveries={deliveries} selectedDeliveryId={2} />);
  await screen.findByText("2 km · about 6 min");
  const lines = screen.getAllByTestId("route-line");
  expect(lines).toHaveLength(4);
  expect(
    lines.find((line) => line.dataset.color === "#0f766e").dataset.opacity,
  ).toBe("1");
  expect(
    lines.find((line) => line.dataset.color === "#1d4ed8").dataset.opacity,
  ).toBe("1");
  fireEvent.click(
    screen.getByRole("button", { name: "Fit next road leg", exact: true }),
  );
  expect(map.fitBounds).toHaveBeenLastCalledWith(
    firstRoad.map(([lng, lat]) => [lat, lng]),
    expect.any(Object),
  );
  expect(screen.queryByText(/Road directions are unavailable/)).toBeNull();
});
it("routes the selected collected delivery from the rider and keeps full planning optional", async () => {
  vi.stubEnv("DEV", true);
  vi.stubEnv("VITE_RIDER_PREVIEW_USER_ID", "4");
  vi.stubEnv("VITE_RIDER_PREVIEW_LATITUDE", "14.186648");
  vi.stubEnv("VITE_RIDER_PREVIEW_LONGITUDE", "121.231433");
  vi.stubEnv(
    "VITE_RIDER_PREVIEW_EXPIRES_AT",
    new Date(Date.now() + 60000).toISOString(),
  );
  setTemporaryRiderIdentity(4);
  const customer = {
    kind: "dropoff",
    delivery_id: 2,
    latitude: 14.22,
    longitude: 121.25,
    address: "Selected customer",
    order_numbers: ["DF-2"],
  };
  const leg = {
    stop_index: 0,
    distance_km: 2,
    duration_minutes: 4,
    geometry: [
      [121.231433, 14.186648],
      [121.25, 14.22],
    ],
  };
  api.mockResolvedValue({
    data: {
      ...response.data,
      stops: [
        {
          kind: "pickup",
          latitude: 14.18,
          longitude: 121.23,
          order_numbers: ["DF-1"],
        },
        customer,
      ],
      legs: [
        {
          ...leg,
          stop_index: 1,
          geometry: [
            [121.23, 14.18],
            [121.25, 14.22],
          ],
        },
      ],
      navigation: {
        requested_delivery_id: 2,
        delivery_id: 2,
        target: customer,
        leg,
        requires_location: false,
        route_unavailable: false,
      },
    },
  });
  const { rerender } = render(
    <RiderRoutePlanner deliveries={deliveries} selectedDeliveryId={2} />,
  );
  await screen.findByText("Ride to: Customer delivery");
  expect(JSON.parse(api.mock.calls.at(-1)[1].body).navigation_delivery_id).toBe(
    2,
  );
  expect(screen.getAllByTestId("route-line")).toHaveLength(2);
  expect(
    JSON.parse(screen.getAllByTestId("route-line")[1].dataset.points),
  ).toEqual([
    [14.186648, 121.231433],
    [14.22, 121.25],
  ]);
  expect(screen.getByText("2 km · about 4 min")).toBeTruthy();
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Show full route plan" }),
  );
  expect(screen.queryByText("Ride to: Customer delivery")).toBeNull();
  expect(screen.getByText("Next stop: Restaurant pickup")).toBeTruthy();
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Show full route plan" }),
  );
  api.mockResolvedValue({
    data: {
      ...response.data,
      stops: [customer],
      navigation: {
        requested_delivery_id: 2,
        delivery_id: 2,
        target: customer,
        leg: null,
        requires_location: true,
      },
    },
  });
  rerender(
    <RiderRoutePlanner
      deliveries={deliveries.map((d) => ({ ...d, status: "picked_up" }))}
      selectedDeliveryId={2}
    />,
  );
  await screen.findByText("Enable live location to start riding");
  expect(screen.queryAllByTestId("route-line")).toHaveLength(0);
});
