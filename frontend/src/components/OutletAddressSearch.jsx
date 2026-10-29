import { useEffect, useId, useRef, useState } from "react";
import { MapPin, Search } from "lucide-react";
import { api } from "../api";
import { Button } from "./ui";
import { hasOutletCoordinates } from "../features/outletConfiguration";

export function OutletAddressSearch({ onSelect, disabled = false }) {
  const id = useId();
  const root = useRef(null);
  const input = useRef(null);
  const request = useRef(null);
  const timer = useRef(null);
  const cache = useRef(new Map());
  const selectedLabel = useRef("");
  const editing = useRef(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [active, setActive] = useState(-1);

  function dismiss() {
    editing.current = false;
    clearTimeout(timer.current);
    request.current?.abort();
    setBusy(false);
    setOpen(false);
    setActive(-1);
  }
  useEffect(() => {
    function outside(event) {
      if (!root.current?.contains(event.target)) dismiss();
    }
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("pointerdown", outside);
      clearTimeout(timer.current);
      request.current?.abort();
    };
  }, []);

  async function search(value) {
    clearTimeout(timer.current);
    request.current?.abort();
    const text = value.trim();
    if (text.length < 3 || disabled) return;
    editing.current = true;
    const controller = new AbortController();
    request.current = controller;
    setOpen(true);
    setActive(-1);
    setError("");
    setSearched(false);
    setResults([]);
    const key = text.toLowerCase();
    if (cache.current.has(key)) {
      setResults(cache.current.get(key));
      setSearched(true);
      setBusy(false);
      return;
    }
    setBusy(true);
    try {
      const response = await api(`/maps/search?q=${encodeURIComponent(text)}`, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const places = (response.data || []).filter(
        (place) =>
          typeof place.label === "string" &&
          place.label.trim() &&
          hasOutletCoordinates(place),
      );
      if (cache.current.size >= 30)
        cache.current.delete(cache.current.keys().next().value);
      cache.current.set(key, places);
      setResults(places);
      setSearched(true);
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          failure.status === 429
            ? "Too many searches. Pause briefly, then retry or place the pin on the map."
            : "Address suggestions are unavailable. Try again or place the pin on the map.",
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  useEffect(() => {
    if (
      !editing.current ||
      disabled ||
      query.trim().length < 3 ||
      query === selectedLabel.current
    )
      return;
    timer.current = setTimeout(() => search(query), 500);
    return () => {
      clearTimeout(timer.current);
      request.current?.abort();
    };
  }, [query, disabled]);

  function choose(place) {
    input.current?.focus({ preventScroll: true });
    dismiss();
    const label = place.label.slice(0, 180);
    selectedLabel.current = label;
    setQuery(label);
    setResults([]);
    onSelect(place);
  }
  const expanded = open && !disabled && query.trim().length >= 3;
  useEffect(() => {
    if (expanded && active >= 0)
      document
        .getElementById(`${id}-address-${active}`)
        ?.scrollIntoView?.({ block: "nearest" });
  }, [expanded, active, id]);
  return (
    <div
      className="admin-map-search-wrap"
      ref={root}
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          dismiss();
      }}
    >
      <form
        className="admin-map-search"
        onSubmit={(event) => {
          event.preventDefault();
          search(query);
        }}
      >
        <label className="admin-search">
          <Search size={17} aria-hidden="true" />
          <input
            ref={input}
            role="combobox"
            aria-label="Find outlet address"
            aria-autocomplete="list"
            aria-expanded={expanded}
            aria-controls={`${id}-addresses`}
            aria-activedescendant={
              expanded && active >= 0 ? `${id}-address-${active}` : undefined
            }
            aria-describedby={`${id}-help`}
            autoComplete="off"
            placeholder="Search a street, city or restaurant…"
            minLength={3}
            maxLength={180}
            disabled={disabled}
            value={query}
            onFocus={() => {
              if (query.trim().length >= 3 && query !== selectedLabel.current) {
                editing.current = true;
                setOpen(true);
              }
            }}
            onChange={(event) => {
              request.current?.abort();
              clearTimeout(timer.current);
              editing.current = true;
              selectedLabel.current = "";
              setQuery(event.target.value);
              setResults([]);
              setActive(-1);
              setError("");
              setSearched(false);
              setBusy(false);
              setOpen(event.target.value.trim().length >= 3);
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Escape" || event.key === "Tab") {
                if (event.key === "Escape" && expanded) {
                  event.preventDefault();
                  event.stopPropagation();
                }
                dismiss();
              } else if (
                results.length &&
                (event.key === "ArrowDown" || event.key === "ArrowUp")
              ) {
                event.preventDefault();
                setOpen(true);
                setActive((index) =>
                  event.key === "ArrowDown"
                    ? (index + 1) % results.length
                    : index <= 0
                      ? results.length - 1
                      : index - 1,
                );
              } else if (
                event.key === "Enter" &&
                expanded &&
                active >= 0 &&
                results[active]
              ) {
                event.preventDefault();
                choose(results[active]);
              }
            }}
          />
        </label>
        <Button
          type="submit"
          className="admin-button admin-button--secondary"
          variant="secondary"
          busy={busy}
          disabled={disabled || query.trim().length < 3}
        >
          Search
        </Button>
      </form>
      <span id={`${id}-help`} className="sr-only">
        Type at least three characters. Use the up and down arrows to browse
        suggestions, Enter to select, or Escape to close.
      </span>
      {expanded && (
        <div className="admin-place-results">
          {busy && <p role="status">Finding matching addresses…</p>}
          {error && (
            <div className="admin-address-search-error" role="status">
              <p>{error}</p>
              <button type="button" onClick={() => search(query)}>
                Retry suggestions
              </button>
            </div>
          )}
          {!busy && !error && searched && !results.length && (
            <p role="status">
              No matching addresses. Try a street and city, or place the pin on
              the map.
            </p>
          )}
          {!busy && !error && !searched && (
            <p role="status">Keep typing to refine your address…</p>
          )}
          <div
            role="listbox"
            id={`${id}-addresses`}
            aria-label="Matching addresses"
            aria-busy={busy}
          >
            {results.map((place, index) => (
              <button
                key={`${place.label}-${index}`}
                id={`${id}-address-${index}`}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={active === index}
                onMouseDown={(event) => event.preventDefault()}
                onPointerMove={() => setActive(index)}
                onClick={() => choose(place)}
              >
                <MapPin size={16} aria-hidden="true" />
                {place.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
