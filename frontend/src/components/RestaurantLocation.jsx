import { useEffect, useState } from "react";
import {
  Clock3,
  MapPin,
  Navigation,
  Phone,
  Mail,
  Copy,
  LocateFixed,
  ArrowUpRight,
  Utensils,
} from "lucide-react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { api } from "../api";
import { Feedback, Skeleton } from "./ui";
import "leaflet/dist/leaflet.css";
import "./restaurantLocation.css";

const days = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];
const restaurantIcon = L.divIcon({
  className: "visit-map-marker",
  html: '<span role="img" aria-label="Restaurant location"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3v6m3-6v6M5 6h3M6.5 9v12M16 3c-3 3-3 8 0 9h2m0-9v18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></span>',
  iconSize: [48, 56],
  iconAnchor: [24, 52],
  popupAnchor: [0, -48],
});

export function openingTime(value) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value || "")) return null;
  const [hour, minute] = value.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

function MapRecenter({ center }) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
  }, [map]);
  return (
    <button
      type="button"
      className="visit-recenter"
      onClick={() => map.setView(center, 16)}
    >
      <LocateFixed size={17} aria-hidden="true" />
      Center restaurant
    </button>
  );
}

export function RestaurantLocation() {
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [copyStatus, setCopyStatus] = useState("");
  const [mapError, setMapError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api("/restaurant/location", { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setLocation(result.data || {});
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attempt]);
  const lat = Number(location?.latitude),
    lng = Number(location?.longitude);
  const hasPin =
    location?.latitude != null &&
    location?.longitude != null &&
    location.latitude !== "" &&
    location.longitude !== "" &&
    Number.isFinite(lat) &&
    Math.abs(lat) <= 90 &&
    Number.isFinite(lng) &&
    Math.abs(lng) <= 180;
  const center = hasPin ? [lat, lng] : null;
  const directions = location?.navigation_url?.startsWith("https://")
    ? location.navigation_url
    : hasPin
      ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
      : null;
  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(location.address);
      setCopyStatus("Address copied.");
    } catch {
      setCopyStatus(
        "Could not copy automatically. Select and copy the address above.",
      );
    }
  }
  return (
    <section className="welcome restaurant-visit" aria-labelledby="visit-title">
      <header className="visit-heading">
        <div>
          <span className="eyebrow">COME ON OVER</span>
          <h1 id="visit-title">{location?.name || "Find our restaurant"}</h1>
          <p>A good meal starts here. Find your way to our door.</p>
        </div>
        {!loading && !error && directions && (
          <a
            className="visit-directions"
            href={directions}
            target="_blank"
            rel="noreferrer"
          >
            <Navigation size={18} aria-hidden="true" />
            Get directions
            <ArrowUpRight size={17} aria-hidden="true" />
          </a>
        )}
      </header>
      {loading ? (
        <Skeleton label="Loading restaurant details" />
      ) : error ? (
        <Feedback onRetry={() => setAttempt((value) => value + 1)}>
          {error}
        </Feedback>
      ) : (
        <div className="visit-layout">
          <section className="visit-map-card" aria-labelledby="visit-map-title">
            <div className="visit-card-heading">
              <span className="visit-icon">
                <MapPin size={20} aria-hidden="true" />
              </span>
              <div>
                <h2 id="visit-map-title">Find us here</h2>
                <p>Your next stop, a good meal.</p>
              </div>
            </div>
            {center ? (
              <div
                className="visit-map"
                role="region"
                aria-label="Restaurant map"
              >
                <MapContainer center={center} zoom={16} scrollWheelZoom={false}>
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    eventHandlers={{
                      tileerror: () => setMapError(true),
                      load: () => setMapError(false),
                    }}
                  />
                  <Marker
                    position={center}
                    icon={restaurantIcon}
                    title={location.name || "Restaurant"}
                  >
                    <Popup>
                      <strong>{location.name || "Restaurant"}</strong>
                      <br />
                      {location.address}
                    </Popup>
                  </Marker>
                  <MapRecenter center={center} />
                </MapContainer>
              </div>
            ) : (
              <div className="visit-map-empty">
                <MapPin size={34} aria-hidden="true" />
                <h3>Location pin coming soon</h3>
                <p>Contact the restaurant for directions.</p>
              </div>
            )}
            {mapError && (
              <p className="visit-map-notice" role="status">
                The map could not fully load. You can still use the address and
                directions link.
              </p>
            )}
            <div className="visit-address">
              <span className="visit-label">THE ADDRESS</span>
              <address>
                {location.address || "Our address will be added here soon."}
              </address>
              {location.address && (
                <button
                  className="visit-copy"
                  type="button"
                  onClick={copyAddress}
                >
                  <Copy size={15} aria-hidden="true" />
                  Copy address
                </button>
              )}
              <p className="visit-copy-status" role="status">
                {copyStatus}
              </p>
            </div>
          </section>
          <aside className="visit-sidebar" aria-label="Plan your visit">
            <section
              className="visit-info-card"
              aria-labelledby="visit-hours-title"
            >
              <div className="visit-card-heading">
                <span className="visit-icon">
                  <Clock3 size={20} aria-hidden="true" />
                </span>
                <div>
                  <h2 id="visit-hours-title">Opening hours</h2>
                  <p>Make time for something delicious.</p>
                </div>
              </div>
              <dl className="visit-hours">
                {days.map((day) => {
                  const hours = location.opening_hours?.[day];
                  const open = openingTime(hours?.open),
                    close = openingTime(hours?.close);
                  return (
                    <div key={day}>
                      <dt>{day}</dt>
                      <dd className={hours?.closed ? "visit-closed" : ""}>
                        {hours?.closed
                          ? "Closed"
                          : open && close
                            ? `${open} – ${close}`
                            : "Not listed"}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </section>
            <section
              className="visit-info-card"
              aria-labelledby="visit-contact-title"
            >
              <div className="visit-card-heading">
                <span className="visit-icon">
                  <Utensils size={20} aria-hidden="true" />
                </span>
                <div>
                  <h2 id="visit-contact-title">Let’s get in touch</h2>
                  <p>Questions before you visit?</p>
                </div>
              </div>
              <div className="visit-contact-links">
                {location.phone && (
                  <a href={`tel:${location.phone.replace(/[^+\d]/g, "")}`}>
                    <Phone size={18} aria-hidden="true" />
                    <span>
                      <small>CALL US</small>
                      {location.phone}
                    </span>
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </a>
                )}
                {location.contact_email && (
                  <a href={`mailto:${location.contact_email}`}>
                    <Mail size={18} aria-hidden="true" />
                    <span>
                      <small>EMAIL US</small>
                      {location.contact_email}
                    </span>
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </a>
                )}
                {!location.phone && !location.contact_email && (
                  <p>Contact details will be added here soon.</p>
                )}
              </div>
            </section>
          </aside>
        </div>
      )}
    </section>
  );
}
