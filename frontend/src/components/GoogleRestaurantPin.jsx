import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps, googlePosition } from "../googleMaps";

export function GoogleRestaurantPin({ location, radius, onChange, apiKey }) {
  const container = useRef(null);
  const runtime = useRef(null);
  const current = useRef({ location, onChange });
  const request = useRef(0);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  useEffect(() => {
    current.current = { location, onChange };
  }, [location, onChange]);

  useEffect(() => {
    let alive = true;
    let cleanup = () => {};
    async function initialize() {
      try {
        const maps = await loadGoogleMaps(apiKey);
        const [
          { Map, Circle },
          { AdvancedMarkerElement, PinElement },
          { Place },
          { Geocoder },
        ] = await Promise.all([
          maps.importLibrary("maps"),
          maps.importLibrary("marker"),
          maps.importLibrary("places"),
          maps.importLibrary("geocoding"),
        ]);
        if (!alive) return;
        const position = googlePosition(current.current.location);
        const map = new Map(container.current, {
          center: position || { lat: 14.5995, lng: 120.9842 },
          zoom: 13,
          mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID",
          streetViewControl: false,
          mapTypeControl: false,
          scrollwheel: false,
        });
        const pin = new PinElement({
          background: "#245440",
          borderColor: "#ffffff",
          glyphColor: "#ffffff",
          scale: 1.3,
        });
        const marker = new AdvancedMarkerElement({
          map,
          position,
          gmpDraggable: true,
          title: "Restaurant location — drag to adjust",
        });
        marker.append(pin);
        const circle = new Circle({
          map,
          strokeColor: "#245440",
          strokeWeight: 2,
          fillColor: "#245440",
          fillOpacity: 0.08,
          clickable: false,
        });
        const geocoder = new Geocoder();
        runtime.current = { map, marker, circle, Place };
        async function move(point) {
          if (!point) return;
          const token = ++request.current;
          const latitude = Number(point.lat().toFixed(6)),
            longitude = Number(point.lng().toFixed(6));
          current.current.onChange((previous) => ({
            ...previous,
            latitude,
            longitude,
            address: "",
          }));
          setStatus("Finding the address for your pin…");
          setError("");
          setResults([]);
          try {
            const response = await geocoder.geocode({
              location: { lat: latitude, lng: longitude },
            });
            if (!alive || token !== request.current) return;
            const address = response.results?.[0]?.formatted_address;
            if (!address) throw new Error("No address found");
            current.current.onChange((previous) =>
              Number(previous.latitude) === latitude &&
              Number(previous.longitude) === longitude &&
              !previous.address
                ? { ...previous, address }
                : previous,
            );
            setStatus("Address found. You can edit it below if needed.");
          } catch {
            if (alive && token === request.current)
              setStatus("Could not find an address. Enter it manually below.");
          }
        }
        const click = map.addListener("click", (event) => move(event.latLng));
        const drag = marker.addListener("dragend", (event) =>
          move(event.latLng),
        );
        cleanup = () => {
          click.remove();
          drag.remove();
          marker.map = null;
          circle.setMap(null);
          runtime.current = null;
        };
        setReady(true);
      } catch {
        if (alive)
          setError(
            "Google Maps could not start. Check that your key allows this website and has Maps JavaScript API, Places API (New), and Geocoding API enabled.",
          );
      }
    }
    initialize();
    return () => {
      alive = false;
      request.current++;
      cleanup();
    };
  }, [apiKey]);

  useEffect(() => {
    const view = runtime.current;
    const position = googlePosition(location);
    if (!view || !position) return;
    view.marker.position = position;
    view.circle.setCenter(position);
    view.circle.setRadius(Math.max(0.1, Number(radius) || 8) * 1000);
    view.map.fitBounds(view.circle.getBounds(), 30);
  }, [ready, location?.latitude, location?.longitude, radius]);

  async function search() {
    if (!ready || searching) return;
    if (query.trim().length < 3) {
      setError("Enter at least three characters to search.");
      return;
    }
    const token = ++request.current;
    setSearching(true);
    setError("");
    setResults([]);
    setStatus("");
    try {
      const view = runtime.current;
      const response = await view.Place.searchByText({
        textQuery: query.trim(),
        fields: ["id", "displayName", "formattedAddress", "location"],
        maxResultCount: 5,
        region: "ph",
        locationBias: view.map.getBounds(),
      });
      if (token !== request.current) return;
      const places = (response.places || []).filter((place) => place.location);
      setResults(places);
      if (!places.length)
        setError(
          "No places found. Try the restaurant name with its city, or place a pin on the map.",
        );
    } catch {
      if (token === request.current)
        setError(
          "Google Places search is unavailable. Check your key and Places API access, or place the pin manually.",
        );
    } finally {
      if (runtime.current) setSearching(false);
    }
  }

  return (
    <div className="restaurant-pin-editor">
      <div className="restaurant-pin-heading">
        <h3>Pin your restaurant</h3>
        <span>Search with Google Maps</span>
      </div>
      <div className="restaurant-pin-search">
        <label htmlFor="google-restaurant-search">
          Find a place or address
          <input
            id="google-restaurant-search"
            value={query}
            placeholder="Restaurant name, street, or city"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                search();
              }
            }}
          />
        </label>
        <button type="button" disabled={!ready || searching} onClick={search}>
          {searching ? "Searching…" : "Search map"}
        </button>
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {results.length > 0 && (
        <div className="place-results restaurant-pin-results">
          {results.map((place) => (
            <button
              type="button"
              key={place.id}
              onClick={() => {
                request.current++;
                onChange((previous) => ({
                  ...previous,
                  address: place.formattedAddress || place.displayName,
                  latitude: place.location.lat(),
                  longitude: place.location.lng(),
                }));
                setQuery(place.displayName || place.formattedAddress);
                setResults([]);
                setStatus(
                  "Restaurant selected. Review the address below and save settings.",
                );
              }}
            >
              <strong>{place.displayName}</strong>
              <br />
              {place.formattedAddress}
            </button>
          ))}
        </div>
      )}
      {!ready && !error && (
        <p className="restaurant-pin-help">Loading Google Maps…</p>
      )}
      <div
        ref={container}
        className="restaurant-settings-map"
        aria-label="Google restaurant location map"
      />
      {status && (
        <p className="restaurant-address-status" role="status">
          {status}
        </p>
      )}
      <p className="restaurant-pin-help">
        Click the map or drag the pin to adjust your restaurant location. The
        shaded circle shows your delivery radius. Save settings to apply
        changes.
      </p>
    </div>
  );
}
