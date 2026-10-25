// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { DeliveryArrivalTimes, recordedSegments } from "./DeliveryJourney";
vi.mock("react-leaflet", () => ({ Polyline: () => null }));
afterEach(cleanup);

it("leaves GPS gaps over two minutes open instead of inventing a continuous journey", () => {
  const point = (seconds) => ({
    latitude: 14.6,
    longitude: 121,
    recorded_at: new Date(1760000000000 + seconds * 1000).toISOString(),
  });
  expect(
    recordedSegments([point(0), point(15), point(200), point(215)]),
  ).toHaveLength(2);
  expect(
    recordedSegments([point(0), { ...point(5), latitude: 999 }, point(15)]),
  ).toEqual([]);
  expect(recordedSegments([point(0)])).toEqual([]);
});
it("shows recorded timestamps and never invents missing arrivals or stale ETAs", () => {
  render(
    <DeliveryArrivalTimes
      times={{ restaurant: "2026-10-23T06:00:00Z" }}
      eta="2026-10-23T07:00:00Z"
      stale
    />,
  );
  expect(document.querySelector("time")).toHaveAttribute(
    "datetime",
    "2026-10-23T06:00:00Z",
  );
  expect(screen.getAllByText("Not recorded")).toHaveLength(2);
  expect(screen.queryByText("Estimated arrival")).not.toBeInTheDocument();
});
