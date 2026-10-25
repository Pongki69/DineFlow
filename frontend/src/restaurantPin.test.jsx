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
import { DeliverySettings } from "./DeliveryMap";
import { api } from "./api";

const map = vi.hoisted(() => ({
  handlers: {},
  fitBounds: vi.fn(),
  invalidateSize: vi.fn(),
}));
vi.mock("./api", () => ({ api: vi.fn() }));
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Circle: ({ radius }) => <div data-testid="coverage" data-radius={radius} />,
  CircleMarker: () => null,
  Popup: ({ children }) => children,
  Marker: ({ eventHandlers }) => (
    <button
      type="button"
      onClick={() =>
        eventHandlers.dragend({
          target: { getLatLng: () => ({ lat: 14.62, lng: 121.02 }) },
        })
      }
    >
      Drag restaurant pin
    </button>
  ),
  useMap: () => map,
  useMapEvents: (handlers) => {
    map.handlers = handlers;
  },
}));

beforeEach(() => {
  api.mockImplementation(async (path) => {
    if (path === "/admin/delivery-policy")
      return {
        data: {
          policy: {
            radius_km: 8,
            minimum_order: 0,
            base_fee: 40,
            per_km_fee: 5,
          },
        },
      };
    if (path === "/restaurant/location")
      return {
        data: {
          name: "Restaurant",
          address: "Old address",
          latitude: 14.6,
          longitude: 121,
        },
      };
    if (path.startsWith("/maps/search"))
      return {
        data: [
          { label: "New restaurant address", latitude: 14.7, longitude: 121.1 },
        ],
      };
    if (path.startsWith("/maps/reverse"))
      return { data: { label: "Pinned restaurant address" } };
    return { data: {} };
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("updates restaurant coordinates from map clicks and dragging, then saves only on request", async () => {
  render(<DeliverySettings />);
  await screen.findByText("Pin your restaurant");
  act(() => map.handlers.click({ latlng: { lat: 0, lng: 0 } }));
  expect(screen.getByLabelText("Latitude").value).toBe("0");
  expect(screen.getByLabelText("Longitude").value).toBe("0");
  fireEvent.click(screen.getByRole("button", { name: "Drag restaurant pin" }));
  expect(screen.getByLabelText("Latitude").value).toBe("14.62");
  await waitFor(() =>
    expect(screen.getByLabelText("Address").value).toBe(
      "Pinned restaurant address",
    ),
  );
  expect(api.mock.calls.some(([, options]) => options?.method === "PUT")).toBe(
    false,
  );
  fireEvent.submit(
    screen.getByRole("button", { name: "Save settings" }).closest("form"),
  );
  await screen.findByText("Delivery area and restaurant location saved.");
  const [, request] = api.mock.calls.find(
    ([path]) => path === "/admin/restaurant/location",
  );
  expect(JSON.parse(request.body)).toMatchObject({
    latitude: 14.62,
    longitude: 121.02,
    address: "Pinned restaurant address",
  });
});

it("searches for a restaurant and previews the configured delivery radius", async () => {
  render(<DeliverySettings />);
  await screen.findByText("Pin your restaurant");
  fireEvent.change(screen.getByLabelText("Find a place or address"), {
    target: { value: "Restaurant city" },
  });
  fireEvent.keyDown(screen.getByLabelText("Find a place or address"), {
    key: "Enter",
  });
  fireEvent.click(
    await screen.findByRole("button", { name: "New restaurant address" }),
  );
  expect(screen.getByLabelText("Address").value).toBe("New restaurant address");
  expect(screen.getByLabelText("Latitude").value).toBe("14.7");
  expect(screen.getByTestId("coverage").getAttribute("data-radius")).toBe(
    "8000",
  );
  fireEvent.change(screen.getByLabelText("Coverage radius (km)"), {
    target: { value: "5" },
  });
  expect(screen.getByTestId("coverage").getAttribute("data-radius")).toBe(
    "5000",
  );
});

it("ignores an older pin lookup after a new pin is placed", async () => {
  render(<DeliverySettings />);
  await screen.findByText("Pin your restaurant");
  let resolveOld;
  api.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
  );
  act(() => map.handlers.click({ latlng: { lat: 14.1, lng: 121.1 } }));
  fireEvent.click(screen.getByRole("button", { name: "Drag restaurant pin" }));
  await waitFor(() =>
    expect(screen.getByLabelText("Address").value).toBe(
      "Pinned restaurant address",
    ),
  );
  await act(async () => resolveOld({ data: { label: "Old pin address" } }));
  expect(screen.getByLabelText("Address").value).toBe(
    "Pinned restaurant address",
  );
});

it("preserves a manually edited address when lookup finishes", async () => {
  render(<DeliverySettings />);
  await screen.findByText("Pin your restaurant");
  let resolveLookup;
  api.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveLookup = resolve;
      }),
  );
  act(() => map.handlers.click({ latlng: { lat: 14.1, lng: 121.1 } }));
  fireEvent.change(screen.getByLabelText("Address"), {
    target: { value: "My exact building address" },
  });
  await act(async () =>
    resolveLookup({ data: { label: "Approximate street address" } }),
  );
  expect(screen.getByLabelText("Address").value).toBe(
    "My exact building address",
  );
});

it("keeps the pin and supports manual entry when lookup fails", async () => {
  render(<DeliverySettings />);
  await screen.findByText("Pin your restaurant");
  api.mockRejectedValueOnce(new Error("Address lookup unavailable"));
  fireEvent.click(screen.getByRole("button", { name: "Drag restaurant pin" }));
  await screen.findByText("Address lookup unavailable");
  expect(screen.getByLabelText("Latitude").value).toBe("14.62");
  fireEvent.change(screen.getByLabelText("Address"), {
    target: { value: "Manual restaurant address" },
  });
  expect(screen.getByLabelText("Address").value).toBe(
    "Manual restaurant address",
  );
});
