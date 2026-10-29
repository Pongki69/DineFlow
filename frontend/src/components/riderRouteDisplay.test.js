import { expect, it } from "vitest";
import {
  stopArrivalText,
  trafficOverlays,
  roadLegAppearance,
  routeColors,
  routeProgressCopy,
} from "./riderRouteDisplay";

it("keeps return routes visually distinct when they are the next live leg", () => {
  const returning = roadLegAppearance({ returning: true, next: true });
  expect(returning.pathOptions.color).toBe(routeColors.return);
  expect(returning.pathOptions.dashArray).toBe("10 8");
  const next = roadLegAppearance({ next: true, selected: true });
  const selected = roadLegAppearance({ selected: true });
  const context = roadLegAppearance({});
  expect(
    new Set([
      returning.pathOptions.color,
      next.pathOptions.color,
      selected.pathOptions.color,
      context.pathOptions.color,
    ]).size,
  ).toBe(4);
  expect(next.pathOptions).not.toHaveProperty("dashArray");
  expect(selected.pathOptions.dashArray).toBe("6 7");
  expect(next.pathOptions.weight).toBeGreaterThan(context.pathOptions.weight);
});

it("explains pending pickup and identifies the selected later leg between customer stops", () => {
  const stops = [
    { kind: "pickup", order_numbers: ["DEMO-1", "DEMO-2"] },
    { kind: "dropoff", delivery_id: 1, address: "First customer" },
    { kind: "dropoff", delivery_id: 2, address: "Second customer" },
  ];
  const copy = routeProgressCopy(stops, 2, [{ id: 2, status: "accepted" }]);
  expect(copy.heading).toBe("Next stop: Restaurant pickup");
  expect(copy.detail).toContain("Collect 2 orders");
  expect(copy.detail).toContain("Mark your arrival");
  expect(copy.selectionHint).toBe(
    "Dashed teal previews the later leg from stop 2 to customer stop 3.",
  );
  const collected = routeProgressCopy(stops.slice(1), 1, [
    { id: 1, status: "picked_up" },
  ]);
  expect(collected).toMatchObject({
    heading: "Next stop: Customer delivery",
    detail: "First customer",
    selectionHint: null,
  });
  expect(routeProgressCopy([], 1, [])).toBeNull();
});

it("shows arrival times only when an actual arrival timestamp is supplied", () => {
  const timestamp = "2026-10-24T12:20:00+08:00";
  expect(stopArrivalText({ eta_at: timestamp })).toBe(
    `ETA ${new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(timestamp))}`,
  );
  expect(stopArrivalText({ eta_at: null, travel_minutes_from_start: 8 })).toBe(
    "~8 min after the first stop",
  );
  expect(stopArrivalText({ eta_at: "invalid" })).toBeNull();
});

it("colors only reported congestion and leaves missing or unknown traffic unmarked", () => {
  const geometry = [
    [121.1, 14.1],
    [121.2, 14.2],
  ];
  expect(
    trafficOverlays({
      traffic_segments: [
        { congestion: "heavy", geometry },
        { congestion: "unknown", geometry },
        { congestion: "low", geometry },
      ],
    }),
  ).toEqual([{ congestion: "heavy", geometry }]);
  expect(trafficOverlays({ geometry })).toEqual([]);
});
