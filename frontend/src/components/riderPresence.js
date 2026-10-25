import { useSyncExternalStore } from "react";
let snapshot = { state: "checking", locatedAt: null };
const listeners = new Set();
export function updateRiderPresence(next) {
  if (snapshot.state === next.state && snapshot.locatedAt === next.locatedAt)
    return;
  snapshot = next;
  listeners.forEach((fn) => fn());
}
function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function useRiderPresence() {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
}
