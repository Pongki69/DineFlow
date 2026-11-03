// Browsers only offer location on secure pages (https:// or localhost). On a
// plain http:// address, such as a phone opening the dev server by its LAN IP,
// the request fails as "permission denied" without ever showing a prompt, so
// riders need the real fix rather than "allow location access".
export const INSECURE_LOCATION_MESSAGE =
  "Location needs a secure connection. Open DineFlow with an https:// address (or on this device at localhost); on plain http:// the browser blocks location without asking.";

export function locationNeedsSecureContext() {
  return typeof window !== "undefined" && window.isSecureContext === false;
}

// Message for a permission (code 1) failure: the secure-connection fix when
// that is the cause, otherwise the caller's usual wording.
export function locationDeniedMessage(fallback) {
  return locationNeedsSecureContext() ? INSECURE_LOCATION_MESSAGE : fallback;
}
