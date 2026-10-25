import { expect, it, vi } from "vitest";
import { watchRiderLocation } from "./watchRiderLocation";

it("falls back to network positioning and ignores old GPS callbacks", () => {
  const callbacks = [];
  const geo = {
    watchPosition: vi.fn((success, failure, options) => {
      callbacks.push({ success, failure, options });
      return callbacks.length;
    }),
    clearWatch: vi.fn(),
  };
  const success = vi.fn(),
    failure = vi.fn();
  const stop = watchRiderLocation(geo, success, failure);
  callbacks[0].failure({ code: 2 });
  expect(geo.clearWatch).toHaveBeenCalledWith(1);
  expect(callbacks[1].options.enableHighAccuracy).toBe(false);
  callbacks[0].success({ coords: { latitude: 1, longitude: 2 } });
  expect(success).not.toHaveBeenCalled();
  callbacks[1].success({ coords: { latitude: 3, longitude: 4 } });
  expect(success).toHaveBeenCalledTimes(1);
  stop();
  expect(geo.clearWatch).toHaveBeenCalledWith(2);
  callbacks[1].success({ coords: { latitude: 5, longitude: 6 } });
  expect(success).toHaveBeenCalledTimes(1);
});

it("reports denied permission without trying a second location watch", () => {
  let fail;
  const geo = {
    watchPosition: vi.fn((success, error) => {
      fail = error;
      return 1;
    }),
    clearWatch: vi.fn(),
  };
  const error = vi.fn();
  const stop = watchRiderLocation(geo, vi.fn(), error);
  fail({ code: 1 });
  expect(error).toHaveBeenCalledWith({ code: 1 });
  expect(geo.watchPosition).toHaveBeenCalledTimes(1);
  stop();
});
