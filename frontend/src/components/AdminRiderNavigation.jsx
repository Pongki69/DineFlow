import { useEffect, useRef, useState } from "react";
import { useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { ArrowUp, MapPin, Search } from "lucide-react";
import { riderEdgePoint } from "./riderMapEdges";
import { hasOutletCoordinates as hasCoordinates } from "../features/outletConfiguration";
import "./adminRiderNavigation.css";

export function RiderEdgeNavigation({ fleet, onSelect }) {
  const [, redraw] = useState(0);
  const controls = useRef(null);
  const map = useMap();
  useMapEvents({
    moveend: () => redraw((version) => version + 1),
    zoomend: () => redraw((version) => version + 1),
    resize: () => redraw((version) => version + 1),
  });
  useEffect(() => {
    if (controls.current) {
      L.DomEvent.disableClickPropagation(controls.current);
      L.DomEvent.disableScrollPropagation(controls.current);
    }
  }, []);
  const groups = new Map();
  for (const rider of fleet) {
    if (!hasCoordinates(rider)) continue;
    const point = map.latLngToContainerPoint([
      Number(rider.latitude),
      Number(rider.longitude),
    ]);
    const edge = riderEdgePoint(point, map.getSize());
    if (!edge) continue;
    const key = `${Math.round(edge.x / 52)}-${Math.round(edge.y / 52)}`;
    if (!groups.has(key)) groups.set(key, { edge, riders: [] });
    groups.get(key).riders.push(rider);
  }
  return (
    <div className="admin-rider-edges" ref={controls}>
      {[...groups].map(([key, { edge, riders }]) => (
        <button
          key={key}
          type="button"
          className="admin-rider-edge"
          style={{ left: edge.x, top: edge.y }}
          aria-label={`Focus on ${riders[0].name}${riders.length > 1 ? ` and ${riders.length - 1} nearby riders` : ""}`}
          onClick={() => onSelect?.(riders[0].id)}
          title={`${riders.map((rider) => rider.name).join(", ")} · outside map view`}
        >
          <strong>
            {riders.length > 1 ? riders.length : riders[0].name.slice(0, 1)}
          </strong>
          <ArrowUp
            size={16}
            aria-hidden="true"
            style={{ transform: `rotate(${edge.angle}deg)` }}
          />
        </button>
      ))}
    </div>
  );
}

export function RiderMapRoster({
  fleet,
  selected,
  onSelect,
  follow,
  onFollowChange,
}) {
  const [query, setQuery] = useState("");
  const visible = fleet.filter((rider) =>
    `${rider.name} ${rider.vehicle_type || ""}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  return (
    <aside className="admin-map-roster" aria-label="Map rider list">
      <div className="admin-map-roster-heading">
        <h3>
          Riders <span>{fleet.length}</span>
        </h3>
        <p>Select a rider to focus their latest GPS location.</p>
      </div>
      <label className="admin-map-roster-search">
        <Search size={16} aria-hidden="true" />
        <input
          type="search"
          aria-label="Search map riders"
          placeholder="Search riders…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div
        className="admin-map-roster-list"
        role="group"
        aria-label="Rider locations"
      >
        {visible.map((rider) => (
          <button
            key={rider.id}
            type="button"
            disabled={!hasCoordinates(rider)}
            aria-pressed={selected?.id === rider.id}
            onClick={() => onSelect?.(rider.id)}
          >
            <span className="admin-small-avatar">{rider.name.slice(0, 1)}</span>
            <span>
              <strong>{rider.name}</strong>
              <small>
                {rider.status.replaceAll("_", " ")} · {rider.active_deliveries}{" "}
                deliveries
              </small>
              <small>
                {hasCoordinates(rider)
                  ? `GPS ${new Date(rider.located_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
                  : "No fresh GPS location"}
              </small>
            </span>
            {hasCoordinates(rider) && <MapPin size={15} aria-hidden="true" />}
          </button>
        ))}
        {!visible.length && (
          <p role="status">
            {query ? "No riders match your search." : "No riders in this view."}
          </p>
        )}
      </div>
      {hasCoordinates(selected) && (
        <label className="admin-map-follow">
          <input
            type="checkbox"
            checked={follow}
            onChange={(event) => onFollowChange?.(event.target.checked)}
          />
          Follow {selected.name}
        </label>
      )}
    </aside>
  );
}
