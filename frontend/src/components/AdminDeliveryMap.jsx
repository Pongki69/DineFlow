import { useEffect, useRef, useState } from "react";
import {
  Circle,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import {
  LocateFixed,
  MapPin,
  Maximize2,
  Minimize2,
  RefreshCw,
} from "lucide-react";
import "leaflet/dist/leaflet.css";

const storeIcon = L.divIcon({
  className: "admin-map-marker admin-map-marker--store",
  html: '<span aria-hidden="true">⌂</span>',
  iconSize: [44, 44],
  iconAnchor: [22, 44],
});
const riderIcons = Object.fromEntries(
  ["available", "on_delivery"].map((status) => [
    status,
    L.divIcon({
      className: `admin-map-marker admin-map-marker--${status}`,
      html: '<span aria-hidden="true">●</span>',
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    }),
  ]),
);
export function mapPoint(value) {
  if (
    value?.latitude == null ||
    value?.longitude == null ||
    value.latitude === "" ||
    value.longitude === ""
  )
    return null;
  const lat = Number(value.latitude),
    lng = Number(value.longitude);
  return Number.isFinite(lat) &&
    Math.abs(lat) <= 90 &&
    Number.isFinite(lng) &&
    Math.abs(lng) <= 180
    ? [lat, lng]
    : null;
}

function MapBehavior({ position, radius, previewKey, onMove, selected }) {
  const map = useMap();
  useMapEvents({ click: (event) => onMove?.(event.latlng) });
  useEffect(() => {
    if (position)
      map.fitBounds(L.latLng(position).toBounds(Math.max(radius, 0.2) * 2000), {
        padding: [30, 30],
        maxZoom: 16,
        animate: false,
      });
  }, [map, position?.[0], position?.[1], radius, previewKey]);
  useEffect(() => {
    const point = mapPoint(selected);
    if (point) map.setView(point, 15, { animate: false });
  }, [map, selected]);
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

function useMapFullscreen() {
  const element = useRef(null);
  const button = useRef(null);
  const native = useRef(false);
  const pending = useRef(false);
  const height = useRef(0);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const current = element.current;
    function changed() {
      if (document.fullscreenElement === current) {
        native.current = true;
        setExpanded(true);
      } else if (native.current) {
        native.current = false;
        setExpanded(false);
        button.current?.focus({ preventScroll: true });
      }
    }
    document.addEventListener("fullscreenchange", changed);
    return () => {
      document.removeEventListener("fullscreenchange", changed);
      if (document.fullscreenElement === current) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    const page = document.documentElement;
    const previousPageOverflow = page.style.overflow;
    const previousGutter = page.style.scrollbarGutter;
    const siblings = [];
    // Keep the same Leaflet instance and make the surrounding page inert.
    for (
      let parent = element.current;
      parent?.parentElement && parent !== document.body;
      parent = parent.parentElement
    ) {
      for (const sibling of parent.parentElement.children) {
        if (sibling !== parent && !sibling.inert) {
          sibling.inert = true;
          siblings.push(sibling);
        }
      }
    }
    document.body.style.overflow = "hidden";
    page.style.overflow = "hidden";
    page.style.scrollbarGutter = "auto";
    button.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      page.style.overflow = previousPageOverflow;
      page.style.scrollbarGutter = previousGutter;
      for (const sibling of siblings) sibling.inert = false;
    };
  }, [expanded]);

  async function toggle() {
    if (pending.current) return;
    pending.current = true;
    try {
      if (expanded) {
        if (document.fullscreenElement === element.current)
          await document.exitFullscreen();
        setExpanded(false);
        button.current?.focus({ preventScroll: true });
      } else {
        height.current = element.current.getBoundingClientRect().height;
        setExpanded(true);
        try {
          await element.current.requestFullscreen?.();
        } catch {
          /* The viewport overlay supports browsers without native fullscreen. */
        }
      }
    } finally {
      pending.current = false;
    }
  }

  function keydown(event) {
    if (!expanded) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      toggle();
    } else if (event.key === "Tab") {
      const controls = [
        ...element.current.querySelectorAll(
          'button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((control) => control.getClientRects().length);
      const first = controls[0],
        last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  }
  return { element, button, expanded, height: height.current, toggle, keydown };
}

export default function AdminDeliveryMap({
  location,
  radius = 8,
  fleet = [],
  editable = false,
  onMove,
  previewKey = 0,
  selected,
  showCoverage = true,
}) {
  const position = mapPoint(location);
  const coverage =
    Number(radius) > 0 && Number(radius) <= 100 ? Number(radius) : 8;
  const [tileError, setTileError] = useState(false);
  const [tileAttempt, setTileAttempt] = useState(0);
  const [reset, setReset] = useState(0);
  const fullscreen = useMapFullscreen();
  const located = fleet.filter((rider) => mapPoint(rider));
  return (
    <div
      className="admin-map-frame"
      style={fullscreen.expanded ? { height: fullscreen.height } : undefined}
    >
      <div
        ref={fullscreen.element}
        className={`admin-map${editable ? " admin-map--editor" : ""}${fullscreen.expanded ? " admin-map--fullscreen" : ""}`}
        role={fullscreen.expanded ? "dialog" : undefined}
        aria-modal={fullscreen.expanded ? true : undefined}
        aria-label={fullscreen.expanded ? "Fullscreen delivery map" : undefined}
        onKeyDown={fullscreen.keydown}
      >
        <MapContainer
          center={position || [14.5995, 120.9842]}
          zoom={12}
          scrollWheelZoom={false}
          aria-label={
            editable
              ? "Set restaurant location by clicking the map or dragging the restaurant pin"
              : "Live rider locations and restaurant delivery coverage"
          }
        >
          <TileLayer
            key={tileAttempt}
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            eventHandlers={{ tileerror: () => setTileError(true) }}
          />
          <MapBehavior
            position={position}
            radius={coverage}
            previewKey={`${previewKey}-${reset}`}
            onMove={editable ? onMove : undefined}
            selected={selected}
          />
          {position && (
            <>
              {showCoverage && (
                <Circle
                  center={position}
                  radius={coverage * 1000}
                  pathOptions={{
                    color: "#298168",
                    fillColor: "#60ae8e",
                    fillOpacity: 0.1,
                    weight: 1.5,
                    dashArray: "5 5",
                  }}
                  interactive={false}
                />
              )}
              <Marker
                position={position}
                icon={storeIcon}
                draggable={editable}
                title={
                  editable
                    ? "Restaurant location — drag to adjust"
                    : location?.name || "Restaurant"
                }
                alt="Restaurant outlet"
                eventHandlers={
                  editable
                    ? { dragend: (event) => onMove(event.target.getLatLng()) }
                    : undefined
                }
              >
                <Popup>
                  <strong>{location?.name || "Restaurant outlet"}</strong>
                  <br />
                  {location?.address || "Set an outlet address"}
                  <br />
                  {coverage} km delivery radius
                </Popup>
              </Marker>
            </>
          )}
          {located.map((rider) => (
            <Marker
              key={rider.id}
              position={mapPoint(rider)}
              icon={riderIcons[rider.status] || riderIcons.available}
              title={rider.name}
              alt={`Rider ${rider.name}`}
            >
              <Popup>
                <strong>{rider.name}</strong>
                <br />
                {rider.status.replaceAll("_", " ")} · {rider.active_deliveries}{" "}
                active deliveries
                <br />
                Location updated{" "}
                {new Date(rider.located_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
        <button
          type="button"
          className="admin-map-recenter"
          aria-label="Recenter on restaurant coverage"
          onClick={() => setReset((value) => value + 1)}
        >
          <LocateFixed size={19} />
        </button>
        <button
          ref={fullscreen.button}
          type="button"
          className="admin-map-fullscreen"
          aria-label={
            fullscreen.expanded ? "Exit fullscreen map" : "Enter fullscreen map"
          }
          title={
            fullscreen.expanded
              ? "Exit fullscreen map (Esc)"
              : "Enter fullscreen map"
          }
          aria-expanded={fullscreen.expanded}
          onClick={fullscreen.toggle}
        >
          {fullscreen.expanded ? (
            <Minimize2 size={19} aria-hidden="true" />
          ) : (
            <Maximize2 size={19} aria-hidden="true" />
          )}
        </button>
        {tileError && (
          <div className="admin-map-notice" role="status">
            Map tiles could not load. Coordinates are still available.
            <button
              type="button"
              onClick={() => {
                setTileError(false);
                setTileAttempt((value) => value + 1);
              }}
            >
              <RefreshCw size={14} /> Retry map
            </button>
          </div>
        )}
        {!position && (
          <div className="admin-map-caption">
            <MapPin size={15} />
            {editable
              ? "Click the map to place your outlet pin."
              : "Configure an outlet to center your fleet map."}
          </div>
        )}
      </div>
    </div>
  );
}
