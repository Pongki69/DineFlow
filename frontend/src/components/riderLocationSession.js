import { watchRiderLocation } from "./watchRiderLocation";

// Location is collected only while an explicitly enabled consumer subscribes.
// Consumers own their sharing scope: this module never sends coordinates or
// keeps a position after the final consumer leaves.
const sessions = new WeakMap();

export function subscribeRiderLocation(geolocation, onPosition, onError) {
  let session = sessions.get(geolocation);
  if (!session) {
    session = { consumers: new Set(), stop: null };
    sessions.set(geolocation, session);
  }
  const consumer = { onPosition, onError };
  let subscribed = true;
  session.consumers.add(consumer);

  if (!session.stop) {
    session.stop = watchRiderLocation(
      geolocation,
      (position) => {
        for (const current of [...session.consumers]) {
          if (session.consumers.has(current)) current.onPosition(position);
        }
      },
      (error) => {
        for (const current of [...session.consumers]) {
          if (session.consumers.has(current)) current.onError(error);
        }
      },
    );
    // Also handles synchronous geolocation callbacks in supported adapters.
    if (!session.consumers.size) session.stop();
  }

  return () => {
    if (!subscribed) return;
    subscribed = false;
    session.consumers.delete(consumer);
    if (!session.consumers.size) {
      session.stop?.();
      sessions.delete(geolocation);
    }
  };
}
