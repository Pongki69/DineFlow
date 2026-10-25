import { Fragment, useEffect, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  Circle,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  ArrowDown,
  ArrowUp,
  LocateFixed,
  Route,
  Maximize2,
  Minimize2,
  Store,
  CornerDownLeft,
} from "lucide-react";
import { api } from "../api";
import { Button } from "./ui";
import { subscribeRiderLocation } from "./riderLocationSession";
import { stopArrivalText, trafficOverlays } from "./riderRouteDisplay";
import { restaurantMapIcon as storeIcon } from "./restaurantMapIcon";
import { useRiderPresence } from "./riderPresence";
import {
  nearestDeliveryOrder,
  respectsBatchOrder,
  validRoutePoint,
  orderedRouteDeliveries,
} from "./riderRoutePlanning";
import "./riderRoutePlanner.css";

function RouteViewport({
  stops,
  position,
  follow,
  fitVersion,
  focusTarget,
  customerMarkers,
}) {
  const map = useMap();
  const stopKey = JSON.stringify(stops.map((s) => [s.latitude, s.longitude]));
  useEffect(() => {
    const points = JSON.parse(stopKey);
    if (position) points.push([position.latitude, position.longitude]);
    if (points.length)
      map.fitBounds(points, {
        paddingTopLeft: [40, 64],
        paddingBottomRight: [40, 40],
        maxZoom: 16,
      });
    // Live updates move only the marker unless Follow me is selected.
  }, [map, stopKey, fitVersion]);
  useEffect(() => {
    if (follow && position) map.panTo([position.latitude, position.longitude]);
  }, [map, position, follow]);
  useEffect(() => {
    if (!focusTarget) return;
    map.setView(
      [focusTarget.latitude, focusTarget.longitude],
      Math.max(map.getZoom(), 16),
      { animate: false },
    );
    customerMarkers.current.get(focusTarget.id)?.openPopup();
    map.getContainer().scrollIntoView?.({
      block: "nearest",
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, [map, focusTarget, customerMarkers, stopKey]);
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

const locationIcon = L.divIcon({
  className: "rider-live-marker",
  html: "<span></span>",
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});
const stopIcon = (number, kind, selected = false) =>
  L.divIcon({
    className: `rider-customer-marker ${kind}${selected ? " is-selected" : ""}`,
    html: `<span class="rider-customer-pin"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg><b>${number}</b></span>`,
    iconSize: [48, 44],
    iconAnchor: [24, 44],
  });

export function RiderRoutePlanner({
  deliveries,
  deliveryOrder,
  onOrderChange,
  onApplyOrder,
  orderDirty = false,
  savingOrder = false,
  onSelectDelivery,
  selectedDeliveryId,
  selectedDeliveryPanel,
}) {
  const [localOrder, setLocalOrder] = useState([]);
  const [showSelected, setShowSelected] = useState(false);
  useEffect(() => {
    if (selectedDeliveryId) setShowSelected(true);
  }, [selectedDeliveryId]);
  const presence = useRiderPresence();
  const order = deliveryOrder ?? localOrder;
  const updateOrder = onOrderChange ?? setLocalOrder;
  const setOrder = (nextOrder) => {
    if (!savingOrder) updateOrder(nextOrder);
  };
  const [plan, setPlan] = useState(null);
  const [knownStores, setKnownStores] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [returnToStore, setReturnToStore] = useState(false);
  const [returnStoreKey, setReturnStoreKey] = useState("");
  const [locating, setLocating] = useState(false);
  const [position, setPosition] = useState(null);
  const [origin, setOrigin] = useState(null);
  const [gpsError, setGpsError] = useState("");
  const [follow, setFollow] = useState(true);
  const [fitVersion, setFitVersion] = useState(0);
  const [gpsAttempt, setGpsAttempt] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [focusTarget, setFocusTarget] = useState(null);
  const customerMarkers = useRef(new Map());
  const sectionRef = useRef(null);
  const fullscreenButtonRef = useRef(null);
  const nativeFullscreenRef = useRef(false);
  const lastRouteAt = useRef(0);
  const available = deliveries.filter(
    (d) => !["delivered", "failed", "cancelled"].includes(d.status),
  );
  const ordered = orderedRouteDeliveries(available, order);
  const ids = ordered.map((d) => d.id);
  const requestKey = JSON.stringify({
    delivery_ids: ids,
    origin,
    return_to_store: returnToStore || !ids.length,
    ...(returnStoreKey ? { return_store_key: returnStoreKey } : {}),
    statuses: ordered.map((d) => [
      d.status,
      d.order.pickup,
      d.order.destination,
    ]),
  });

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setBusy(true);
      setError("");
      try {
        const payload = JSON.parse(requestKey);
        delete payload.statuses;
        const result = await api("/rider/route-plan", {
          method: "POST",
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setPlan(result.data);
          if (result.data.stores?.length) setKnownStores(result.data.stores);
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(e.message);
          setPlan(null);
        }
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [requestKey, retry]);

  useEffect(() => {
    if (!locating) return;
    if (!navigator.geolocation) return;
    return subscribeRiderLocation(
      navigator.geolocation,
      (p) => {
        const next = {
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          accuracy: p.coords.accuracy,
          recordedAt: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        };
        setPosition(next);
        setGpsError("");
        if (Date.now() - lastRouteAt.current >= 45000) {
          lastRouteAt.current = Date.now();
          setOrigin({ latitude: next.latitude, longitude: next.longitude });
        }
      },
      (e) => {
        setGpsError(
          e.code === 1
            ? "Location access was denied. Allow location access for this site in your browser and enable Windows Location services, then try again."
            : "Your device could not determine its location, including network positioning. Enable Windows Location services and browser location access, then retry. A phone with GPS may provide a better fix.",
        );
        if (e.code === 1) {
          setLocating(false);
          setPosition(null);
          setOrigin(null);
        }
      },
    );
  }, [locating, gpsAttempt]);

  useEffect(() => {
    const changed = () => {
      if (document.fullscreenElement === sectionRef.current) {
        nativeFullscreenRef.current = true;
        setExpanded(true);
      } else if (nativeFullscreenRef.current) {
        nativeFullscreenRef.current = false;
        setExpanded(false);
        fullscreenButtonRef.current?.focus();
      }
    };
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);
  useEffect(() => {
    if (!expanded) return;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    fullscreenButtonRef.current?.focus();
    function keydown(event) {
      if (
        document.querySelector("dialog[open]") &&
        !sectionRef.current?.contains(document.activeElement)
      )
        return;
      if (event.key === "Escape" && !document.fullscreenElement) {
        setExpanded(false);
        fullscreenButtonRef.current?.focus();
      }
      if (event.key === "Tab") {
        const controls = [
          ...sectionRef.current.querySelectorAll(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]',
          ),
        ].filter((el) => el.getClientRects().length);
        const first = controls[0],
          last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        }
        if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener("keydown", keydown);
    };
  }, [expanded]);

  async function toggleFullscreen() {
    if (expanded) {
      if (document.fullscreenElement === sectionRef.current)
        await document.exitFullscreen();
      setExpanded(false);
      fullscreenButtonRef.current?.focus();
      return;
    }
    try {
      await sectionRef.current.requestFullscreen?.();
    } catch {
      /* Use the expanded layout when native fullscreen is unavailable. */
    }
    setExpanded(true);
  }

  function toggleLocation() {
    if (locating) {
      setLocating(false);
      setPosition(null);
      setOrigin(null);
      return;
    }
    if (!navigator.geolocation) {
      setGpsError("This browser does not support live location.");
      return;
    }
    lastRouteAt.current = 0;
    setGpsError("");
    setFollow(true);
    setLocating(true);
  }
  function move(index, direction) {
    const next = [...ordered];
    [next[index], next[index + direction]] = [
      next[index + direction],
      next[index],
    ];
    if (respectsBatchOrder(next)) setOrder(next.map((d) => d.id));
  }
  function canMove(index, direction) {
    if (index + direction < 0 || index + direction >= ordered.length)
      return false;
    const next = [...ordered];
    [next[index], next[index + direction]] = [
      next[index + direction],
      next[index],
    ];
    return respectsBatchOrder(next);
  }
  function focusDelivery(delivery) {
    setShowSelected(true);
    onSelectDelivery?.(delivery.id);
    if (!validRoutePoint(delivery.order.destination)) return;
    setFollow(false);
    setFocusTarget({
      id: delivery.id,
      latitude: Number(delivery.order.destination.latitude),
      longitude: Number(delivery.order.destination.longitude),
    });
  }
  function registerCustomerMarker(id, marker) {
    if (marker) customerMarkers.current.set(id, marker);
    else customerMarkers.current.delete(id);
  }
  const stops = plan?.stops || [];
  const fallbackStores = deliveries
    .map((d) => d.order.pickup)
    .filter(validRoutePoint)
    .filter(
      (p, i, all) =>
        all.findIndex(
          (other) =>
            Number(other.latitude) === Number(p.latitude) &&
            Number(other.longitude) === Number(p.longitude),
        ) === i,
    );
  const stores = plan?.stores?.length
    ? plan.stores
    : knownStores.length
      ? knownStores
      : fallbackStores;
  const fallbackPoints = ordered
    .flatMap((d) => [d.order.pickup, d.order.destination])
    .filter(validRoutePoint);
  const first = stops[0] || stores[0] || fallbackPoints[0];

  return (
    <section
      ref={sectionRef}
      className={`rider-route-planner${expanded ? " is-expanded" : ""}`}
      role={expanded ? "dialog" : undefined}
      aria-modal={expanded || undefined}
      aria-labelledby="rider-route-heading"
    >
      <header className="rider-route-heading">
        <div>
          <h2 id="rider-route-heading">
            <Route size={21} aria-hidden="true" /> Your delivery route
          </h2>
          <p>Plan your drop-offs and keep the whole trip in view.</p>
        </div>
        <div className="rider-route-heading-actions">
          <Button variant="secondary" onClick={toggleLocation}>
            <LocateFixed size={16} aria-hidden="true" />
            {locating ? "Stop live location" : "Use live location"}
          </Button>
          <Button
            ref={fullscreenButtonRef}
            variant="secondary"
            onClick={toggleFullscreen}
            aria-expanded={expanded}
          >
            {expanded ? (
              <Minimize2 size={16} aria-hidden="true" />
            ) : (
              <Maximize2 size={16} aria-hidden="true" />
            )}
            {expanded ? "Exit fullscreen" : "Fullscreen"}
          </Button>
        </div>
      </header>
      {!!selectedDeliveryPanel && (
        <nav
          className="rider-active-switcher rider-route-switcher"
          aria-label="Active deliveries"
        >
          <span className="rider-route-switcher-label">
            Deliveries <span>{ordered.length}</span>
          </span>
          <div className="rider-route-switcher-items">
            {ordered.map((delivery, index) => (
              <Button
                key={delivery.id}
                variant="secondary"
                aria-pressed={selectedDeliveryId === delivery.id}
                onClick={() => {
                  setShowSelected(true);
                  onSelectDelivery?.(delivery.id);
                }}
              >
                <span className="rider-route-switcher-number">{index + 1}</span>
                <span>{delivery.order.order_number}</span>
                <small>{delivery.status.replaceAll("_", " ")}</small>
              </Button>
            ))}
          </div>
        </nav>
      )}
      <div className="rider-route-layout">
        <div className="rider-route-map-area">
          {first ? (
            <MapContainer
              center={[Number(first.latitude), Number(first.longitude)]}
              zoom={13}
              className="rider-route-map"
              scrollWheelZoom
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <RouteViewport
                stops={[...(stops.length ? stops : fallbackPoints), ...stores]}
                position={position}
                follow={locating && follow}
                fitVersion={fitVersion}
                focusTarget={
                  ordered.some((delivery) => delivery.id === focusTarget?.id)
                    ? focusTarget
                    : null
                }
                customerMarkers={customerMarkers}
              />
              {stores.map((store, i) => (
                <Marker
                  key={`store-${store.key || i}`}
                  position={[Number(store.latitude), Number(store.longitude)]}
                  icon={storeIcon}
                  title={store.name || "Pickup store"}
                  alt="Store location"
                  zIndexOffset={500}
                >
                  <Popup>
                    <b>
                      <Store size={15} aria-hidden="true" />{" "}
                      {store.name || "Pickup store"}
                    </b>
                    <br />
                    {store.address}
                    <br />
                    {stopArrivalText(
                      stops.find(
                        (stop) =>
                          stop.kind === "return" &&
                          Number(stop.latitude) === Number(store.latitude) &&
                          Number(stop.longitude) === Number(store.longitude),
                      ),
                    )}
                  </Popup>
                </Marker>
              ))}
              {stops.map(
                (stop, i) =>
                  stop.kind === "dropoff" && (
                    <Marker
                      key={`${stop.kind}-${i}`}
                      ref={(marker) =>
                        registerCustomerMarker(stop.delivery_id, marker)
                      }
                      eventHandlers={{
                        click: () => {
                          setShowSelected(true);
                          onSelectDelivery?.(stop.delivery_id);
                        },
                      }}
                      position={[stop.latitude, stop.longitude]}
                      icon={stopIcon(
                        i + 1,
                        stop.kind,
                        focusTarget?.id === stop.delivery_id,
                      )}
                      zIndexOffset={
                        focusTarget?.id === stop.delivery_id ? 1000 : 0
                      }
                    >
                      <Popup>
                        <b>
                          {i + 1}.{" "}
                          {stop.kind === "pickup" ? "Pickup" : "Drop-off"}
                        </b>
                        <br />
                        {stop.order_numbers.join(", ")}
                        <br />
                        {stop.address}
                      </Popup>
                    </Marker>
                  ),
              )}
              {!stops.length &&
                ordered.map(
                  (delivery, i) =>
                    validRoutePoint(delivery.order.destination) && (
                      <Marker
                        eventHandlers={{
                          click: () => {
                            setShowSelected(true);
                            onSelectDelivery?.(delivery.id);
                          },
                        }}
                        key={delivery.id}
                        ref={(marker) =>
                          registerCustomerMarker(delivery.id, marker)
                        }
                        position={[
                          Number(delivery.order.destination.latitude),
                          Number(delivery.order.destination.longitude),
                        ]}
                        icon={stopIcon(
                          i + 1,
                          "preview",
                          focusTarget?.id === delivery.id,
                        )}
                        zIndexOffset={
                          focusTarget?.id === delivery.id ? 1000 : 0
                        }
                      >
                        <Popup>
                          {delivery.order.destination.address ||
                            "Pinned location"}
                        </Popup>
                      </Marker>
                    ),
                )}
              {(plan?.legs || []).map((leg, i) => (
                <Fragment key={i}>
                  <Polyline
                    positions={(leg.geometry || []).map((p) => [p[1], p[0]])}
                    pathOptions={{ color: "#ffffff", weight: 9, opacity: 0.9 }}
                  />
                  <Polyline
                    positions={(leg.geometry || []).map((p) => [p[1], p[0]])}
                    pathOptions={{
                      color:
                        stops[leg.stop_index]?.kind === "return"
                          ? "#8056b3"
                          : "#2563eb",
                      weight: 5,
                      opacity: 0.95,
                      ...(stops[leg.stop_index]?.kind === "return"
                        ? { dashArray: "9 7" }
                        : {}),
                    }}
                  />
                  {trafficOverlays(leg).map((segment, index) => (
                    <Polyline
                      key={index}
                      positions={segment.geometry.map((p) => [p[1], p[0]])}
                      pathOptions={{
                        color: "#c43d38",
                        weight: 6,
                        opacity: 0.95,
                      }}
                    >
                      <Popup>{segment.congestion} traffic reported</Popup>
                    </Polyline>
                  ))}
                </Fragment>
              ))}
              {position && (
                <>
                  <Circle
                    center={[position.latitude, position.longitude]}
                    radius={Math.min(position.accuracy || 0, 2000)}
                    pathOptions={{
                      color: "#3c75bd",
                      weight: 1,
                      fillOpacity: 0.08,
                    }}
                  />
                  <Marker
                    position={[position.latitude, position.longitude]}
                    icon={locationIcon}
                  >
                    <Popup>
                      Your live location · updated {position.recordedAt}
                    </Popup>
                  </Marker>
                </>
              )}
            </MapContainer>
          ) : (
            <div className="rider-route-no-map">
              No pinned locations yet. The restaurant needs to add pickup and
              delivery coordinates.
            </div>
          )}
          <div className="rider-route-legend" aria-label="Map legend">
            <span>
              <i className="pickup" /> Store
            </span>
            <span>
              <i className="dropoff" /> Customer
            </span>
            <span>
              <i className="route" /> Delivery route
            </span>
            {plan?.return_to_store && (
              <span>
                <i className="return" /> Return to store
              </span>
            )}
            <span>
              <i className="traffic" /> Reported congestion
            </span>
            {position && (
              <span>
                <i className="live" /> You
              </span>
            )}
          </div>
          <div className="rider-route-map-tools">
            <Button
              variant="secondary"
              onClick={() => setFitVersion((n) => n + 1)}
              disabled={!first}
            >
              <Maximize2 size={15} aria-hidden="true" /> Fit all stops
            </Button>
            {locating && (
              <label>
                <input
                  type="checkbox"
                  checked={follow}
                  onChange={(e) => setFollow(e.target.checked)}
                />{" "}
                Follow me
              </label>
            )}
          </div>
          <p className="rider-route-location-note">
            {position
              ? `Live location updated ${position.recordedAt} · accuracy about ${Math.round(position.accuracy || 0)} m. Road route refreshes at most every 45 seconds.`
              : locating
                ? "Waiting for your location…"
                : "Enable live location to include the journey from where you are."}{" "}
            Your map location stays active only while this section is open.
          </p>
          <details className="rider-location-help">
            <summary>
              Location & sharing · availability GPS {presence.state}
            </summary>
            <p>
              Map location is for route planning only. Availability GPS is{" "}
              {presence.state.replaceAll("_", " ")}
              {presence.locatedAt
                ? ` · last update ${new Date(presence.locatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : ""}
              . Going online shares GPS for offers and customer tracking after
              pickup. The map control only shows your location here. If you are
              offline, you can separately choose to share a delivery's location.
            </p>
          </details>
          {gpsError && (
            <div role="alert" className="rider-route-warning">
              {gpsError}
              {
                <Button
                  variant="secondary"
                  onClick={() => {
                    setGpsError("");
                    lastRouteAt.current = 0;
                    setGpsAttempt((n) => n + 1);
                    setLocating(true);
                  }}
                >
                  Retry location
                </Button>
              }
            </div>
          )}
        </div>
        <div className="rider-route-itinerary">
          {orderDirty && (
            <p className="rider-route-draft" role="status">
              Unsaved route preview. Apply it in Route order to update your
              dashboard.
            </p>
          )}
          {selectedDeliveryPanel && (
            <div
              className="rider-workbench-tabs"
              aria-label="Route workspace views"
            >
              <Button
                variant="secondary"
                aria-pressed={!showSelected}
                onClick={() => setShowSelected(false)}
              >
                Route order
              </Button>
              <Button
                variant="secondary"
                aria-pressed={showSelected}
                onClick={() => setShowSelected(true)}
              >
                Selected delivery
              </Button>
            </div>
          )}
          {selectedDeliveryPanel && (
            <div className="rider-selected-workbench" hidden={!showSelected}>
              {selectedDeliveryPanel}
            </div>
          )}
          <div hidden={!!selectedDeliveryPanel && showSelected}>
            <div className="rider-route-itinerary-heading">
              <h3>
                Drop-off order <small>({ordered.length})</small>
              </h3>
              <Button
                variant="secondary"
                onClick={() =>
                  setOrder(
                    nearestDeliveryOrder(
                      ordered,
                      origin ||
                        [...ordered]
                          .reverse()
                          .find(
                            (d) =>
                              !["picked_up", "in_transit"].includes(d.status) &&
                              validRoutePoint(d.order.pickup),
                          )?.order.pickup ||
                        ordered[0]?.order.pickup,
                    ).map((d) => d.id),
                  )
                }
                disabled={savingOrder || ordered.length < 2}
              >
                Suggest order
              </Button>
            </div>
            <div className="rider-route-return-control">
              <label>
                <input
                  type="checkbox"
                  checked={returnToStore || !ids.length}
                  disabled={!ids.length}
                  onChange={(e) => setReturnToStore(e.target.checked)}
                />
                <CornerDownLeft size={16} aria-hidden="true" /> Return to store{" "}
                {ids.length ? "after last drop-off" : "route"}
              </label>
              {stores.length > 1 && (
                <label>
                  Return destination
                  <select
                    value={returnStoreKey}
                    onChange={(e) => setReturnStoreKey(e.target.value)}
                  >
                    <option value="">Original pickup store</option>
                    {stores.map((store) => (
                      <option key={store.key} value={store.key}>
                        {store.name || store.address}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {!ids.length && (
                <p>
                  No active drop-offs. Your store stays on the map. Enable live
                  location to see your route back.
                </p>
              )}
            </div>
            <p>
              Remaining pickups first · paired drop-offs keep their sequence.
            </p>
            <ol>
              {ordered.map((d, i) => (
                <li
                  key={d.id}
                  data-stop-number={
                    stops.some((s) => s.delivery_id === d.id)
                      ? stops.findIndex((s) => s.delivery_id === d.id) + 1
                      : i + 1
                  }
                >
                  <button
                    className="rider-route-stop-select"
                    type="button"
                    onClick={() => focusDelivery(d)}
                    disabled={!validRoutePoint(d.order.destination)}
                    aria-label={`Show ${d.order.order_number} on map`}
                    aria-pressed={
                      (selectedDeliveryId ?? focusTarget?.id) === d.id
                    }
                  >
                    <span
                      className="rider-route-stop-number"
                      aria-hidden="true"
                    >
                      {stops.some((s) => s.delivery_id === d.id)
                        ? stops.findIndex((s) => s.delivery_id === d.id) + 1
                        : i + 1}
                    </span>
                    <span className="rider-route-stop-copy">
                      <strong>{d.order.order_number}</strong>
                      <span className="rider-route-stop-address">
                        {d.order.destination.address || "No delivery address"}
                      </span>
                      {stopArrivalText(
                        stops.find((s) => s.delivery_id === d.id),
                      ) && (
                        <span className="rider-stop-eta">
                          {stopArrivalText(
                            stops.find((s) => s.delivery_id === d.id),
                          )}
                        </span>
                      )}
                      {d.batch_key && (
                        <small>Paired drop-off {d.batch_sequence}</small>
                      )}
                    </span>
                  </button>
                  <div className="rider-route-reorder">
                    <button
                      aria-label={`Move ${d.order.order_number} earlier`}
                      disabled={savingOrder || !canMove(i, -1)}
                      onClick={() => move(i, -1)}
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      aria-label={`Move ${d.order.order_number} later`}
                      disabled={savingOrder || !canMove(i, 1)}
                      onClick={() => move(i, 1)}
                    >
                      <ArrowDown size={16} />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
            {plan?.return_to_store && (
              <div className="rider-return-stop">
                <Store size={18} aria-hidden="true" />
                <div>
                  <strong>Return to store</strong>
                  <p>{stops.find((s) => s.kind === "return")?.address}</p>
                  <p className="rider-stop-eta">
                    {stopArrivalText(stops.find((s) => s.kind === "return"))}
                  </p>
                </div>
              </div>
            )}
            <div className="rider-route-summary" aria-live="polite">
              {busy ? (
                <p role="status">Updating road route…</p>
              ) : error ? (
                <>
                  <p role="alert">{error}</p>
                  <Button
                    variant="secondary"
                    onClick={() => setRetry((n) => n + 1)}
                  >
                    Retry route
                  </Button>
                </>
              ) : (
                plan && (
                  <>
                    <p
                      className={`rider-traffic-state${plan.has_congestion ? " has-congestion" : ""}`}
                    >
                      {plan.has_congestion
                        ? "Congestion reported · red route sections"
                        : plan.traffic_available
                          ? "Traffic data available"
                          : "Live traffic unavailable"}
                    </p>
                    {plan.duration_minutes != null && (
                      <strong>
                        {plan.distance_km} km · about {plan.duration_minutes}{" "}
                        min
                      </strong>
                    )}
                    <p>
                      {plan.starts_at_live_location
                        ? "From your live location"
                        : "Between pinned stops; excludes travel to the first stop"}
                      . Travel estimate.
                    </p>
                    {!plan.starts_at_live_location && (
                      <p>
                        Enable live location for an arrival time at each stop.
                      </p>
                    )}
                    {plan.route_unavailable && (
                      <p className="rider-route-warning">
                        Some road routes are unavailable. Location pins are
                        still shown.
                      </p>
                    )}
                    {!!plan.missing_locations?.length && (
                      <p className="rider-route-warning">
                        Missing pins: {plan.missing_locations.join(", ")}. These
                        locations are excluded from the map.
                      </p>
                    )}
                  </>
                )
              )}
            </div>
            {onApplyOrder && (
              <div className="rider-route-apply">
                <p>
                  {orderDirty
                    ? "Preview order · not yet applied to your dashboard."
                    : "Current route order · remaining pickups come first."}
                </p>
                <Button
                  onClick={onApplyOrder}
                  busy={savingOrder}
                  disabled={!orderDirty || savingOrder}
                >
                  Apply route order
                </Button>
              </div>
            )}
            <details className="rider-route-footnote">
              <summary>How route estimates work</summary>
              <p>
                Suggestions use proximity, not traffic. Travel times exclude
                kitchen waits and time at each stop. Paired deliveries keep
                their required sequence. Apply route order to save it across
                your workspace; previewing does not change delivery status.
              </p>
            </details>
          </div>
        </div>
      </div>
    </section>
  );
}
