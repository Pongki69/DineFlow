let activeRiderId = null;
const identityListeners = new Set();

function coordinate(value, minimum, maximum) {
  if (
    value == null ||
    (typeof value === "string" && !value.trim()) ||
    !["string", "number"].includes(typeof value)
  )
    return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum
    ? number
    : null;
}

// Explicitly configured, expiring development data never replaces production GPS.
export function readTemporaryRiderLocation(
  riderId,
  environment = import.meta.env,
  now = Date.now(),
) {
  if (environment.DEV !== true) return null;
  const configuredId = Number(environment.VITE_RIDER_PREVIEW_USER_ID);
  if (
    !Number.isSafeInteger(configuredId) ||
    configuredId <= 0 ||
    Number(riderId) !== configuredId
  )
    return null;
  const latitude = coordinate(environment.VITE_RIDER_PREVIEW_LATITUDE, -90, 90);
  const longitude = coordinate(
    environment.VITE_RIDER_PREVIEW_LONGITUDE,
    -180,
    180,
  );
  const expiresAt = Date.parse(environment.VITE_RIDER_PREVIEW_EXPIRES_AT);
  if (
    latitude === null ||
    longitude === null ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= now
  )
    return null;
  return { riderId: configuredId, latitude, longitude, expiresAt };
}

export function setTemporaryRiderIdentity(riderId) {
  const number = Number(riderId);
  const next = Number.isSafeInteger(number) && number > 0 ? number : null;
  if (activeRiderId === next) return;
  activeRiderId = next;
  identityListeners.forEach((listener) => listener());
}

export function activeTemporaryRiderLocation() {
  return readTemporaryRiderLocation(activeRiderId);
}

export function watchTemporaryRiderLocation(onPosition, onError) {
  const configured = activeTemporaryRiderLocation();
  if (!configured) return null;
  let active = true;
  let initial;
  let interval;
  let expiry;

  function stop() {
    active = false;
    clearTimeout(initial);
    clearInterval(interval);
    clearTimeout(expiry);
    identityListeners.delete(identityChanged);
  }
  function expired() {
    if (!active) return;
    stop();
    onError({
      code: 2,
      message:
        "The temporary demo location has expired or is no longer active.",
      temporaryLocationExpired: true,
    });
  }
  function identityChanged() {
    if (activeRiderId !== configured.riderId) expired();
  }
  function emit() {
    if (!active) return;
    const current = readTemporaryRiderLocation(activeRiderId);
    if (!current || current.riderId !== configured.riderId) {
      expired();
      return;
    }
    onPosition({
      coords: {
        latitude: current.latitude,
        longitude: current.longitude,
        accuracy: 15,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: 0,
      },
      timestamp: Date.now(),
      source: "temporary-preview",
    });
  }
  function scheduleExpiry() {
    const remaining = configured.expiresAt - Date.now();
    if (remaining <= 0) {
      expired();
      return;
    }
    expiry = setTimeout(scheduleExpiry, Math.min(remaining, 2147483647));
  }
  identityListeners.add(identityChanged);
  initial = setTimeout(emit, 0);
  interval = setInterval(emit, 5000);
  scheduleExpiry();
  return stop;
}
