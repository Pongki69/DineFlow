import { useEffect, useState } from "react";
import { api } from "../api";
import { subscribeToMapChanges } from "../liveUpdates";

// A map-only snapshot never replaces the surrounding list, opens dialogs, or moves focus.
export function useLiveMapSnapshot(
  path,
  topics = ["locations"],
  enabled = true,
  baselineTime = 0,
) {
  const [snapshot, setSnapshot] = useState(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true,
      inFlight = false,
      trailing = false;
    const controller = new AbortController();
    async function refresh() {
      if (!active) return;
      if (inFlight) {
        trailing = true;
        return;
      }
      inFlight = true;
      try {
        const result = await api(path, {
          signal: controller.signal,
          mapSnapshot: true,
        });
        if (active)
          setSnapshot({ path, data: result.data, receivedAt: Date.now() });
      } catch {
        /* Keep the last known pins until transport recovers. */
      } finally {
        inFlight = false;
        if (active && trailing) {
          trailing = false;
          refresh();
        }
      }
    }
    const stop = subscribeToMapChanges(refresh, topics);
    return () => {
      active = false;
      controller.abort();
      stop();
    };
  }, [path, enabled, JSON.stringify(topics)]);
  return enabled &&
    snapshot?.path === path &&
    snapshot.receivedAt >= Number(baselineTime || 0)
    ? snapshot.data
    : null;
}

export function mergeFleetLocations(fleet, latest) {
  const byId = new Map((latest || []).map((rider) => [rider.id, rider]));
  return fleet.map((rider) => {
    const update = byId.get(rider.id);
    if (
      !update ||
      !update.located_at ||
      Date.parse(update.located_at) < Date.parse(rider.located_at || 0)
    )
      return rider;
    return {
      ...rider,
      latitude: update.latitude,
      longitude: update.longitude,
      located_at: update.located_at,
    };
  });
}
