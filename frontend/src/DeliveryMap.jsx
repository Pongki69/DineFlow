import { Feedback, Skeleton } from "./components/ui";
import { useEffect, useMemo, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "./api";

const pin = L.divIcon({
  className: "delivery-pin",
  html: "<span></span>",
  iconSize: [24, 24],
  iconAnchor: [12, 22],
});
function PinPicker({ position, onMove }) {
  useMapEvents({
    click(event) {
      onMove(event.latlng);
    },
  });
  return position ? (
    <Marker
      position={position}
      draggable
      icon={pin}
      eventHandlers={{
        dragend(event) {
          onMove(event.target.getLatLng());
        },
      }}
    />
  ) : null;
}
function MapCenter({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.setView(position, Math.max(map.getZoom(), 15));
  }, [map, position?.[0], position?.[1]]);
  return null;
}

export function DeliveryMapSelector({ items, value, onChange, onQuote }) {
  const [addresses, setAddresses] = useState([]);
  const [restaurant, setRestaurant] = useState(null);
  const [mapProvider, setMapProvider] = useState(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [quote, setQuote] = useState(null);
  const position =
    value?.latitude != null
      ? [Number(value.latitude), Number(value.longitude)]
      : null;
  const itemsJson = useMemo(() => JSON.stringify(items || []), [items]);
  useEffect(() => {
    api("/addresses")
      .then((r) => setAddresses(r.data || []))
      .catch(() => {});
    api("/restaurant/location")
      .then((r) => {
        setRestaurant(r.data);
        setMapProvider(r.map_provider);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!position || !items?.length) {
      setQuote(null);
      return;
    }
    let alive = true;
    setBusy(true);
    setError("");
    setQuote(null);
    onQuote?.(null);
    api("/delivery/quote", {
      method: "POST",
      body: JSON.stringify({
        latitude: Number(value.latitude),
        longitude: Number(value.longitude),
        items: JSON.parse(itemsJson),
      }),
    })
      .then((r) => {
        if (alive) {
          setQuote(r.data);
          onQuote?.(r.data);
        }
      })
      .catch((e) => {
        if (alive) {
          setQuote(null);
          onQuote?.(null);
          setError(e.message);
        }
      })
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [value?.latitude, value?.longitude, itemsJson]);
  async function searchPlaces() {
    if (search.trim().length < 3) {
      setError("Enter at least three characters to search.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const result = await api(`/maps/search?q=${encodeURIComponent(search)}`);
      setResults(result.data || []);
      if (!result.data?.length)
        setError(
          "No matching places found. Try a more complete address or place a pin on the map.",
        );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function choose(place) {
    onChange({
      ...value,
      formatted_address: place.label,
      latitude: Number(place.latitude),
      longitude: Number(place.longitude),
      delivery_address_id: null,
    });
    setResults([]);
  }
  function move(latlng) {
    onChange({
      ...value,
      latitude: latlng.lat,
      longitude: latlng.lng,
      delivery_address_id: null,
    });
  }
  async function save() {
    if (!value?.formatted_address || !position) {
      setError("Search for an address or enter it before saving.");
      return;
    }
    setError("");
    try {
      const id = value.address_record_id || value.delivery_address_id;
      const data = {
        label: value.label || "Home",
        recipient_name: value.recipient_name || "",
        phone: value.phone || "",
        formatted_address: value.formatted_address,
        latitude: Number(value.latitude),
        longitude: Number(value.longitude),
        delivery_instructions: value.delivery_instructions || "",
        is_default: false,
      };
      const result = await api(id ? `/addresses/${id}` : "/addresses", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(data),
      });
      setAddresses((current) => [
        result.data,
        ...current.filter((a) => a.id !== result.data.id),
      ]);
      onChange({
        ...value,
        delivery_address_id: result.data.id,
        address_record_id: result.data.id,
      });
    } catch (e) {
      setError(e.message);
    }
  }
  async function deleteSaved() {
    const id = value?.address_record_id || value?.delivery_address_id;
    if (!id) return;
    try {
      await api(`/addresses/${id}`, { method: "DELETE" });
      setAddresses((current) => current.filter((a) => a.id !== id));
      onChange({});
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <div className="delivery-map-box">
      <h3>Delivery destination</h3>
      {addresses.length > 0 && (
        <label>
          Saved address
          <select
            value={value?.address_record_id || value?.delivery_address_id || ""}
            onChange={(e) => {
              const a = addresses.find((x) => String(x.id) === e.target.value);
              if (a)
                onChange({
                  ...a,
                  delivery_address_id: a.id,
                  address_record_id: a.id,
                });
              else
                onChange({
                  ...value,
                  delivery_address_id: null,
                  address_record_id: null,
                });
            }}
          >
            <option value="">Choose or enter a new address</option>
            {addresses.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label} · {a.formatted_address}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="delivery-search">
        <input
          aria-label="Search delivery address"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search an address or place"
          minLength={3}
        />
        <button type="button" onClick={searchPlaces} disabled={busy}>
          Search
        </button>
      </div>
      {results.length > 0 && (
        <div className="place-results">
          {results.map((place, i) => (
            <button
              type="button"
              key={`${place.label}-${i}`}
              onClick={() => choose(place)}
            >
              {place.label}
            </button>
          ))}
        </div>
      )}
      <p className="map-help">
        Choose a search result or tap the map. Drag the pin to fine-tune your
        drop-off point.
      </p>
      <div className="outdoor-map">
        <MapContainer
          center={
            position ||
            (restaurant?.latitude
              ? [Number(restaurant.latitude), Number(restaurant.longitude)]
              : [14.5995, 120.9842])
          }
          zoom={position ? 16 : 12}
          scrollWheelZoom
        >
          <MapCenter position={position} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {restaurant?.latitude && (
            <CircleMarker
              center={[
                Number(restaurant.latitude),
                Number(restaurant.longitude),
              ]}
              radius={8}
              pathOptions={{ color: "#2e5a43" }}
            >
              <Popup>
                {restaurant.name || "Restaurant"}
                <br />
                {restaurant.address}
              </Popup>
            </CircleMarker>
          )}
          <PinPicker position={position} onMove={move} />
        </MapContainer>
      </div>
      {mapProvider === "geoapify" && (
        <p className="map-help">
          Address search and routing powered by{" "}
          <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer">
            Geoapify
          </a>
          .
        </p>
      )}
      <label>
        Delivery address
        <input
          value={value?.formatted_address || ""}
          onChange={(e) =>
            onChange({
              ...value,
              formatted_address: e.target.value,
              delivery_address_id: null,
            })
          }
          placeholder="Street, barangay, city"
          required
        />
      </label>
      <div className="address-details">
        <label>
          Recipient
          <input
            value={value?.recipient_name || ""}
            onChange={(e) =>
              onChange({ ...value, recipient_name: e.target.value })
            }
            maxLength={120}
            required
          />
        </label>
        <label>
          Phone
          <input
            value={value?.phone || ""}
            onChange={(e) => onChange({ ...value, phone: e.target.value })}
            maxLength={32}
            required
          />
        </label>
      </div>
      <label>
        Drop-off instructions
        <textarea
          value={value?.delivery_instructions || ""}
          onChange={(e) =>
            onChange({ ...value, delivery_instructions: e.target.value })
          }
          maxLength={1000}
          placeholder="Gate, landmark, or other instructions"
        />
      </label>
      <div className="address-actions">
        <button type="button" className="save-address-button" onClick={save}>
          {value?.address_record_id || value?.delivery_address_id
            ? "Update saved address"
            : "Save this address"}
        </button>
        {(value?.address_record_id || value?.delivery_address_id) && (
          <button
            type="button"
            className="delete-address-button"
            onClick={deleteSaved}
          >
            Delete saved address
          </button>
        )}
      </div>
      {busy && (
        <p className="map-help" role="status">
          Finding route and delivery estimate…
        </p>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {quote && (
        <div className="delivery-quote">
          <strong>Delivery · ₱{quote.delivery_fee}</strong>
          <span>
            {quote.distance_km} km by road · about {quote.duration_minutes}{" "}
            minutes
          </span>
          {Number(quote.minimum_order) > 0 && (
            <small>
              {quote.meets_minimum
                ? `Minimum order ₱${quote.minimum_order} met`
                : `Add ₱${quote.minimum_remaining} to reach the ₱${quote.minimum_order} delivery minimum.`}
            </small>
          )}
        </div>
      )}
      {restaurant?.navigation_url && (
        <a
          className="map-link"
          href={restaurant.navigation_url}
          target="_blank"
          rel="noreferrer"
        >
          Directions to {restaurant.name || "the restaurant"}
        </a>
      )}
    </div>
  );
}

export function RestaurantLocation() {
  const [location, setLocation] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api("/restaurant/location")
      .then((r) => setLocation(r.data))
      .catch((e) => setError(e.message));
  }, []);
  if (error) return <div className="error">{error}</div>;
  if (!location) return <p>Restaurant location has not been configured yet.</p>;
  const center = [Number(location.latitude), Number(location.longitude)];
  return (
    <section className="location-card">
      <h2>{location.name || "Visit our restaurant"}</h2>
      <p>{location.address}</p>
      <p>
        {location.phone} {location.contact_email}
      </p>
      {location.opening_hours && (
        <p>
          Opening hours:{" "}
          {Object.entries(location.opening_hours)
            .map(
              ([day, hours]) =>
                `${day}: ${hours.closed ? "Closed" : hours.open && hours.close ? `${hours.open}–${hours.close}` : "Hours not provided"}`,
            )
            .join(" · ")}
        </p>
      )}
      <MapContainer center={center} zoom={16} scrollWheelZoom>
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={center} icon={pin} />
      </MapContainer>
      <a
        className="map-link"
        href={location.navigation_url}
        target="_blank"
        rel="noreferrer"
      >
        Open directions
      </a>
    </section>
  );
}

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
                value={data.location?.[key] || ""}
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
