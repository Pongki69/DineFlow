import { expect, it, vi } from "vitest";
import { subscribeRiderLocation } from "./riderLocationSession";

function locationAdapter() {
  const callbacks = [];
  return {
    callbacks,
    watchPosition: vi.fn((position, error, options) => {
      callbacks.push({ position, error, options });
      return callbacks.length;
    }),
    clearWatch: vi.fn(),
  };
}

it("shares one watch between explicitly enabled map and availability consumers", () => {
  const geo = locationAdapter();
  const map = vi.fn(),
    availability = vi.fn();
  expect(geo.watchPosition).not.toHaveBeenCalled();
  const stopMap = subscribeRiderLocation(geo, map, vi.fn());
  const stopAvailability = subscribeRiderLocation(geo, availability, vi.fn());
  expect(geo.watchPosition).toHaveBeenCalledOnce();
  const fix = { coords: { latitude: 14.1, longitude: 121.2, accuracy: 8 } };
  geo.callbacks[0].position(fix);
  expect(map).toHaveBeenCalledWith(fix);
  expect(availability).toHaveBeenCalledWith(fix);
  stopAvailability();
  expect(geo.clearWatch).not.toHaveBeenCalled();
  geo.callbacks[0].position(fix);
  expect(map).toHaveBeenCalledTimes(2);
  expect(availability).toHaveBeenCalledOnce();
  stopMap();
  expect(geo.clearWatch).toHaveBeenCalledWith(1);
  geo.callbacks[0].position(fix);
  expect(map).toHaveBeenCalledTimes(2);
});

it("starts a fresh session without replaying a prior consumer's coordinates", () => {
  const geo = locationAdapter();
  const first = vi.fn(),
    second = vi.fn();
  const stopFirst = subscribeRiderLocation(geo, first, vi.fn());
  geo.callbacks[0].position({ coords: { latitude: 14, longitude: 121 } });
  stopFirst();
  const stopSecond = subscribeRiderLocation(geo, second, vi.fn());
  stopFirst();
  expect(second).not.toHaveBeenCalled();
  expect(geo.watchPosition).toHaveBeenCalledTimes(2);
  const stopThird = subscribeRiderLocation(geo, vi.fn(), vi.fn());
  expect(geo.watchPosition).toHaveBeenCalledTimes(2);
  stopSecond();
  stopThird();
  expect(geo.clearWatch).toHaveBeenCalledTimes(2);
});

it("shares the fallback watcher and only reports the final positioning error", () => {
  const geo = locationAdapter();
  const mapError = vi.fn(),
    availabilityError = vi.fn();
  const stopMap = subscribeRiderLocation(geo, vi.fn(), mapError);
  const stopAvailability = subscribeRiderLocation(
    geo,
    vi.fn(),
    availabilityError,
  );
  geo.callbacks[0].error({ code: 2 });
  expect(geo.watchPosition).toHaveBeenCalledTimes(2);
  expect(geo.callbacks[1].options.enableHighAccuracy).toBe(false);
  expect(mapError).not.toHaveBeenCalled();
  expect(availabilityError).not.toHaveBeenCalled();
  const failure = { code: 3 };
  geo.callbacks[1].error(failure);
  expect(mapError).toHaveBeenCalledWith(failure);
  expect(availabilityError).toHaveBeenCalledWith(failure);
  stopMap();
  stopAvailability();
  expect(geo.clearWatch).toHaveBeenLastCalledWith(2);
});

it("permission denial reaches only subscribed consumers without another watch", () => {
  const geo = locationAdapter();
  const mapError = vi.fn(),
    availabilityError = vi.fn();
  const stopMap = subscribeRiderLocation(geo, vi.fn(), mapError);
  const stopAvailability = subscribeRiderLocation(
    geo,
    vi.fn(),
    availabilityError,
  );
  stopMap();
  geo.callbacks[0].error({ code: 1 });
  expect(mapError).not.toHaveBeenCalled();
  expect(availabilityError).toHaveBeenCalledWith({ code: 1 });
  expect(geo.watchPosition).toHaveBeenCalledOnce();
  stopAvailability();
});
