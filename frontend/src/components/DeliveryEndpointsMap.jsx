import { restaurantMapIcon as storePin } from "./restaurantMapIcon";
import { useEffect, useState } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import { MapPin, Store } from "lucide-react";
import L from "leaflet";
import { EmptyState } from "./ui";
import { api } from "../api";
import { MapControls } from "./MapControls";
import "leaflet/dist/leaflet.css";
import "./deliveryEndpointsMap.css";

function point(location) {
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
    ? [lat, lng]
    : null;
}

const dropoffPin = L.divIcon({
  className: "delivery-endpoint-pin dropoff",
  html: '<span role="img" aria-label="Drop-off location">D</span>',
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

function FitEndpoints({ coordinates }) {
  const map = useMap();
  const key = JSON.stringify(coordinates);
  useEffect(() => {
    map.invalidateSize();
    map.fitBounds(coordinates, { padding: [45, 45], maxZoom: 16 });
  }, [map, key]);
  return null;
}

export function DeliveryEndpointsMap({ deliveryId, pickup, destination }) {
  const store = point(pickup),
    dropoff = point(destination);
  const coordinates = [store, dropoff].filter(Boolean);
  const [tileError, setTileError] = useState(false);
  const [route, setRoute] = useState(null),
    [routeError, setRouteError] = useState(false),
    [loadingRoute, setLoadingRoute] = useState(false),
    [retry, setRetry] = useState(0);
  const coordinateKey = JSON.stringify(coordinates);
  useEffect(() => {
    if (!deliveryId || coordinates.length !== 2) return;
    const controller = new AbortController();
    setLoadingRoute(true);
    setRoute(null);
    setRouteError(false);
    api(`/rider/deliveries/${deliveryId}/route`, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        const geometry = result.data?.geometry;
        if (
          !Array.isArray(geometry) ||
          geometry.length < 2 ||
          !geometry.every(
            (p) =>
              Array.isArray(p) &&
              p.length >= 2 &&
              Number.isFinite(p[0]) &&
              Math.abs(p[0]) <= 180 &&
              Number.isFinite(p[1]) &&
              Math.abs(p[1]) <= 90,
          )
        )
          throw new Error("Route unavailable");
        setRoute(geometry.map(([lng, lat]) => [lat, lng]));
      })
      .catch(() => {
        if (!controller.signal.aborted) setRouteError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingRoute(false);
      });
    return () => controller.abort();
  }, [deliveryId, coordinateKey, retry]);
  return (
    <section
      className="workspace-card delivery-endpoints-card"
      aria-label="Store and drop-off locations"
    >
      <h2>
        <span className="rider-detail-icon">
          <MapPin size={20} aria-hidden="true" />
        </span>
        Delivery locations
      </h2>
      <div className="delivery-endpoints-legend">
        <div>
          <span className="delivery-endpoint-key store">
            <Store size={18} aria-hidden="true" />
          </span>
          <p>
            <strong>Store · S</strong>
            <span>{pickup?.address || "Address not recorded"}</span>
          </p>
        </div>
        <div>
          <span className="delivery-endpoint-key dropoff">
            <MapPin size={18} aria-hidden="true" />
          </span>
          <p>
            <strong>Drop-off · D</strong>
            <span>{destination?.address || "Address not recorded"}</span>
          </p>
        </div>
      </div>
      {coordinates.length === 2 && (
        <div className="delivery-route-caption" role="status">
          {loadingRoute ? (
            "Finding the road route…"
          ) : routeError ? (
            <>
              <span>
                Road route unavailable. Location pins are still shown.
              </span>
              <button
                type="button"
                onClick={() => setRetry((value) => value + 1)}
              >
                Retry route
              </button>
            </>
          ) : route ? (
            <>
              <span className="delivery-route-line-key" aria-hidden="true" />
              <span>Suggested road route · not a recorded GPS journey</span>
            </>
          ) : null}
        </div>
      )}
      {!coordinates.length ? (
        <EmptyState
          title="Map locations unavailable"
          description="The location pins were not recorded for this delivery."
        />
      ) : (
        <>
          {(!store || !dropoff) && (
            <p role="status">
              Only the recorded location is shown. The other location pin is
              unavailable.
            </p>
          )}
          {tileError && (
            <p role="status">
              Map tiles could not load. You can still read the saved addresses
              above.
            </p>
          )}
          <div
            className="delivery-endpoints-map"
            role="region"
            aria-label="Map of store and drop-off"
          >
            <MapContainer center={coordinates[0]} zoom={14} scrollWheelZoom>
              <FitEndpoints coordinates={[...coordinates, ...(route || [])]} />
              <MapControls
                bounds={[...coordinates, ...(route || [])]}
                recenterLabel="Fit store and drop-off"
              />
              {route && (
                <Polyline
                  positions={route}
                  pathOptions={{
                    color: "#2e5a43",
                    weight: 5,
                    opacity: 0.9,
                    className: "delivery-suggested-road-route",
                  }}
                />
              )}
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                eventHandlers={{ tileerror: () => setTileError(true) }}
              />
              {store && (
                <Marker
                  position={store}
                  icon={storePin}
                  title="Store location"
                  alt="Store location"
                >
                  <Popup>
                    <strong>Store</strong>
                    <br />
                    {pickup?.address || "Restaurant"}
                  </Popup>
                </Marker>
              )}
              {dropoff && (
                <Marker
                  position={dropoff}
                  icon={dropoffPin}
                  title="Drop-off location"
                  alt="Drop-off location"
                >
                  <Popup>
                    <strong>Drop-off</strong>
                    <br />
                    {destination?.address || "Delivery destination"}
                  </Popup>
                </Marker>
              )}
            </MapContainer>
          </div>
        </>
      )}
    </section>
  );
}
