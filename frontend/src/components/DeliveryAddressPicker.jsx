import { useEffect, useId, useRef, useState } from "react";
import { Check, LocateFixed, MapPin, Search } from "lucide-react";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import { api } from "../api";
import { useRestaurantLocation } from "./useRestaurantLocation";
import { AutoTextarea } from "./AutoTextarea";
import { MapControls } from "./MapControls";
import { restaurantMapIcon } from "./restaurantMapIcon";
import "./deliveryAddressPicker.css";

const dropoffPin = L.divIcon({
  className: "delivery-pin",
  html: "<span></span>",
  iconSize: [24, 24],
  iconAnchor: [12, 22],
});

export function deliveryPosition(value) {
  const lat = value?.latitude,
    lng = value?.longitude;
  if (lat == null || lng == null || lat === "" || lng === "") return null;
  return Number.isFinite(Number(lat)) &&
    Math.abs(Number(lat)) <= 90 &&
    Number.isFinite(Number(lng)) &&
    Math.abs(Number(lng)) <= 180
    ? [Number(lat), Number(lng)]
    : null;
}

function DestinationMap({
  position,
  restaurant,
  active,
  onMove,
  onTileError,
  tileVersion,
}) {
  const center = position || deliveryPosition(restaurant);
  return (
    <MapContainer
      center={center || [14.5995, 120.9842]}
      zoom={position ? 17 : 13}
      scrollWheelZoom
    >
      <MapInteraction position={center} active={active} onMove={onMove} />
      <MapControls
        center={center || [14.5995, 120.9842]}
        zoom={position ? 17 : 13}
        recenterLabel="Recenter on selected location"
      />
      <TileLayer
        key={tileVersion}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        eventHandlers={{ tileerror: onTileError }}
      />
      {position && (
        <Marker
          position={position}
          icon={dropoffPin}
          draggable
          title="Your drop-off pin — drag to adjust"
          alt="Your drop-off pin"
          eventHandlers={{
            dragend: (event) => onMove(event.target.getLatLng()),
          }}
        />
      )}
      {deliveryPosition(restaurant) && (
        <Marker
          key={restaurant.name || "Restaurant pickup"}
          position={deliveryPosition(restaurant)}
          icon={restaurantMapIcon}
          title={restaurant.name || "Restaurant pickup"}
        >
          <Popup>{restaurant.name || "Restaurant"} · Pickup location</Popup>
        </Marker>
      )}
    </MapContainer>
  );
}

function MapInteraction({ position, active, onMove }) {
  const map = useMap();
  useMapEvents({ click: (event) => onMove(event.latlng) });
  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => {
      map.invalidateSize();
      if (position) map.setView(position, 17);
    });
    return () => cancelAnimationFrame(frame);
  }, [map, active, position?.[0], position?.[1]]);
  return null;
}

export function DeliveryAddressPicker({
  items,
  value,
  onChange,
  onQuote,
  active = true,
  mode = "checkout",
  onSaved,
  onSavingChange,
}) {
  const id = useId();
  const [addresses, setAddresses] = useState([]);
  const outlet = useRestaurantLocation();
  const restaurant = outlet.location;
  const provider = outlet.provider;
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState("");
  const [lookupNotice, setLookupNotice] = useState("");
  const [notice, setNotice] = useState("");
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState("");
  const [retry, setRetry] = useState(0);
  const [tileError, setTileError] = useState(false);
  const [tileVersion, setTileVersion] = useState(0);
  const latest = useRef({ value, onChange, onQuote });
  latest.current = { value, onChange, onQuote };
  const reverse = useRef(null);
  const searchRequest = useRef(null);
  const geoGeneration = useRef(0);
  const alive = useRef(true);
  const position = deliveryPosition(value);
  const itemsJson = JSON.stringify(items || []);

  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    api("/addresses", { signal: controller.signal })
      .then((r) => {
        if (controller.signal.aborted) return;
        const saved = r.data || [];
        setAddresses(saved);
        const preset = saved.find(
          (address) => address.is_default && deliveryPosition(address),
        );
        if (
          mode === "checkout" &&
          preset &&
          !deliveryPosition(latest.current.value) &&
          !latest.current.value?.formatted_address
        ) {
          latest.current.onChange({
            ...preset,
            address_record_id: preset.id,
            delivery_address_id: preset.id,
            pin_confirmed: true,
            quote: null,
          });
        }
      })
      .catch(() => {});

    return () => {
      alive.current = false;
      controller.abort();
      reverse.current?.abort();
      searchRequest.current?.abort();
      geoGeneration.current++;
    };
  }, []);

  useEffect(() => {
    if (!active) {
      reverse.current?.abort();
      searchRequest.current?.abort();
      geoGeneration.current++;
      setLocating(false);
      setResolving(false);
      setSearching(false);
    }
  }, [active]);

  useEffect(() => {
    const controller = new AbortController();
    setQuote(null);
    setQuoteError("");
    latest.current.onQuote?.(null);
    if (mode !== "checkout" || !position || !JSON.parse(itemsJson).length) {
      setQuoting(false);
      return;
    }
    setQuoting(true);
    // Dragging and repeated clicks should produce one estimate for the final pin.
    const timer = setTimeout(() => {
      api("/delivery/quote", {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({
          latitude: position[0],
          longitude: position[1],
          items: JSON.parse(itemsJson),
        }),
      })
        .then((r) => {
          if (controller.signal.aborted) return;
          setQuote(r.data);
          latest.current.onQuote?.(r.data);
        })
        .catch((failure) => {
          if (!controller.signal.aborted)
            setQuoteError(
              failure.message ||
                "Could not check delivery availability. Try again.",
            );
        })
        .finally(() => {
          if (!controller.signal.aborted) setQuoting(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    position?.[0],
    position?.[1],
    itemsJson,
    retry,
    active,
    mode,
    outlet.revision,
  ]);

  function update(patch) {
    latest.current.onChange({ ...latest.current.value, ...patch });
  }
  function cancelLocationLookup() {
    reverse.current?.abort();
    geoGeneration.current++;
    setLocating(false);
    setResolving(false);
  }
  async function move(point, fromDevice = false) {
    cancelLocationLookup();
    searchRequest.current?.abort();
    setSearching(false);
    setResults([]);
    setError("");
    setNotice("");
    setLookupNotice("");
    const latitude = Number(point.lat.toFixed(6)),
      longitude = Number(point.lng.toFixed(6));
    update({
      latitude,
      longitude,
      formatted_address: "",
      delivery_address_id: null,
      pin_confirmed: false,
      quote: null,
    });
    latest.current.onQuote?.(null);
    const controller = new AbortController();
    reverse.current = controller;
    setResolving(true);
    try {
      const r = await api(
        `/maps/reverse?latitude=${latitude}&longitude=${longitude}`,
        { signal: controller.signal },
      );
      if (controller.signal.aborted || !alive.current) return;
      const current = latest.current.value;
      if (
        Number(current?.latitude) !== latitude ||
        Number(current?.longitude) !== longitude
      )
        return;
      if (r.data?.label && !current.formatted_address)
        update({ formatted_address: r.data.label });
      setLookupNotice(
        r.data?.label
          ? fromDevice
            ? "Location found. Check that the pin is at your entrance."
            : "Address found. Check the entrance and confirm your pin."
          : "Enter the full address below, then confirm your pin.",
      );
    } catch {
      if (!controller.signal.aborted)
        setLookupNotice(
          "We could not find a street address for this pin. Enter it below; you can still use this location.",
        );
    } finally {
      if (!controller.signal.aborted && alive.current) setResolving(false);
    }
  }
  function locate() {
    cancelLocationLookup();
    setError("");
    setNotice("");
    if (!navigator.geolocation) {
      setError(
        "Location is unavailable in this browser. Search for your address instead.",
      );
      return;
    }
    setLocating(true);
    const generation = ++geoGeneration.current;
    navigator.geolocation.getCurrentPosition(
      (result) => {
        if (!alive.current || generation !== geoGeneration.current) return;
        move(
          { lat: result.coords.latitude, lng: result.coords.longitude },
          true,
        );
      },
      (failure) => {
        if (!alive.current || generation !== geoGeneration.current) return;
        setLocating(false);
        setError(
          failure.code === 1
            ? "Location permission was denied. Allow location in your browser settings or search for your address."
            : "We could not get your location. Search for your address or tap the map instead.",
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  }
  async function searchPlaces() {
    if (search.trim().length < 3) {
      setError(
        "Enter at least three characters, such as your street and city.",
      );
      return;
    }
    searchRequest.current?.abort();
    const controller = new AbortController();
    searchRequest.current = controller;
    setSearching(true);
    setError("");
    setResults([]);
    try {
      const r = await api(
        `/maps/search?q=${encodeURIComponent(search.trim())}`,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      setResults((r.data || []).filter((place) => deliveryPosition(place)));
      if (!r.data?.length)
        setError(
          "No matching places. Add your barangay or city, use your location, or tap the map.",
        );
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          failure.message || "Search is unavailable. Try again or tap the map.",
        );
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }
  function choose(place, saved = false) {
    cancelLocationLookup();
    searchRequest.current?.abort();
    setSearching(false);
    setError("");
    setNotice("");
    setLookupNotice(
      saved
        ? "Saved drop-off pin loaded. You can use it as-is or move it if your entrance has changed."
        : "Check that the pin is at the entrance where the rider should meet you.",
    );
    update({
      ...(saved ? place : {}),
      formatted_address:
        place.label && !saved ? place.label : place.formatted_address,
      latitude: Number(place.latitude),
      longitude: Number(place.longitude),
      delivery_address_id: saved ? place.id : null,
      address_record_id: saved ? place.id : null,
      pin_confirmed: saved,
      quote: null,
    });
    latest.current.onQuote?.(null);
    setResults([]);
    if (!saved) setSearch(place.label);
  }
  async function save() {
    if (saving) return;
    if (
      !position ||
      !value?.pin_confirmed ||
      !value.formatted_address?.trim() ||
      !value.recipient_name?.trim() ||
      !value.phone?.trim()
    ) {
      setError(
        "Confirm your pin and fill in the delivery address, recipient and phone before saving.",
      );
      return;
    }
    if (!value.label?.trim() && mode === "addressBook") {
      setError("Give this address a name, such as Home or Work.");
      return;
    }
    setSaving(true);
    onSavingChange?.(true);
    setError("");
    setNotice("");
    const snapshot = value;
    const recordId = snapshot.address_record_id || snapshot.delivery_address_id;
    try {
      const r = await api(recordId ? `/addresses/${recordId}` : "/addresses", {
        method: recordId ? "PUT" : "POST",
        body: JSON.stringify({
          label: snapshot.label?.trim() || "Home",
          recipient_name: snapshot.recipient_name,
          phone: snapshot.phone,
          formatted_address: snapshot.formatted_address,
          latitude: position[0],
          longitude: position[1],
          delivery_instructions: snapshot.delivery_instructions || "",
          is_default: Boolean(snapshot.is_default),
        }),
      });
      setAddresses((current) => [
        r.data,
        ...current.filter((a) => a.id !== r.data.id),
      ]);
      // Saving must not replace edits made while the request was in flight.
      if (
        [
          "formatted_address",
          "latitude",
          "longitude",
          "recipient_name",
          "phone",
          "delivery_instructions",
          "label",
          "address_record_id",
          "delivery_address_id",
        ].every((field) => latest.current.value?.[field] === snapshot[field])
      )
        update({
          delivery_address_id: r.data.id,
          address_record_id: r.data.id,
        });
      setNotice("Address saved. You can choose it for your next delivery.");
      onSaved?.(r.data);
    } catch (failure) {
      setError(failure.message);
    } finally {
      if (alive.current) setSaving(false);
      onSavingChange?.(false);
    }
  }
  async function deleteSaved() {
    if (saving) return;
    const recordId = value?.address_record_id || value?.delivery_address_id;
    setSaving(true);
    setError("");
    try {
      await api(`/addresses/${recordId}`, { method: "DELETE" });
      setAddresses((current) => current.filter((a) => a.id !== recordId));
      if (
        (latest.current.value?.address_record_id ||
          latest.current.value?.delivery_address_id) === recordId
      )
        update({ address_record_id: null, delivery_address_id: null });
      setNotice(
        "Saved address removed. Your current delivery details are still here.",
      );
    } catch (failure) {
      setError(failure.message);
    } finally {
      if (alive.current) setSaving(false);
    }
  }

  return (
    <div className="delivery-map-box delivery-address-picker">
      <ol
        className="delivery-address-steps"
        aria-label="Delivery address steps"
      >
        {["Find address", "Confirm pin", "Add details"].map((label, index) => (
          <li
            key={label}
            aria-current={
              index === (!position ? 0 : !value?.pin_confirmed ? 1 : 2)
                ? "step"
                : undefined
            }
          >
            <span aria-hidden="true">{index + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <section
        className="delivery-address-section"
        aria-labelledby={`${id}-find`}
      >
        <h3 id={`${id}-find`}>1. Find your delivery address</h3>
        <p className="delivery-address-help">
          Search your street and city, or use your current location. Then choose
          a matching result.
        </p>
        {mode === "checkout" && addresses.length > 0 && (
          <label>
            Saved address
            <select
              value={
                value?.address_record_id || value?.delivery_address_id || ""
              }
              onChange={(event) => {
                const place = addresses.find(
                  (a) => String(a.id) === event.target.value,
                );
                if (place) choose(place, true);
                else
                  update({
                    address_record_id: null,
                    delivery_address_id: null,
                  });
              }}
            >
              <option value="">Choose a saved address</option>
              {addresses.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                  {a.is_default ? " (Default)" : ""} · {a.formatted_address}
                </option>
              ))}
            </select>
          </label>
        )}
        <label htmlFor={`${id}-search`}>Search address or landmark</label>
        <div className="delivery-search">
          <input
            id={`${id}-search`}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="e.g. street, barangay, city"
            autoComplete="off"
            aria-describedby={`${id}-search-help`}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                searchPlaces();
              }
            }}
          />
          <button type="button" onClick={searchPlaces} disabled={searching}>
            <Search size={16} aria-hidden="true" />
            {searching ? "Searching…" : "Search"}
          </button>
        </div>
        <small id={`${id}-search-help`} className="delivery-address-help">
          Press Enter or Search, then select an address below.
        </small>
        <button
          type="button"
          className="ui-button ui-button--secondary location-device-button"
          onClick={locate}
          disabled={locating}
        >
          <LocateFixed size={17} aria-hidden="true" />
          {locating ? "Finding your location…" : "Use my current location"}
        </button>
        <small className="delivery-address-help">
          Your browser will ask for permission. Location is used only when you
          press this button.
        </small>
        {results.length > 0 && (
          <div
            className="place-results"
            role="group"
            aria-label="Matching delivery addresses"
          >
            {results.map((place, index) => (
              <button
                type="button"
                key={`${place.label}-${index}`}
                onClick={() => choose(place)}
              >
                <MapPin size={16} aria-hidden="true" />
                {place.label}
              </button>
            ))}
          </div>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </section>
      <section
        className="delivery-address-section"
        aria-labelledby={`${id}-pin`}
      >
        <h3 id={`${id}-pin`}>2. Put the pin at your entrance</h3>
        <p id={`${id}-pin-help`} className="delivery-address-help">
          Tap or click the map to place the pin. Drag the green drop-off pin to
          your gate or building entrance. Use + and − to zoom.
        </p>
        <div
          className="outdoor-map"
          role="region"
          aria-label="Delivery drop-off map"
          aria-describedby={`${id}-pin-help`}
        >
          <DestinationMap
            position={position}
            restaurant={restaurant}
            active={active}
            onMove={move}
            onTileError={() => setTileError(true)}
            tileVersion={tileVersion}
          />
        </div>
        {tileError && (
          <div className="delivery-map-warning" role="status">
            Map tiles could not load. Check your connection; address search is
            still available.{" "}
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setTileError(false);
                setTileVersion((n) => n + 1);
              }}
            >
              Reload map
            </button>
          </div>
        )}
        <p className="delivery-pin-status" role="status">
          {resolving
            ? "Finding the street address for this pin…"
            : lookupNotice ||
              (position
                ? "Check your drop-off point before confirming."
                : "No drop-off point selected yet. Search above or tap the map to start.")}
        </p>
        <button
          type="button"
          className={`ui-button ${value?.pin_confirmed ? "ui-button--secondary" : "ui-button--primary"}`}
          disabled={!position || resolving || locating || value?.pin_confirmed}
          onClick={() => update({ pin_confirmed: true })}
        >
          <Check size={17} aria-hidden="true" />
          {value?.pin_confirmed
            ? "Drop-off pin confirmed"
            : "Confirm this drop-off pin"}
        </button>
        <small className="delivery-address-help">
          Keyboard alternative: search above and select a result, then confirm
          the pin. You do not need to drag the map.
        </small>
        {provider === "geoapify" && (
          <small className="delivery-address-help">
            Address search and routing powered by{" "}
            <a
              href="https://www.geoapify.com/"
              target="_blank"
              rel="noreferrer"
            >
              Geoapify
            </a>
            .
          </small>
        )}
      </section>
      <section
        className="delivery-address-section"
        aria-labelledby={`${id}-details`}
      >
        <h3 id={`${id}-details`}>3. Help your rider find you</h3>
        <label>
          Address name
          <input
            maxLength={60}
            required={mode === "addressBook"}
            value={value?.label || ""}
            placeholder="Home, Work, or another name"
            onChange={(event) => update({ label: event.target.value })}
          />
        </label>
        <label>
          Delivery address
          <input
            required
            autoComplete="street-address"
            value={value?.formatted_address || ""}
            placeholder="House / unit, street, barangay, city"
            maxLength={500}
            onChange={(event) =>
              update({
                formatted_address: event.target.value,
                delivery_address_id: null,
              })
            }
          />
        </label>
        <p className="delivery-address-help">
          Check the address and add your house or unit number. Editing this text
          does not move the map pin.
        </p>
        <div className="address-details">
          <label>
            Recipient
            <input
              required
              autoComplete="name"
              maxLength={120}
              value={value?.recipient_name || ""}
              placeholder="Full name"
              onChange={(event) =>
                update({ recipient_name: event.target.value })
              }
            />
          </label>
          <label>
            Phone
            <input
              required
              type="tel"
              autoComplete="tel"
              maxLength={32}
              value={value?.phone || ""}
              placeholder="Number the rider can call"
              onChange={(event) => update({ phone: event.target.value })}
            />
          </label>
        </div>
        <label>
          Drop-off instructions (optional)
          <AutoTextarea
            maxLength={1000}
            value={value?.delivery_instructions || ""}
            placeholder="e.g. Blue gate beside the pharmacy. Call when outside."
            onChange={(event) =>
              update({ delivery_instructions: event.target.value })
            }
          />
        </label>
        <label className="address-default-choice">
          <input
            type="checkbox"
            checked={Boolean(value?.is_default)}
            onChange={(event) => update({ is_default: event.target.checked })}
          />
          Use as my default delivery address
        </label>
        <p className="delivery-address-help">
          Your default address fills in automatically when you choose Delivery.
          You can switch to another saved address at any time.
        </p>
        <div className="address-actions">
          <button
            type="button"
            className="save-address-button"
            onClick={save}
            disabled={saving}
          >
            {saving
              ? "Saving…"
              : value?.address_record_id || value?.delivery_address_id
                ? "Update saved address"
                : "Save address for next time"}
          </button>
          {mode === "checkout" &&
            (value?.address_record_id || value?.delivery_address_id) && (
              <button
                type="button"
                className="delete-address-button"
                onClick={deleteSaved}
                disabled={saving}
              >
                Delete saved address
              </button>
            )}
        </div>
        {notice && (
          <p className="delivery-pin-status" role="status">
            {notice}
          </p>
        )}
      </section>
      {quoting && (
        <p className="delivery-pin-status" role="status">
          Checking delivery coverage and fee…
        </p>
      )}
      {quoteError && (
        <div className="delivery-map-warning" role="alert">
          {quoteError}{" "}
          <button
            type="button"
            className="text-button"
            onClick={() => setRetry((n) => n + 1)}
          >
            Retry delivery estimate
          </button>
        </div>
      )}
      {quote && (
        <div className="delivery-quote" role="status">
          <strong>Delivery fee · ₱{quote.delivery_fee}</strong>
          <span>
            {quote.distance_km} km by road · estimated travel{" "}
            {quote.duration_minutes} min
          </span>
          <small>Travel time excludes food preparation.</small>
          {Number(quote.minimum_order) > 0 && (
            <small>
              {quote.meets_minimum
                ? `Minimum order ₱${quote.minimum_order} met`
                : `Add ₱${quote.minimum_remaining} to reach the ₱${quote.minimum_order} delivery minimum.`}
            </small>
          )}
        </div>
      )}
    </div>
  );
}
