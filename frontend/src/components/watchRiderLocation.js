import { watchTemporaryRiderLocation } from "./temporaryRiderLocation";

// Desktops may have network positioning but no high-accuracy GPS fix.
export function watchRiderLocation(geolocation, onPosition, onError) {
  const stopPreview = watchTemporaryRiderLocation(onPosition, onError);
  if (stopPreview) return stopPreview;
  let active = true;
  let watch;
  let generation = 0;
  function start(highAccuracy) {
    const current = ++generation;
    watch = geolocation.watchPosition(
      (position) => {
        if (active && current === generation) onPosition(position);
      },
      (error) => {
        if (!active || current !== generation) return;
        if (error.code !== 1 && highAccuracy) {
          geolocation.clearWatch(watch);
          start(false);
          return;
        }
        onError(error);
      },
      {
        enableHighAccuracy: highAccuracy,
        maximumAge: highAccuracy ? 5000 : 30000,
        timeout: highAccuracy ? 12000 : 25000,
      },
    );
  }
  start(true);
  return () => {
    active = false;
    generation++;
    geolocation.clearWatch(watch);
  };
}
