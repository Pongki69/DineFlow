import { CustomerScreenSkeleton } from "./components/CustomerScreenSkeleton";
import {
  subscribeToLiveChanges,
  enqueueLiveRefresh,
  notifyLiveChange,
} from "./liveUpdates";
import { useLiveMapSnapshot } from "./components/useLiveMapSnapshot";
import { restaurantMapIcon as pickupPin } from "./components/restaurantMapIcon";
import { Feedback, Skeleton, Button } from "./components/ui";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { privateEcho, initializeRealtime } from "./realtime";

import { api } from "./api";
import { MapControls } from "./components/MapControls";
import {
  CustomerOrderProgress,
  deliveryLabels,
  foodLabels,
} from "./components/CustomerOrderProgress";
import { RiderReviewForm } from "./components/RiderReviewForm";
import { TrackingDisclosureSummary } from "./components/TrackingDisclosureSummary";
import { useMediaQuery } from "./components/useMediaQuery";
import {
  DeliveryArrivalTimes,
  DeliveryPathLegend,
  RecordedDeliveryPath,
  arrivalLabel,
  recordedSegments,
} from "./components/DeliveryJourney";
import { DeliveryProofPhoto } from "./components/DeliveryProof";

const riderPin = L.divIcon({
  className: "delivery-pin",
  html: "<span></span>",
  iconSize: [24, 24],
  iconAnchor: [12, 22],
});
const terminal = ["delivered", "failed", "cancelled"];
const title = (s) => String(s || "").replaceAll("_", " ");
const destinationPin = L.divIcon({
  className: "customer-location-pin destination",
  html: '<span role="img" aria-label="Your delivery destination">D</span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});
function trackingPoint(point) {
  if (
    point?.latitude == null ||
    point?.longitude == null ||
    point.latitude === "" ||
    point.longitude === ""
  )
    return null;
  const lat = Number(point.latitude),
    lng = Number(point.longitude);
  return Number.isFinite(lat) &&
    Math.abs(lat) <= 90 &&
    Number.isFinite(lng) &&
    Math.abs(lng) <= 180
    ? [lat, lng]
    : null;
}
function TrackingViewport({ points }) {
  const map = useMap();
  const initialized = useRef(false);
  useEffect(() => {
    if (points.length && !initialized.current) {
      map.fitBounds(points, { padding: [80, 60], maxZoom: 15 });
      initialized.current = true;
    }
  }, [map, points]);
  return null;
}

export { RiderDeliveries } from "./features/RiderDeliveries";
export { DispatchDashboard } from "./features/DispatchDashboard";

function CompletedDeliveryMap({ children, deliveryId, needsRoute }) {
  // Phones open the map and times straight away.
  const phone = useMediaQuery("(max-width: 850px)");
  const [expanded, setExpanded] = useState(phone);
  const [suggestion, setSuggestion] = useState(null);
  const [routeError, setRouteError] = useState("");
  useEffect(() => {
    if (!expanded || !needsRoute) return;
    const controller = new AbortController();
    // Start on the next tick: a mount that is immediately undone (the map
    // opens on first render on phones) then sends no request at all.
    const timer = window.setTimeout(() => {
      setRouteError("");
      api(`/my/deliveries/${deliveryId}/route`, { signal: controller.signal })
        .then((result) => {
          if (!controller.signal.aborted) setSuggestion(result.data);
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setRouteError(
              "A suggested route is unavailable. The arrival times and location pins are still available.",
            );
        });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [expanded, needsRoute, deliveryId]);
  return (
    <details
      className="customer-completed-map"
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <TrackingDisclosureSummary meta="Map & times">
        Delivery locations
      </TrackingDisclosureSummary>
      {expanded && children(suggestion, routeError)}
    </details>
  );
}

export function CustomerDeliveryTracking({ user }) {
  const { deliveryId } = useParams();
  const phoneLayout = useMediaQuery("(max-width: 850px)");
  const [data, setData] = useState(null),
    [notifications, setNotifications] = useState([]),
    [error, setError] = useState("");
  const liveMap = useLiveMapSnapshot(
    `/my/deliveries/${deliveryId}`,
    ["locations", `delivery-map-${deliveryId}`],
    !!data && !terminal.includes(data.status),
  );
  const trackingRequest = useRef(null);
  async function load() {
    trackingRequest.current?.abort();
    const controller = new AbortController();
    trackingRequest.current = controller;
    try {
      const r = await api(`/my/deliveries/${deliveryId}`, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setData(r.data);
      api("/notifications", { signal: controller.signal })
        .then((n) => {
          if (!controller.signal.aborted)
            setNotifications(
              (n.data || [])
                .filter(
                  (x) =>
                    x.data?.context?.delivery_id === Number(deliveryId) ||
                    x.data?.delivery_id === Number(deliveryId),
                )
                .slice(0, 5),
            );
        })
        .catch(() => {});
      setError("");
    } catch (e) {
      if (!controller.signal.aborted) setError(e.message);
    }
  }
  useEffect(() => {
    setData(null);
    setNotifications([]);
    load();
    const unsubscribe = subscribeToLiveChanges(load, [
      "deliveries",
      "locations",
      "payments",
    ]);
    let echo = null;
    let active = true;
    initializeRealtime()
      .then(() => {
        if (!active) return;
        echo = privateEcho();
        echo
          ?.private(`delivery.${deliveryId}`)
          .listen(".delivery.updated", () => {
            notifyLiveChange([`delivery-map-${deliveryId}`]);
            enqueueLiveRefresh(load);
          });
      })
      .catch(() => {});
    return () => {
      active = false;
      unsubscribe();
      trackingRequest.current?.abort();
      echo?.leave(`delivery.${deliveryId}`);
      echo?.disconnect();
    };
  }, [deliveryId]);
  if (error && !data)
    return (
      <section className="welcome">
        <Feedback onRetry={load}>{error}</Feedback>
        <Link to="/my-orders">Back to my orders</Link>
      </section>
    );
  if (!data)
    return (
      <section className="welcome">
        <h1 className="sr-only">Your delivery</h1>
        <CustomerScreenSkeleton
          variant="tracking"
          label="Loading delivery status"
        />
      </section>
    );
  const mapData =
    liveMap &&
    Date.parse(liveMap.last_location_at || 0) >=
      Date.parse(data.last_location_at || 0)
      ? liveMap
      : data;
  const rider = trackingPoint(mapData.location),
    dest = trackingPoint(data.destination),
    pickup = trackingPoint(data.pickup);
  const segments = recordedSegments(
    mapData.recorded_path || data.recorded_path,
  );
  const points = [rider, pickup, dest, ...segments.flat()].filter(Boolean);
  const route = (data.route || [])
    .filter(
      (point) =>
        Array.isArray(point) &&
        point.length >= 2 &&
        Number.isFinite(Number(point[0])) &&
        Number.isFinite(Number(point[1])),
    )
    .map(([lng, lat]) => [Number(lat), Number(lng)]);
  const pickupPhase = ["accepted", "arrived_at_restaurant"].includes(
    data.status,
  );
  return (
    <section className="welcome customer-tracking">
      <span className="eyebrow">DELIVERY TRACKING</span>
      <div className="tracking-hero">
        <h1>Order {data.order_number}</h1>
        {phoneLayout && (
          <p className="tracking-hero-status" aria-hidden="true">
            <strong>
              {data.status === "pending_assignment" &&
              data.order_status !== "cancelled"
                ? foodLabels[data.order_status] || "Order received"
                : deliveryLabels[data.status] || "Delivery update"}
            </strong>
            <span>
              {data.status === "delivered"
                ? arrivalLabel(data.arrival_times?.delivered)
                  ? `Arrived at ${arrivalLabel(data.arrival_times.delivered)}`
                  : "Enjoy your meal"
                : data.eta && !mapData.tracking_stale && arrivalLabel(data.eta)
                  ? `Arriving around ${arrivalLabel(data.eta)}`
                  : terminal.includes(data.status)
                    ? "This delivery has ended"
                    : "We’ll keep this page up to date"}
            </span>
          </p>
        )}
        {error && (
          <Feedback onRetry={load}>
            Updates could not refresh. Showing the last available status.{" "}
            {error}
          </Feedback>
        )}
        <div className="track-status">
          <span className="tracking-update-chip">
            <span aria-hidden="true" />
            {terminal.includes(data.status) ? "Order history" : "Live updates"}
          </span>
          {!terminal.includes(data.status) && (
            <span className={mapData.tracking_stale ? "stale-note" : ""}>
              {mapData.last_location_at
                ? mapData.tracking_stale
                  ? "Location delayed"
                  : `GPS updated ${arrivalLabel(mapData.last_location_at)}`
                : "Waiting for GPS"}
            </span>
          )}
        </div>
      </div>
      <CustomerOrderProgress data={data}>
        {terminal.includes(data.status) ? (
          <CompletedDeliveryMap
            key={deliveryId}
            deliveryId={deliveryId}
            needsRoute={!segments.length && Boolean(pickup && dest)}
          >
            {(suggestion, routeError) => (
              <>
                <section
                  className="customer-completed-addresses"
                  aria-label="Delivery addresses"
                >
                  <DeliveryArrivalTimes times={data.arrival_times} />
                  <div className="tracking-address-pair">
                    <p>
                      <strong>Restaurant</strong>
                      {data.pickup?.address || "Address unavailable"}
                    </p>
                    <p>
                      <strong>Drop-off</strong>
                      {data.destination?.address || "Address unavailable"}
                    </p>
                  </div>
                  {points.length > 0 && (
                    <div
                      className="tracking-map"
                      role="region"
                      aria-label="Completed delivery map"
                    >
                      <MapContainer
                        center={points[0]}
                        zoom={14}
                        scrollWheelZoom
                      >
                        <MapControls
                          bounds={[
                            ...points,
                            ...(suggestion?.geometry || []).map(
                              ([lng, lat]) => [lat, lng],
                            ),
                          ]}
                          recenterLabel="Fit delivery journey"
                        />
                        <TrackingViewport
                          points={[
                            ...points,
                            ...(suggestion?.geometry || []).map(
                              ([lng, lat]) => [lat, lng],
                            ),
                          ]}
                        />
                        <TileLayer
                          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        {pickup && (
                          <Marker
                            position={pickup}
                            icon={pickupPin}
                            title="Restaurant pickup"
                          >
                            {arrivalLabel(data.arrival_times?.restaurant) && (
                              <Tooltip
                                permanent
                                direction="top"
                                offset={[0, -12]}
                              >
                                At restaurant ·{" "}
                                {arrivalLabel(data.arrival_times.restaurant)}
                              </Tooltip>
                            )}
                          </Marker>
                        )}
                        {dest && (
                          <Marker
                            position={dest}
                            icon={destinationPin}
                            title="Your delivery destination"
                          >
                            {arrivalLabel(data.arrival_times?.delivered) && (
                              <Tooltip
                                permanent
                                direction="bottom"
                                offset={[0, 12]}
                              >
                                Delivered ·{" "}
                                {arrivalLabel(data.arrival_times.delivered)}
                              </Tooltip>
                            )}
                          </Marker>
                        )}
                        <RecordedDeliveryPath segments={segments} />
                        {!segments.length &&
                          suggestion?.geometry?.length > 1 && (
                            <Polyline
                              positions={suggestion.geometry.map(
                                ([lng, lat]) => [lat, lng],
                              )}
                              pathOptions={{
                                color: "#795e27",
                                weight: 4,
                                dashArray: "8 8",
                                className: "suggested-delivery-path",
                              }}
                            />
                          )}
                      </MapContainer>
                    </div>
                  )}
                </section>
                <DeliveryPathLegend
                  recorded={segments.length > 0}
                  suggested={
                    !segments.length && suggestion?.geometry?.length > 1
                  }
                  error={routeError}
                />
                {suggestion?.provider === "geoapify" && (
                  <p className="customer-progress-note map-help">
                    Suggested routing powered by{" "}
                    <a
                      href="https://www.geoapify.com/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Geoapify
                    </a>
                    .
                  </p>
                )}
              </>
            )}
          </CompletedDeliveryMap>
        ) : (
          <section
            className="customer-tracking-map"
            aria-labelledby="delivery-map-heading"
          >
            <h2 id="delivery-map-heading">
              {terminal.includes(data.status)
                ? "Delivery locations"
                : pickupPhase
                  ? "Rider and restaurant"
                  : "Your delivery map"}
            </h2>
            <DeliveryArrivalTimes
              times={data.arrival_times}
              eta={data.eta}
              stale={mapData.tracking_stale}
            />
            {points.length ? (
              <div
                className="tracking-map"
                role="region"
                aria-label="Restaurant, delivery destination and rider map"
              >
                <MapContainer center={points[0]} zoom={14} scrollWheelZoom>
                  <MapControls
                    bounds={points}
                    recenterLabel="Fit delivery locations"
                  />
                  <TrackingViewport points={points} />
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  {pickup && (
                    <Marker
                      position={pickup}
                      icon={pickupPin}
                      title="Restaurant pickup"
                      alt="Restaurant pickup"
                    >
                      <Popup>Restaurant · {data.pickup.address}</Popup>
                      {arrivalLabel(data.arrival_times?.restaurant) && (
                        <Tooltip permanent direction="top" offset={[0, -12]}>
                          At restaurant ·{" "}
                          {arrivalLabel(data.arrival_times.restaurant)}
                        </Tooltip>
                      )}
                    </Marker>
                  )}
                  {dest && (
                    <Marker
                      position={dest}
                      icon={destinationPin}
                      title="Your delivery destination"
                      alt="Your delivery destination"
                    >
                      <Popup>
                        Your destination · {data.destination.address}
                      </Popup>
                      {data.eta &&
                        !mapData.tracking_stale &&
                        arrivalLabel(data.eta) && (
                          <Tooltip
                            permanent
                            direction="bottom"
                            offset={[0, 12]}
                          >
                            Estimated arrival · {arrivalLabel(data.eta)}
                          </Tooltip>
                        )}
                    </Marker>
                  )}
                  {rider && (
                    <Marker
                      position={rider}
                      icon={riderPin}
                      title={
                        mapData.tracking_stale
                          ? "Last known rider location"
                          : "Your rider"
                      }
                      alt={
                        mapData.tracking_stale
                          ? "Last known rider location"
                          : "Your rider"
                      }
                    >
                      <Popup>
                        {mapData.tracking_stale
                          ? "Last known rider location (may be outdated)"
                          : "Your rider"}
                      </Popup>
                    </Marker>
                  )}
                  {!pickupPhase && route.length > 1 && (
                    <Polyline
                      positions={route}
                      pathOptions={{
                        color: "#795e27",
                        weight: 4,
                        dashArray: "8 8",
                      }}
                    />
                  )}
                  <RecordedDeliveryPath segments={segments} />
                </MapContainer>
              </div>
            ) : (
              <p className="customer-progress-note">
                Map coordinates are unavailable. Your status and address updates
                remain available.
              </p>
            )}
            <div className="tracking-map-legend">
              <span>R · Restaurant</span>
              <span>D · Your destination</span>
              <span>
                Green pin · Rider
                {mapData.tracking_stale && rider ? " (last known)" : ""}
              </span>
            </div>
            <DeliveryPathLegend
              recorded={segments.length > 0}
              remaining={!pickupPhase && route.length > 1}
            />
            {data.map_provider === "geoapify" && (
              <p className="customer-progress-note map-help">
                Routing powered by{" "}
                <a
                  href="https://www.geoapify.com/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Geoapify
                </a>
                .
              </p>
            )}
          </section>
        )}
      </CustomerOrderProgress>
      {data.status === "delivered" && (
        <RiderReviewForm
          key={deliveryId}
          deliveryId={deliveryId}
          review={data.review}
          rating={data.rating}
          user={user}
          onSaved={load}
        />
      )}
      {data.status === "delivered" && data.proof_available && (
        <DeliveryProofPhoto key={deliveryId} deliveryId={deliveryId} />
      )}
      {notifications.length > 0 && (
        <details
          className="customer-progress-card delivery-notifications"
          open={phoneLayout || undefined}
        >
          <TrackingDisclosureSummary meta={`${notifications.length} messages`}>
            Notifications
          </TrackingDisclosureSummary>
          {notifications.map((n) => (
            <p key={n.id}>
              {n.data.message} · {new Date(n.created_at).toLocaleTimeString()}
            </p>
          ))}
        </details>
      )}
      <Link to="/my-orders">Back to my orders</Link>
    </section>
  );
}
