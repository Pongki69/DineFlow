import { useEffect } from "react";
import { api } from "../api";
import { subscribeToRestaurantLocation } from "../realtime";
import { usePollingResource } from "./usePollingResource";

// The administrator's saved outlet is authoritative for all current-location views.
// Delivery records retain their own pickup snapshots.
export function useRestaurantLocation() {
  const resource = usePollingResource(
    ({ signal }) => api("/restaurant/location", { signal }),
    { resourceKey: "restaurant-location", intervalMs: 30000 },
  );
  useEffect(
    () => subscribeToRestaurantLocation(resource.refresh),
    [resource.refresh],
  );
  return {
    ...resource,
    location: resource.data?.data || null,
    provider: resource.data?.map_provider,
    revision: JSON.stringify([
      resource.data?.data,
      resource.data?.location_version,
    ]),
  };
}
