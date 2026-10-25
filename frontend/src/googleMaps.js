let pending;

export function loadGoogleMaps(key) {
  if (window.google?.maps?.importLibrary)
    return Promise.resolve(window.google.maps);
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const fail = () => {
      pending = null;
      script.remove();
      delete window.dineFlowMapsReady;
      reject(
        new Error(
          "Google Maps could not load. Check your connection and Google Maps key.",
        ),
      );
    };
    window.dineFlowMapsReady = () => {
      clearTimeout(timer);
      delete window.dineFlowMapsReady;
      resolve(window.google.maps);
    };
    const timer = setTimeout(fail, 20000);
    script.onerror = () => {
      clearTimeout(timer);
      fail();
    };
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({ key, loading: "async", callback: "dineFlowMapsReady", v: "weekly", region: "PH", language: "en" })}`;
    document.head.append(script);
  });
  return pending;
}

export function googlePosition(location) {
  if (
    location?.latitude == null ||
    location?.longitude == null ||
    location.latitude === "" ||
    location.longitude === ""
  )
    return null;
  const lat = Number(location.latitude),
    lng = Number(location.longitude);
  return Number.isFinite(lat) &&
    Math.abs(lat) <= 90 &&
    Number.isFinite(lng) &&
    Math.abs(lng) <= 180
    ? { lat, lng }
    : null;
}
