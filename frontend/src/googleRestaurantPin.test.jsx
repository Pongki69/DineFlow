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
import { GoogleRestaurantPin } from "./components/GoogleRestaurantPin";
import { loadGoogleMaps } from "./googleMaps";

const sdk = vi.hoisted(() => ({
  search: vi.fn(),
  geocode: vi.fn(),
  events: {},
}));
vi.mock("./googleMaps", () => ({
  loadGoogleMaps: vi.fn(),
  googlePosition: (value) => ({
    lat: Number(value.latitude),
    lng: Number(value.longitude),
  }),
}));

function Preview() {
  const [location, setLocation] = useState({
    address: "Original address",
    latitude: 14.6,
    longitude: 121,
  });
  return (
    <>
      <GoogleRestaurantPin
        apiKey="test-key"
        location={location}
        radius={8}
        onChange={setLocation}
      />
      <output aria-label="Saved address">{location.address}</output>
      <output aria-label="Chosen latitude">{location.latitude}</output>
    </>
  );
}

beforeEach(() => {
  sdk.events = {};
  sdk.geocode.mockResolvedValue({
    results: [{ formatted_address: "Pinned Google address" }],
  });
  sdk.search.mockResolvedValue({
    places: [
      {
        id: "place-1",
        displayName: "Kuya Mario",
        formattedAddress: "Los Baños, Laguna",
        location: { lat: () => 14.2, lng: () => 121.3 },
      },
    ],
  });
  class Map {
    addListener(type, callback) {
      sdk.events[type] = callback;
      return { remove() {} };
    }
    fitBounds() {}
    getBounds() {
      return {};
    }
  }
  class Circle {
    setCenter() {}
    setRadius() {}
    getBounds() {
      return {};
    }
    setMap() {}
  }
  class AdvancedMarkerElement {
    append() {}
    addListener(type, callback) {
      sdk.events[type] = callback;
      return { remove() {} };
    }
  }
  class PinElement {}
  class Geocoder {
    geocode(...args) {
      return sdk.geocode(...args);
    }
  }
  loadGoogleMaps.mockResolvedValue({
    importLibrary: async () => ({
      Map,
      Circle,
      AdvancedMarkerElement,
      PinElement,
      Place: { searchByText: sdk.search },
      Geocoder,
    }),
  });
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("searches Google Places and fills the selected restaurant address and coordinates", async () => {
  render(<Preview />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Search map" }).disabled).toBe(
      false,
    ),
  );
  fireEvent.change(screen.getByLabelText("Find a place or address"), {
    target: { value: "Kuya Mario Los Banos" },
  });
  fireEvent.keyDown(screen.getByLabelText("Find a place or address"), {
    key: "Enter",
  });
  fireEvent.click(await screen.findByRole("button", { name: /Kuya Mario/ }));
  expect(screen.getByLabelText("Saved address").textContent).toBe(
    "Los Baños, Laguna",
  );
  expect(screen.getByLabelText("Chosen latitude").textContent).toBe("14.2");
  expect(sdk.search).toHaveBeenCalledWith(
    expect.objectContaining({
      textQuery: "Kuya Mario Los Banos",
      region: "ph",
      fields: ["id", "displayName", "formattedAddress", "location"],
    }),
  );
});

it("looks up the address after dragging the Google restaurant marker", async () => {
  render(<Preview />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Search map" }).disabled).toBe(
      false,
    ),
  );
  await act(async () =>
    sdk.events.dragend({ latLng: { lat: () => 14.3, lng: () => 121.4 } }),
  );
  expect(screen.getByLabelText("Saved address").textContent).toBe(
    "Pinned Google address",
  );
  expect(screen.getByLabelText("Chosen latitude").textContent).toBe("14.3");
});

it("shows a useful error when Google cannot load", async () => {
  loadGoogleMaps.mockRejectedValueOnce(new Error("Key unavailable"));
  render(<Preview />);
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Google Maps could not start",
  );
  expect(screen.getByLabelText("Saved address").textContent).toBe(
    "Original address",
  );
});
