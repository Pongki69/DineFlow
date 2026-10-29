import { Feedback, Skeleton } from "./components/ui";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MapPin, X } from "lucide-react";
import {
  Circle,
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "./api";
import { GoogleRestaurantPin } from "./components/GoogleRestaurantPin";
import { MapControls } from "./components/MapControls";
import { restaurantMapIcon as restaurantPin } from "./components/restaurantMapIcon";
import {
  DeliveryAddressPicker,
  deliveryPosition,
} from "./components/DeliveryAddressPicker";
export { DeliveryAddressPicker as DeliveryMapSelector } from "./components/DeliveryAddressPicker";

const pin = L.divIcon({
  className: "delivery-pin",
  html: "<span></span>",
  iconSize: [24, 24],
  iconAnchor: [12, 22],
});
function PinPicker({
  position,
  onMove,
  icon = pin,
  title = "Drag to adjust location",
}) {
  useMapEvents({
    click(event) {
      onMove(event.latlng);
    },
  });
  return position ? (
    <Marker
      position={position}
      draggable
      icon={icon}
      title={title}
      alt={title}
      eventHandlers={{
        dragend(event) {
          onMove(event.target.getLatLng());
        },
      }}
    />
  ) : null;
}

function locationPosition(location) {
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

function CoverageView({ position, radius }) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    if (position)
      map.fitBounds(L.latLng(position).toBounds(radius * 2000), {
        padding: [24, 24],
        maxZoom: 16,
      });
  }, [map, position?.[0], position?.[1], radius]);
  return null;
}

function RestaurantPinEditor({ location, radius, onChange }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [addressStatus, setAddressStatus] = useState("");
  const lookup = useRef(null);
  useEffect(() => () => lookup.current?.abort(), []);
  const position = locationPosition(location);
  const coverage =
    Number(radius) > 0 && Number(radius) <= 100 ? Number(radius) : 8;
  async function movePin(point) {
    lookup.current?.abort();
    const controller = new AbortController();
    lookup.current = controller;
    const latitude = Number(point.lat.toFixed(6)),
      longitude = Number(point.lng.toFixed(6));
    onChange((current) => ({ ...current, latitude, longitude, address: "" }));
    setAddressStatus("Finding the address for your pin…");
    try {
      const result = await api(
        `/maps/reverse?latitude=${latitude}&longitude=${longitude}`,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      if (!result.data?.label)
        throw new Error("No address found. You can enter it manually.");
      onChange((current) =>
        current.latitude === latitude &&
        current.longitude === longitude &&
        !current.address
          ? { ...current, address: result.data.label }
          : current,
      );
      setAddressStatus("Address found. You can edit it below if needed.");
    } catch (failure) {
      if (!controller.signal.aborted)
        setAddressStatus(
          failure.message ||
            "Could not find the address. Enter it manually below.",
        );
    }
  }
  async function searchPlaces() {
    if (busy) return;
    if (query.trim().length < 3) {
      setError("Enter at least three characters to search.");
      return;
    }
    setBusy(true);
    setError("");
    setResults([]);
    try {
      const result = await api(
        `/maps/search?q=${encodeURIComponent(query.trim())}`,
      );
      setResults(result.data || []);
      if (!result.data?.length)
        setError(
          "No places found. Try another address or click the map to place your pin.",
        );
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="restaurant-pin-editor">
      <div className="restaurant-pin-heading">
        <h3>Pin your restaurant</h3>
        <span>Click the map or drag the pin</span>
      </div>
      <div className="restaurant-pin-search">
        <label htmlFor="restaurant-map-search">
          Find a place or address
          <input
            id="restaurant-map-search"
            value={query}
            placeholder="Search your restaurant, street, or city"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                searchPlaces();
              }
            }}
          />
        </label>
        <button type="button" disabled={busy} onClick={searchPlaces}>
          {busy ? "Searching…" : "Search map"}
        </button>
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {results.length > 0 && (
        <div
          className="place-results restaurant-pin-results"
          aria-label="Matching places"
        >
          {results.map((place, index) => (
            <button
              type="button"
              key={`${place.label}-${index}`}
              onClick={() => {
                lookup.current?.abort();
                setAddressStatus("");
                onChange({
                  ...location,
                  address: place.label,
                  latitude: Number(place.latitude),
                  longitude: Number(place.longitude),
                });
                setResults([]);
                setQuery(place.label);
              }}
            >
              {place.label}
            </button>
          ))}
        </div>
      )}
      <div
        className="restaurant-settings-map"
        aria-label="Restaurant location map"
      >
        <MapContainer
          center={position || [14.5995, 120.9842]}
          zoom={12}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <CoverageView position={position} radius={coverage} />
          <MapControls
            onRecenter={(map) => {
              if (position)
                map.fitBounds(L.latLng(position).toBounds(coverage * 2000), {
                  padding: [30, 30],
                  maxZoom: 16,
                });
              else map.setView([14.5995, 120.9842], 12);
            }}
            recenterLabel="Recenter on restaurant coverage"
          />
          {position && (
            <Circle
              center={position}
              radius={coverage * 1000}
              pathOptions={{ color: "#2e5a43", fillOpacity: 0.08, weight: 2 }}
              interactive={false}
            />
          )}
          <PinPicker
            position={position}
            icon={restaurantPin}
            title="Restaurant location — drag to adjust"
            onMove={movePin}
          />
        </MapContainer>
      </div>
      {addressStatus && (
        <p className="restaurant-address-status" role="status">
          {addressStatus}
        </p>
      )}
      <p className="restaurant-pin-help">
        {position
          ? `Restaurant pin: ${position[0].toFixed(6)}, ${position[1].toFixed(6)}. Shaded area: ${coverage} km delivery radius.`
          : "Click the map to place your restaurant pin."}{" "}
        The address fills automatically when you place or move the pin. Save
        settings to apply your changes.
      </p>
    </div>
  );
}

export function DeliveryDestination({ items, value, onChange, onQuote }) {
  const dialog = useRef(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({});
  const [pinError, setPinError] = useState("");
  const current = open ? draft : value;
  const ready =
    deliveryPosition(draft) &&
    draft.pin_confirmed &&
    draft.quote &&
    draft.quote.meets_minimum !== false &&
    draft.formatted_address?.trim() &&
    draft.recipient_name?.trim() &&
    draft.phone?.trim();
  function show() {
    setDraft({ ...value, quote: null });
    setPinError("");
    dialog.current.showModal();
    const body = dialog.current.querySelector(".delivery-destination-body");
    if (body) body.scrollTop = 0;
    setOpen(true);
  }
  function confirm(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!ready) {
      setPinError(
        "Confirm your drop-off pin, complete your contact details and wait for a valid delivery estimate.",
      );
      return;
    }
    onChange(draft);
    onQuote?.(draft.quote);
    dialog.current.close();
    setOpen(false);
  }
  const footerHint = !deliveryPosition(draft)
    ? "Start by searching for your delivery address."
    : !draft.pin_confirmed
      ? "Confirm the pin at your gate or entrance."
      : !draft.formatted_address?.trim() ||
          !draft.recipient_name?.trim() ||
          !draft.phone?.trim()
        ? "Add the full address, recipient and phone number."
        : draft.quote?.meets_minimum === false
          ? "Your cart must meet the delivery minimum."
          : !draft.quote
            ? "Waiting for a valid delivery estimate. Check any message above."
            : "Your pin and contact details are ready.";
  return (
    <>
      <div className="delivery-destination-card">
        <div className="delivery-destination-heading">
          <MapPin size={19} aria-hidden="true" />
          <strong>Deliver to</strong>
        </div>
        <p>
          {value?.formatted_address ||
            "Choose your delivery address and pin your drop-off point."}
        </p>
        {value?.recipient_name && (
          <small>
            {value.recipient_name}
            {value.phone ? ` · ${value.phone}` : ""}
          </small>
        )}
        {value?.quote && (
          <span className="delivery-destination-estimate">
            ₱{value.quote.delivery_fee} delivery · about{" "}
            {value.quote.duration_minutes} min travel
          </span>
        )}
        <button
          type="button"
          className="ui-button ui-button--secondary"
          onClick={show}
        >
          {value?.formatted_address
            ? "Change delivery address"
            : "Choose delivery address"}
        </button>
      </div>
      {createPortal(
        <dialog
          ref={dialog}
          className="delivery-destination-dialog delivery-guided-dialog"
          aria-labelledby="delivery-destination-title"
          onClose={() => setOpen(false)}
        >
          <div className="app-content delivery-destination-content">
            <form className="delivery-destination-form" onSubmit={confirm}>
              <header className="delivery-destination-header">
                <div>
                  <h2 id="delivery-destination-title">
                    Where should we deliver?
                  </h2>
                  <p>
                    Choose your address, confirm the entrance, and add your
                    contact details.
                  </p>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Close delivery address"
                  onClick={() => {
                    dialog.current.close();
                    setOpen(false);
                  }}
                >
                  <X size={20} />
                </button>
              </header>
              <div className="delivery-destination-body">
                <DeliveryAddressPicker
                  items={items}
                  value={current}
                  onChange={open ? setDraft : onChange}
                  onQuote={
                    open
                      ? (quote) =>
                          setDraft((previous) => ({ ...previous, quote }))
                      : onQuote
                  }
                  active={open}
                />
                {pinError && (
                  <p className="field-error" role="alert">
                    {pinError}
                  </p>
                )}
              </div>
              <footer className="delivery-destination-footer">
                <span role="status">{footerHint}</span>
                <button
                  type="submit"
                  className="ui-button ui-button--primary"
                  disabled={!ready}
                >
                  Use this address
                </button>
              </footer>
            </form>
          </div>
        </dialog>,
        document.body,
      )}
    </>
  );
}

export { RestaurantLocation } from "./components/RestaurantLocation";

export function DeliverySettings() {
  const [loading, setLoading] = useState(true),
    [initialError, setInitialError] = useState(""),
    [attempt, setAttempt] = useState(0);

  const [data, setData] = useState({});
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const days = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ];
  useEffect(() => {
    setLoading(true);
    setInitialError("");
    setError("");
    Promise.all([api("/admin/delivery-policy"), api("/restaurant/location")])
      .then(([p, l]) =>
        setData({ policy: p.data.policy, location: l.data || {} }),
      )
      .catch((e) => {
        setError(e.message);
        setInitialError(e.message);
      })
      .finally(() => setLoading(false));
  }, [attempt]);
  function change(group, key, val) {
    setData((d) => ({ ...d, [group]: { ...d[group], [key]: val } }));
  }
  function setHours(group, day, key, val) {
    setData((d) => ({
      ...d,
      [group]: {
        ...d[group],
        [group === "policy" ? "operating_hours" : "opening_hours"]: {
          ...d[group]?.[
            group === "policy" ? "operating_hours" : "opening_hours"
          ],
          [day]: {
            ...d[group]?.[
              group === "policy" ? "operating_hours" : "opening_hours"
            ]?.[day],
            [key]: val,
          },
        },
      },
    }));
  }
  async function save(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    try {
      await api("/admin/delivery-policy", {
        method: "PUT",
        body: JSON.stringify({
          ...data.policy,
          radius_km: Number(data.policy.radius_km),
          minimum_order: Number(data.policy.minimum_order),
          base_fee: Number(data.policy.base_fee),
          per_km_fee: Number(data.policy.per_km_fee),
          free_delivery_over: data.policy.free_delivery_over
            ? Number(data.policy.free_delivery_over)
            : null,
        }),
      });
      await api("/admin/restaurant/location", {
        method: "PUT",
        body: JSON.stringify({
          ...data.location,
          latitude: Number(data.location.latitude),
          longitude: Number(data.location.longitude),
        }),
      });
      setNotice("Delivery area and restaurant location saved.");
    } catch (err) {
      setError(err.message);
    }
  }
  const hoursEditor = (group, label) => {
    const key = group === "policy" ? "operating_hours" : "opening_hours";
    return (
      <>
        <h2>{label}</h2>
        {days.map((day) => {
          const hours = data[group]?.[key]?.[day] || {};
          return (
            <div className="hours-row" key={`${group}-${day}`}>
              <strong>{day}</strong>
              <label>
                <span>Opens</span>
                <input
                  type="time"
                  disabled={hours.closed}
                  value={hours.open || ""}
                  onChange={(e) => setHours(group, day, "open", e.target.value)}
                />
              </label>
              <label>
                <span>Closes</span>
                <input
                  type="time"
                  disabled={hours.closed}
                  value={hours.close || ""}
                  onChange={(e) =>
                    setHours(group, day, "close", e.target.value)
                  }
                />
              </label>
              <label className="closed-toggle">
                <input
                  type="checkbox"
                  checked={!!hours.closed}
                  onChange={(e) =>
                    setHours(group, day, "closed", e.target.checked)
                  }
                />
                Closed
              </label>
            </div>
          );
        })}
      </>
    );
  };
  if (loading || initialError)
    return (
      <section className="welcome">
        <h1>Delivery settings</h1>
        {loading ? (
          <Skeleton label="Loading delivery settings" />
        ) : (
          <Feedback onRetry={() => setAttempt((value) => value + 1)}>
            {initialError}
          </Feedback>
        )}
      </section>
    );
  return (
    <section className="welcome">
      <span className="eyebrow">DELIVERY CONFIGURATION</span>
      <h1>Restaurant and delivery area</h1>
      {error && <div className="error">{error}</div>}
      {notice && <div className="success">{notice}</div>}
      {data.policy && (
        <form className="delivery-settings-form" onSubmit={save}>
          <h2>Restaurant location</h2>
          {import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY ? (
            <GoogleRestaurantPin
              location={data.location}
              radius={data.policy.radius_km}
              apiKey={import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY}
              onChange={(location) =>
                setData((current) => ({
                  ...current,
                  location:
                    typeof location === "function"
                      ? location(current.location)
                      : location,
                }))
              }
            />
          ) : (
            <RestaurantPinEditor
              location={data.location}
              radius={data.policy.radius_km}
              onChange={(location) =>
                setData((current) => ({
                  ...current,
                  location:
                    typeof location === "function"
                      ? location(current.location)
                      : location,
                }))
              }
            />
          )}
          {[
            ["name", "Restaurant name"],
            ["address", "Address"],
            ["latitude", "Latitude"],
            ["longitude", "Longitude"],
            ["phone", "Phone"],
            ["contact_email", "Contact email"],
          ].map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                required={["address", "latitude", "longitude"].includes(key)}
                type={
                  ["latitude", "longitude"].includes(key)
                    ? "number"
                    : key === "contact_email"
                      ? "email"
                      : key === "phone"
                        ? "tel"
                        : "text"
                }
                step={
                  ["latitude", "longitude"].includes(key) ? "any" : undefined
                }
                min={
                  key === "latitude"
                    ? -90
                    : key === "longitude"
                      ? -180
                      : undefined
                }
                max={
                  key === "latitude"
                    ? 90
                    : key === "longitude"
                      ? 180
                      : undefined
                }
                value={data.location?.[key] ?? ""}
                onChange={(e) => change("location", key, e.target.value)}
              />
            </label>
          ))}
          {hoursEditor("location", "Restaurant opening hours")}
          <h2>Delivery rules</h2>
          {[
            ["radius_km", "Coverage radius (km)"],
            ["minimum_order", "Minimum order (₱)"],
            ["base_fee", "Base fee (₱)"],
            ["per_km_fee", "Fee per road km (₱)"],
            ["free_delivery_over", "Free delivery above (₱)"],
          ].map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                type="number"
                min="0"
                step="0.01"
                value={data.policy?.[key] ?? ""}
                onChange={(e) => change("policy", key, e.target.value)}
              />
            </label>
          ))}
          {hoursEditor("policy", "Delivery operating hours")}
          <button>Save settings</button>
        </form>
      )}
    </section>
  );
}
