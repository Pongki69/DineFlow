// @vitest-environment jsdom
import React, { useState } from "react";
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
import {
  DeliveryAddressPicker,
  deliveryPosition,
} from "./DeliveryAddressPicker";
import { DeliveryDestination } from "../DeliveryMap";
import { api } from "../api";

const map = vi.hoisted(() => ({
  handlers: {},
  invalidateSize: vi.fn(),
  setView: vi.fn(),
}));
vi.mock("../api", () => ({ api: vi.fn() }));
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }) => <div>{children}</div>,
  Marker: ({ children }) => <div>{children}</div>,
  TileLayer: () => null,
  Popup: ({ children }) => <div>{children}</div>,
  CircleMarker: () => null,
  Circle: () => null,
  useMap: () => map,
  useMapEvents: (handlers) => {
    map.handlers = handlers;
  },
}));
const initial = {
  formatted_address: "Original address",
  recipient_name: "Customer",
  phone: "09123456789",
  latitude: 14.6,
  longitude: 121,
  pin_confirmed: true,
};
const items = [{ menu_item_id: 1, quantity: 1 }];
function Picker({ start = {}, ...props }) {
  const [value, setValue] = useState(start);
  return (
    <DeliveryAddressPicker
      items={items}
      value={value}
      onChange={setValue}
      {...props}
    />
  );
}
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  api.mockImplementation(async (path, options) => {
    if (path === "/addresses")
      return options?.method === "POST"
        ? { data: { id: 9, ...JSON.parse(options.body) } }
        : { data: [] };
    if (path === "/restaurant/location")
      return {
        data: { latitude: 14.6, longitude: 121 },
        map_provider: "geoapify",
      };
    if (path.startsWith("/maps/search"))
      return {
        data: [
          { label: "Result street, City", latitude: 14.7, longitude: 121.1 },
        ],
      };
    if (path.startsWith("/maps/reverse"))
      return { data: { label: "Pinned street" } };
    if (path === "/delivery/quote")
      return {
        data: {
          delivery_fee: 40,
          distance_km: 2,
          duration_minutes: 10,
          meets_minimum: true,
        },
      };
    return { data: { id: 9 } };
  });
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("validates coordinates including zero without displaying an unselected default pin", () => {
  expect(deliveryPosition({ latitude: 0, longitude: 0 })).toEqual([0, 0]);
  for (const value of [
    {},
    { latitude: "", longitude: 1 },
    { latitude: "bad", longitude: 1 },
    { latitude: 91, longitude: 0 },
  ])
    expect(deliveryPosition(value)).toBeNull();
  render(<Picker />);
  expect(
    screen.getByRole("button", { name: "Confirm this drop-off pin" }),
  ).toBeDisabled();
  expect(
    screen.getByText(/No drop-off point selected yet/),
  ).toBeInTheDocument();
});
it("supports Enter search and pin confirmation without submitting the surrounding form", async () => {
  const submit = vi.fn((event) => event.preventDefault());
  render(
    <form onSubmit={submit}>
      <Picker />
    </form>,
  );
  fireEvent.change(screen.getByLabelText("Search address or landmark"), {
    target: { value: "Result street" },
  });
  fireEvent.keyDown(screen.getByLabelText("Search address or landmark"), {
    key: "Enter",
  });
  fireEvent.click(
    await screen.findByRole("button", { name: "Result street, City" }),
  );
  expect(screen.getByLabelText("Delivery address")).toHaveValue(
    "Result street, City",
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Confirm this drop-off pin" }),
  );
  expect(
    screen.getByRole("button", { name: "Drop-off pin confirmed" }),
  ).toBeDisabled();
  expect(submit).not.toHaveBeenCalled();
});
it("looks up a moved pin but ignores an older address lookup and preserves manual edits", async () => {
  let resolveOld;
  const defaultApi = api.getMockImplementation();
  api.mockImplementation((path, options) =>
    path.includes("latitude=14.1")
      ? new Promise((resolve) => {
          resolveOld = resolve;
        })
      : defaultApi(path, options),
  );
  render(<Picker start={initial} />);
  act(() => {
    map.handlers.click({ latlng: { lat: 14.1, lng: 121.1 } });
  });
  act(() => {
    map.handlers.click({ latlng: { lat: 14.2, lng: 121.2 } });
  });
  await waitFor(() =>
    expect(screen.getByLabelText("Delivery address")).toHaveValue(
      "Pinned street",
    ),
  );
  fireEvent.change(screen.getByLabelText("Delivery address"), {
    target: { value: "Unit 2, manually corrected" },
  });
  await act(async () => resolveOld({ data: { label: "Stale street" } }));
  expect(screen.getByLabelText("Delivery address")).toHaveValue(
    "Unit 2, manually corrected",
  );
  expect(
    screen.getByRole("button", { name: "Confirm this drop-off pin" }),
  ).toBeEnabled();
});
it("explains denied device location without changing the chosen address", async () => {
  const getCurrentPosition = vi.fn((success, failure) => failure({ code: 1 }));
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition },
  });
  render(<Picker start={initial} />);
  expect(getCurrentPosition).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Use my current location" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Location permission was denied",
  );
  expect(screen.getByLabelText("Delivery address")).toHaveValue(
    "Original address",
  );
});
it("retains a pin and allows manual address entry when reverse lookup fails", async () => {
  const defaultApi = api.getMockImplementation();
  api.mockImplementation((path, options) =>
    path.startsWith("/maps/reverse")
      ? Promise.reject(new Error("Unavailable"))
      : defaultApi(path, options),
  );
  render(<Picker />);
  act(() => {
    map.handlers.click({ latlng: { lat: 14.3, lng: 121.3 } });
  });
  await screen.findByText(/Enter it below; you can still use this location/);
  expect(
    screen.getByRole("button", { name: "Confirm this drop-off pin" }),
  ).toBeEnabled();
});
it("retries a failed quote without losing address details", async () => {
  const defaultApi = api.getMockImplementation();
  let fail = true;
  api.mockImplementation((path, options) =>
    path === "/delivery/quote" && fail
      ? Promise.reject(new Error("Quote unavailable"))
      : defaultApi(path, options),
  );
  render(<Picker start={initial} />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Quote unavailable",
  );
  fail = false;
  fireEvent.click(
    screen.getByRole("button", { name: "Retry delivery estimate" }),
  );
  await screen.findByText("Delivery fee · ₱40");
  expect(screen.getByLabelText("Recipient")).toHaveValue("Customer");
});
it("saves a confirmed address and provides success feedback", async () => {
  render(<Picker start={initial} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Save address for next time" }),
  );
  await screen.findByText(/Address saved/);
  expect(
    screen.getByRole("button", { name: "Update saved address" }),
  ).toBeInTheDocument();
  const request = api.mock.calls.find(
    ([path, options]) => path === "/addresses" && options?.method === "POST",
  );
  expect(JSON.parse(request[1].body)).toMatchObject({
    latitude: 14.6,
    longitude: 121,
    formatted_address: "Original address",
  });
});
it("discards unconfirmed dialog edits and only applies a valid confirmed address", async () => {
  const changed = vi.fn();
  render(
    <DeliveryDestination items={items} value={initial} onChange={changed} />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Change delivery address" }),
  );
  act(() => {
    map.handlers.click({ latlng: { lat: 14.8, lng: 121.8 } });
  });
  await waitFor(() =>
    expect(screen.getByLabelText("Delivery address")).toHaveValue(
      "Pinned street",
    ),
  );
  expect(
    screen.getByRole("button", { name: "Use this address" }),
  ).toBeDisabled();
  fireEvent.click(
    screen.getByRole("button", { name: "Close delivery address" }),
  );
  expect(changed).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Change delivery address" }),
  );
  expect(screen.getByLabelText("Delivery address")).toHaveValue(
    "Original address",
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Use this address" }),
    ).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Use this address" }));
  expect(changed).toHaveBeenCalledWith(
    expect.objectContaining({
      formatted_address: "Original address",
      pin_confirmed: true,
    }),
  );
});

it("loads the default preset automatically and reuses saved pins without repeating confirmation", async () => {
  const defaultApi = api.getMockImplementation();
  api.mockImplementation((path, options) =>
    path === "/addresses"
      ? Promise.resolve({
          data: [
            { ...initial, id: 1, label: "Home", is_default: true },
            {
              ...initial,
              id: 2,
              label: "Work",
              formatted_address: "Office entrance",
              is_default: false,
            },
          ],
        })
      : defaultApi(path, options),
  );
  render(<Picker />);
  await waitFor(() =>
    expect(screen.getByLabelText("Delivery address")).toHaveValue(
      "Original address",
    ),
  );
  expect(screen.getByLabelText("Saved address")).toHaveValue("1");
  expect(
    screen.getByRole("button", { name: "Drop-off pin confirmed" }),
  ).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Saved address"), {
    target: { value: "2" },
  });
  expect(screen.getByLabelText("Delivery address")).toHaveValue(
    "Office entrance",
  );
  expect(
    screen.getByRole("button", { name: "Drop-off pin confirmed" }),
  ).toBeDisabled();
});

it("does not overwrite a manually selected checkout location with a saved default", async () => {
  const defaultApi = api.getMockImplementation();
  api.mockImplementation((path, options) =>
    path === "/addresses"
      ? Promise.resolve({
          data: [
            {
              ...initial,
              id: 1,
              label: "Home",
              formatted_address: "Default address",
              is_default: true,
            },
          ],
        })
      : defaultApi(path, options),
  );
  render(<Picker start={initial} />);
  await screen.findByLabelText("Saved address");
  expect(screen.getByLabelText("Delivery address")).toHaveValue(
    "Original address",
  );
});

it("saves a named default preset without items or a delivery quote", async () => {
  const onSaved = vi.fn();
  render(
    <Picker
      mode="addressBook"
      items={[]}
      start={{ ...initial, label: "Work", is_default: true }}
      onSaved={onSaved}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Save address for next time" }),
  );
  await waitFor(() =>
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ label: "Work", is_default: true }),
    ),
  );
  expect(api.mock.calls.some(([path]) => path === "/delivery/quote")).toBe(
    false,
  );
  const request = api.mock.calls.find(
    ([path, options]) => path === "/addresses" && options?.method === "POST",
  );
  expect(JSON.parse(request[1].body)).toMatchObject({
    label: "Work",
    is_default: true,
  });
});
