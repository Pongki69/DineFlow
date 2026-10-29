import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  readTemporaryRiderLocation,
  setTemporaryRiderIdentity,
} from "./temporaryRiderLocation";
import { watchRiderLocation } from "./watchRiderLocation";

const now = Date.parse("2026-10-29T04:00:00Z");
const environment = {
  DEV: true,
  VITE_RIDER_PREVIEW_USER_ID: "4",
  VITE_RIDER_PREVIEW_LATITUDE: "14.186648",
  VITE_RIDER_PREVIEW_LONGITUDE: "121.231433",
  VITE_RIDER_PREVIEW_EXPIRES_AT: "2026-10-30T04:00:00Z",
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  for (const [key, value] of Object.entries(environment))
    vi.stubEnv(key, value);
  setTemporaryRiderIdentity(null);
});
afterEach(() => {
  setTemporaryRiderIdentity(null);
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it("requires development mode, an exact configured rider and a future expiry", () => {
  expect(readTemporaryRiderLocation(4, environment, now)).toEqual({
    riderId: 4,
    latitude: 14.186648,
    longitude: 121.231433,
    expiresAt: Date.parse(environment.VITE_RIDER_PREVIEW_EXPIRES_AT),
  });
  expect(
    readTemporaryRiderLocation(4, { ...environment, DEV: false }, now),
  ).toBeNull();
  expect(readTemporaryRiderLocation(5, environment, now)).toBeNull();
  expect(readTemporaryRiderLocation(null, environment, now)).toBeNull();
  expect(
    readTemporaryRiderLocation(
      4,
      {
        ...environment,
        VITE_RIDER_PREVIEW_EXPIRES_AT: new Date(now).toISOString(),
      },
      now,
    ),
  ).toBeNull();
  expect(
    readTemporaryRiderLocation(
      4,
      { ...environment, VITE_RIDER_PREVIEW_EXPIRES_AT: "not-a-date" },
      now,
    ),
  ).toBeNull();
});

it("accepts zero coordinates but rejects empty, out-of-range and non-finite values", () => {
  expect(
    readTemporaryRiderLocation(
      4,
      {
        ...environment,
        VITE_RIDER_PREVIEW_LATITUDE: "0",
        VITE_RIDER_PREVIEW_LONGITUDE: "0",
      },
      now,
    ),
  ).toMatchObject({ latitude: 0, longitude: 0 });
  for (const latitude of ["", " ", "91", "Infinity", "NaN"])
    expect(
      readTemporaryRiderLocation(
        4,
        { ...environment, VITE_RIDER_PREVIEW_LATITUDE: latitude },
        now,
      ),
    ).toBeNull();
  expect(
    readTemporaryRiderLocation(
      4,
      { ...environment, VITE_RIDER_PREVIEW_LONGITUDE: "-181" },
      now,
    ),
  ).toBeNull();
});

it("uses asynchronous demo positions for only the configured rider and cleans up without starting GPS", () => {
  setTemporaryRiderIdentity(4);
  const geo = { watchPosition: vi.fn(), clearWatch: vi.fn() };
  const position = vi.fn(),
    error = vi.fn();
  const stop = watchRiderLocation(geo, position, error);
  expect(position).not.toHaveBeenCalled();
  vi.advanceTimersByTime(0);
  expect(position).toHaveBeenLastCalledWith(
    expect.objectContaining({
      coords: expect.objectContaining({
        latitude: 14.186648,
        longitude: 121.231433,
        accuracy: 15,
      }),
      timestamp: now,
      source: "temporary-preview",
    }),
  );
  vi.advanceTimersByTime(5000);
  expect(position).toHaveBeenCalledTimes(2);
  expect(position.mock.calls[1][0].timestamp).toBe(now + 5000);
  expect(geo.watchPosition).not.toHaveBeenCalled();
  stop();
  vi.advanceTimersByTime(30000);
  expect(position).toHaveBeenCalledTimes(2);
  expect(error).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("stops immediately on expiry and does not fall back to native GPS", () => {
  vi.stubEnv(
    "VITE_RIDER_PREVIEW_EXPIRES_AT",
    new Date(now + 1000).toISOString(),
  );
  setTemporaryRiderIdentity(4);
  const geo = { watchPosition: vi.fn(), clearWatch: vi.fn() };
  const position = vi.fn(),
    error = vi.fn();
  watchRiderLocation(geo, position, error);
  vi.advanceTimersByTime(1000);
  expect(position).toHaveBeenCalledTimes(1);
  expect(error).toHaveBeenCalledWith(
    expect.objectContaining({ temporaryLocationExpired: true }),
  );
  expect(geo.watchPosition).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("cancels a queued initial position when the authenticated rider changes", () => {
  setTemporaryRiderIdentity(4);
  const geo = { watchPosition: vi.fn(), clearWatch: vi.fn() };
  const position = vi.fn(),
    error = vi.fn();
  watchRiderLocation(geo, position, error);
  setTemporaryRiderIdentity(5);
  vi.advanceTimersByTime(20000);
  expect(position).not.toHaveBeenCalled();
  expect(error).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it("keeps other riders on their normal GPS provider", () => {
  setTemporaryRiderIdentity(5);
  const geo = { watchPosition: vi.fn(() => 8), clearWatch: vi.fn() };
  const stop = watchRiderLocation(geo, vi.fn(), vi.fn());
  expect(geo.watchPosition).toHaveBeenCalledOnce();
  stop();
  expect(geo.clearWatch).toHaveBeenCalledWith(8);
});
