import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, UtensilsCrossed } from "lucide-react";
import { api } from "../api";
import { subscribeToLiveChanges } from "../liveUpdates";
import { playSound } from "../uiSound";
import { Feedback } from "./ui";
import "./kitchenTools.css";

const NEW_TICKET_STATUSES = ["pending", "confirmed"];
const NEW_BADGE_MS = 20000;

/**
 * Chimes (and buzzes phones) when a ticket arrives, after the first load.
 * Returns the ids of tickets that arrived in the last 20 seconds so they
 * can be highlighted.
 */
export function useNewTicketAlert(orders, ready) {
  const seen = useRef(null);
  const [fresh, setFresh] = useState(() => new Set());
  useEffect(() => {
    if (!ready) return;
    const ids = orders.map((order) => order.id);
    if (seen.current === null) {
      seen.current = new Set(ids);
      return;
    }
    const arrived = orders.filter(
      (order) =>
        !seen.current.has(order.id) &&
        NEW_TICKET_STATUSES.includes(order.status),
    );
    ids.forEach((id) => seen.current.add(id));
    if (!arrived.length) return;
    playSound("newTicket");
    try {
      navigator.vibrate?.([180, 90, 180]);
    } catch {
      // Vibration is optional.
    }
    setFresh((current) => {
      const next = new Set(current);
      arrived.forEach((order) => next.add(order.id));
      return next;
    });
    const timer = window.setTimeout(
      () =>
        setFresh((current) => {
          const next = new Set(current);
          arrived.forEach((order) => next.delete(order.id));
          return next;
        }),
      NEW_BADGE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [orders, ready]);
  return fresh;
}

/** Keeps the screen on while the kitchen display is open and visible. */
export function useScreenWakeLock() {
  const [awake, setAwake] = useState(false);
  useEffect(() => {
    if (!("wakeLock" in navigator)) return undefined;
    let sentinel = null;
    let stopped = false;
    async function lock() {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        sentinel = await navigator.wakeLock.request("screen");
        setAwake(true);
        sentinel.addEventListener("release", () => setAwake(false));
      } catch {
        setAwake(false);
      }
    }
    // The lock drops whenever the tab is hidden; take it back on return.
    const relock = () => {
      if (
        document.visibilityState === "visible" &&
        (!sentinel || sentinel.released)
      )
        lock();
    };
    lock();
    document.addEventListener("visibilitychange", relock);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", relock);
      sentinel?.release().catch(() => {});
    };
  }, []);
  return awake;
}

/** Lets the kitchen mark dishes sold out (or back) without menu admin access. */
export function KitchenSoldOut({ canUpdate }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [onlySoldOut, setOnlySoldOut] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  async function load() {
    try {
      const result = await api("/kitchen/menu");
      setItems(result.data || []);
      setError("");
    } catch (failure) {
      setError(failure.message);
    }
  }
  useEffect(() => {
    load();
    return subscribeToLiveChanges(load, ["menu"]);
  }, []);
  const soldOut = items.filter((item) => item.is_sold_out);
  // Grouped by category in menu order. Rows keep their place when switched,
  // so a dish never jumps away from the cook's finger.
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const byCategory = new Map();
    for (const item of items) {
      if (onlySoldOut && !item.is_sold_out) continue;
      if (
        needle &&
        !`${item.name} ${item.category || ""}`.toLowerCase().includes(needle)
      )
        continue;
      const category = item.category || "Other dishes";
      if (!byCategory.has(category)) byCategory.set(category, []);
      byCategory.get(category).push(item);
    }
    return [...byCategory];
  }, [items, query, onlySoldOut]);
  async function toggle(item) {
    setBusy(item.id);
    setError("");
    try {
      await api(`/kitchen/menu/${item.id}/sold-out`, {
        method: "PATCH",
        body: JSON.stringify({ is_sold_out: !item.is_sold_out }),
      });
      playSound(item.is_sold_out ? "tap" : "remove");
      setItems((current) =>
        current.map((row) =>
          row.id === item.id ? { ...row, is_sold_out: !row.is_sold_out } : row,
        ),
      );
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="kitchen-soldout" data-open={open || undefined}>
      <button
        type="button"
        className="kitchen-soldout-toggle"
        aria-expanded={open}
        aria-controls="kitchen-soldout-list"
        onClick={() => setOpen((value) => !value)}
      >
        <UtensilsCrossed size={17} aria-hidden="true" />
        <span>Menu availability</span>
        {soldOut.length > 0 && (
          <b className="kitchen-soldout-count">{soldOut.length} sold out</b>
        )}
        <ChevronDown size={18} aria-hidden="true" />
      </button>
      {open && (
        <div id="kitchen-soldout-list" className="kitchen-soldout-panel">
          <div className="kitchen-soldout-tools">
            <label className="kitchen-soldout-search">
              <Search size={16} aria-hidden="true" />
              <span className="sr-only">Find a dish</span>
              <input
                type="search"
                value={query}
                placeholder="Find a dish"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div
              className="kitchen-soldout-filter"
              role="group"
              aria-label="Dishes to show"
            >
              <button
                type="button"
                aria-pressed={!onlySoldOut}
                onClick={() => setOnlySoldOut(false)}
              >
                All
              </button>
              <button
                type="button"
                aria-pressed={onlySoldOut}
                onClick={() => setOnlySoldOut(true)}
              >
                Sold out
                <span>{soldOut.length}</span>
              </button>
            </div>
          </div>
          {error && <Feedback onRetry={load}>{error}</Feedback>}
          <div className="kitchen-soldout-groups">
            {groups.map(([category, list]) => (
              <section key={category} aria-label={category}>
                <h3>
                  {category}
                  <span>{list.length}</span>
                </h3>
                <ul>
                  {list.map((item) => (
                    <li
                      key={item.id}
                      data-sold-out={item.is_sold_out || undefined}
                    >
                      <span className="kitchen-soldout-dish">
                        <strong>{item.name}</strong>
                        <small>
                          {item.is_sold_out ? "Sold out" : "On sale"}
                        </small>
                      </span>
                      <button
                        type="button"
                        className="kitchen-switch"
                        role="switch"
                        aria-checked={!item.is_sold_out}
                        aria-label={`${item.name} available`}
                        disabled={!canUpdate || busy === item.id}
                        onClick={() => toggle(item)}
                      >
                        <span aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {!groups.length && (
              <p className="kitchen-soldout-empty">
                {onlySoldOut
                  ? "Nothing is sold out. Every dish is on sale."
                  : "No dishes match."}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
