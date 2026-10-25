import { expect, it } from "vitest";
import {
  nearestDeliveryOrder,
  respectsBatchOrder,
  validRoutePoint,
} from "./riderRoutePlanning";

const delivery = (id, lat, extra = {}) => ({
  id,
  order: { destination: { latitude: lat, longitude: 121 } },
  ...extra,
});
it("suggests nearby stops while preserving paired delivery constraints", () => {
  const deliveries = [
    delivery(1, 14.4, { batch_key: "A", batch_sequence: 1 }),
    delivery(2, 14.01, { batch_key: "A", batch_sequence: 2 }),
    delivery(3, 14.1),
  ];
  const result = nearestDeliveryOrder(deliveries, {
    latitude: 14,
    longitude: 121,
  });
  expect(result.map((d) => d.id)).toEqual([3, 1, 2]);
  expect(respectsBatchOrder(result)).toBe(true);
  expect(respectsBatchOrder([deliveries[1], deliveries[0]])).toBe(false);
});
it("handles missing pins without discarding deliveries", () => {
  const result = nearestDeliveryOrder([delivery(1, null), delivery(2, 14.1)], {
    latitude: 14,
    longitude: 121,
  });
  expect(result.map((d) => d.id)).toEqual([2, 1]);
  expect(validRoutePoint({ latitude: 0, longitude: 0 })).toBe(true);
  expect(validRoutePoint({ latitude: "", longitude: 121 })).toBe(false);
  expect(validRoutePoint({ latitude: 91, longitude: 121 })).toBe(false);
});
