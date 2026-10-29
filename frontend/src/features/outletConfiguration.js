export function hasOutletCoordinates(location) {
  return [
    [location?.latitude, 90],
    [location?.longitude, 180],
  ].every(
    ([value, limit]) =>
      value != null &&
      String(value).trim() !== "" &&
      Number.isFinite(Number(value)) &&
      Math.abs(Number(value)) <= limit,
  );
}

export function isOutletConfigured(location) {
  return (
    !!location?.name?.trim() &&
    !!location?.address?.trim() &&
    hasOutletCoordinates(location)
  );
}
