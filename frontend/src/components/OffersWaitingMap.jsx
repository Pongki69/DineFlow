import { useEffect } from "react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { restaurantMapIcon } from "./restaurantMapIcon";
import { useRestaurantLocation } from "./useRestaurantLocation";

const point = (place) =>
  Number.isFinite(Number(place?.latitude)) &&
  Number.isFinite(Number(place?.longitude)) &&
  (Number(place.latitude) !== 0 || Number(place.longitude) !== 0)
    ? [Number(place.latitude), Number(place.longitude)]
    : null;

// Keeps the rider, the store and the search circle in view as they change.
function Frame({ rider, store, radiusKm }) {
  const map = useMap();
  const key = JSON.stringify([rider, store, radiusKm]);
  // The card settles its size after the map mounts; measure again then.
  useEffect(() => {
    const container = map.getContainer();
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);
  useEffect(() => {
    map.invalidateSize();
    const [here, shop, km] = JSON.parse(key);
    const bounds = here
      ? L.latLng(here).toBounds(km * 2000)
      : L.latLngBounds([shop]);
    if (shop) bounds.extend(shop);
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
  }, [map, key]);
  return null;
}

/**
 * While a rider waits for offers: where they are, where the store is and how
 * far the search reaches. Offline, only the store is shown.
 */
export function OffersWaitingMap({ rider, radiusKm = 3, searching }) {
  const { location: store } = useRestaurantLocation();
  const riderPoint = searching ? point(rider) : null;
  const storePoint = point(store);
  const center = riderPoint || storePoint;
  if (!center) return null;
  return (
    <div
      className="offers-waiting-map"
      data-searching={searching || undefined}
      aria-label={
        searching
          ? `Map: searching within ${radiusKm} km of your location`
          : "Map: the store"
      }
      role="img"
    >
      <MapContainer
        center={center}
        zoom={14}
        zoomControl={false}
        attributionControl={false}
        scrollWheelZoom={false}
        className="dineflow-map"
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {riderPoint && (
          <Circle
            center={riderPoint}
            radius={radiusKm * 1000}
            pathOptions={{
              color: "#245440",
              weight: 1.5,
              dashArray: "6 6",
              fillColor: "#245440",
              fillOpacity: 0.07,
            }}
          />
        )}
        {storePoint && (
          <Marker position={storePoint} icon={restaurantMapIcon} />
        )}
        {riderPoint && (
          <CircleMarker
            center={riderPoint}
            radius={8}
            pathOptions={{
              color: "#ffffff",
              weight: 3,
              fillColor: "#2f6fd6",
              fillOpacity: 1,
            }}
          />
        )}
        <Frame rider={riderPoint} store={storePoint} radiusKm={radiusKm} />
      </MapContainer>
      <small className="offers-waiting-map-credit">© OpenStreetMap</small>
    </div>
  );
}
