import { useEffect } from "react";
import { api } from "../api";
import { subscribeToRestaurantLocation } from "../realtime";
import { usePollingResource } from "./usePollingResource";
import { useLiveMapSnapshot } from "./useLiveMapSnapshot";

// The administrator's saved outlet is authoritative for all current-location views.
// Delivery records retain their own pickup snapshots.
export function useRestaurantLocation() {
  const resource = usePollingResource(
    ({ signal }) => api("/restaurant/location", { signal }),
    { resourceKey: "restaurant-location", topics: ["settings"] },
  );
  const liveLocation = useLiveMapSnapshot(
    "/restaurant/location",
    ["settings", "public-location"],
    true,
    resource.updatedAt,
  );
  useEffect(
    () => subscribeToRestaurantLocation(resource.refresh),
    [resource.refresh],
  );
  const location = resource.data?.data || null;
  const mapLocation =
    liveLocation && location
      ? {
          ...location,
          latitude: liveLocation.latitude,
          longitude: liveLocation.longitude,
        }
      : location;
  return {
    ...resource,
    location: mapLocation,
    provider: resource.data?.map_provider,
    revision: JSON.stringify([mapLocation, resource.data?.location_version]),
  };
}
