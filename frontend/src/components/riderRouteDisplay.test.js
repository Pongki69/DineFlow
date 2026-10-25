import { expect, it } from "vitest";
import { stopArrivalText, trafficOverlays } from "./riderRouteDisplay";

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
