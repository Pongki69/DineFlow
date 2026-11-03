import { playSound } from "../uiSound";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  Check,
  Clock,
  Info,
  LocateFixed,
  Power,
  Radio,
  TriangleAlert,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { privateEcho } from "../realtime";
import { enqueueLiveRefresh, subscribeToLiveChanges } from "../liveUpdates";
import { Button, Feedback } from "./ui";
import "./riderDispatch.css";
import { RIDER_VEHICLE_SETUP, VehicleIcon } from "./RiderVehicle";
import { useMediaQuery } from "./useMediaQuery";
import { OffersWaitingMap } from "./OffersWaitingMap";
import { liveOffers, receiveOffers, showOfferUpdates } from "./offerFeed";
import { updateRiderPresence } from "./riderPresence";
import { subscribeRiderLocation } from "./riderLocationSession";
import { RiderScreenSkeleton } from "./RiderScreenSkeleton";
import {
  INSECURE_LOCATION_MESSAGE,
  locationDeniedMessage,
  locationNeedsSecureContext,
} from "./locationAccess";

function makePreviewOffers() {
  const expiresAt = (minutes) =>
    new Date(Date.now() + minutes * 60_000).toISOString();
  return [
    {
      id: "preview-offer-01",
      order_number: "PREVIEW-1044",
      pickup: "DineFlow Demo Restaurant, Manila",
      destination: "Sampaloc, Manila (preview stop)",
      eta_minutes: 8,
      expires_at: expiresAt(30),
      batched: false,
      preview_only: true,
    },
    {
      id: "preview-offer-02",
      order_number: "PREVIEW-1045",
      pickup: "DineFlow Demo Restaurant, Manila",
      destination: "Binondo, Manila (preview stop)",
      eta_minutes: 12,
      expires_at: expiresAt(30),
      batched: true,
      preview_only: true,
    },
    {
      id: "preview-offer-03",
      order_number: "PREVIEW-1046",
      pickup: "DineFlow Demo Restaurant, Manila",
      destination: "San Miguel, Manila (preview stop)",
      eta_minutes: 16,
      expires_at: expiresAt(30),
      batched: false,
      preview_only: true,
    },
  ];
}

const missingVehicle = (message) =>
  /vehicle|bicycle, motorcycle or car/i.test(message);

/**
 * Errors from the availability controls. One panel serves every rider page, so
 * on a phone the message floats above the bottom bar (by the power button
 * that caused it) instead of pushing the page down. A missing vehicle links
 * straight to the vehicle setting.
 */
function DispatchError({ message }) {
  const phone = useMediaQuery("(max-width: 850px)");
  const [dismissed, setDismissed] = useState("");
  if (!message || message === dismissed) return null;
  const vehicle = missingVehicle(message);
  if (!phone)
    return vehicle ? (
      <Link className="rider-dispatch-error-link" to={RIDER_VEHICLE_SETUP}>
        <Feedback>
          {message}
          <span className="rider-dispatch-error-action">
            Add your vehicle →
          </span>
        </Feedback>
      </Link>
    ) : (
      <Feedback>{message}</Feedback>
    );
  return createPortal(
    <div className="rider-dispatch-toast" role="alert">
      <AlertCircle size={18} aria-hidden="true" />
      <p>{vehicle ? "Add your vehicle before going online." : message}</p>
      {vehicle && (
        <Link
          className="rider-dispatch-toast-action"
          to={RIDER_VEHICLE_SETUP}
          onClick={() => setDismissed(message)}
        >
          Add vehicle
        </Link>
      )}
      <button
        type="button"
        className="rider-dispatch-toast-close"
        aria-label="Dismiss message"
        onClick={() => setDismissed(message)}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>,
    // Inside the app shell so it keeps the workspace's colours and type.
    document.querySelector(".app-shell") || document.body,
  );
}

// The browser's location permission: "granted", "denied" or "prompt".
function useLocationPermission() {
  const [state, setState] = useState("prompt");
  useEffect(() => {
    let status = null;
    let alive = true;
    navigator.permissions
      ?.query?.({ name: "geolocation" })
      .then((result) => {
        if (!alive) return;
        status = result;
        setState(result.state);
        result.onchange = () => setState(result.state);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (status) status.onchange = null;
    };
  }, []);
  return state;
}

const VEHICLE_NAMES = {
  bicycle: "Bicycle",
  motorcycle: "Motorcycle",
  car: "Car",
};

/** What has to be in place before going online, each with its fix. */
function OffersReadiness({ vehicle, location, connected }) {
  const rows = [
    {
      key: "vehicle",
      icon: <VehicleIcon type={vehicle} size={17} />,
      label: "Vehicle",
      ok: !!vehicle,
      value: vehicle ? VEHICLE_NAMES[vehicle] || vehicle : "Not added yet",
      fix: !vehicle && (
        <Link className="offers-readiness-fix" to={RIDER_VEHICLE_SETUP}>
          Add
        </Link>
      ),
    },
    {
      key: "location",
      icon: <LocateFixed size={17} aria-hidden="true" />,
      label: "Location",
      ok: location === "granted" ? true : location === "denied" ? false : null,
      value:
        location === "granted"
          ? "Allowed"
          : location === "denied"
            ? "Blocked · allow it in your browser settings"
            : "We\u2019ll ask when you go online",
    },
    {
      key: "connection",
      icon: connected ? (
        <Wifi size={17} aria-hidden="true" />
      ) : (
        <WifiOff size={17} aria-hidden="true" />
      ),
      label: "Connection",
      ok: connected,
      value: connected ? "Connected" : "Reconnect to the internet",
    },
  ];
  return (
    <ul
      className="offers-readiness"
      aria-label="Ready to go online"
      // All set: one line of chips, so the map stays in view.
      data-ready={rows.every((row) => row.ok === true) || undefined}
    >
      {rows.map(({ key, icon, label, ok, value, fix }) => (
        <li
          key={key}
          data-state={ok === true ? "ok" : ok === false ? "bad" : "wait"}
        >
          {icon}
          <span>
            <strong>{label}</strong>
            <small>{value}</small>
          </span>
          {fix ||
            (ok === true ? (
              <Check size={17} aria-label="Ready" />
            ) : ok === false ? (
              <TriangleAlert size={17} aria-label="Needs attention" />
            ) : null)}
        </li>
      ))}
    </ul>
  );
}

function checkedAgo(locatedAt, serverNow) {
  const at = locatedAt ? new Date(locatedAt).getTime() : NaN;
  if (!Number.isFinite(at)) return "";
  const seconds = Math.max(0, Math.round((serverNow - at) / 1000));
  return seconds < 60
    ? `checked ${seconds}s ago`
    : `checked ${Math.floor(seconds / 60)} min ago`;
}

export function RiderDispatchPanel({
  onAccepted,
  compact = false,
  headerOnly = false,
}) {
  const [data, setData] = useState(null);
  const [feed, setFeed] = useState({ visible: [], queued: [] });
  const [respondingId, setRespondingId] = useState(null);
  const responseLock = useRef(false);
  const loadPending = useRef(false);
  const previewOffersEnabled = useRef(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(false);
  const [connected, setConnected] = useState(navigator.onLine !== false);
  const [statusUnavailable, setStatusUnavailable] = useState(false);
  // Phones get a lighter Offers page: one way to go online, a readiness
  // list, and a map while waiting.
  const phone = useMediaQuery("(max-width: 850px)");
  const locationPermission = useLocationPermission();
  const [showHelp, setShowHelp] = useState(false);
  const [now, setNow] = useState(Date.now());
  // Remaining time when each offer was first shown; the countdown bar drains
  // from full against it.
  const offerWindows = useRef(new Map());
  const latest = useRef({ onAccepted });
  latest.current = { onAccepted, compact };
  const watch = useRef(null),
    watchVersion = useRef(0),
    presenceToken = useRef(null),
    sentAt = useRef(0),
    posting = useRef(false),
    alive = useRef(true),
    enabled = useRef(false),
    offset = useRef(0);
  async function load() {
    if (loadPending.current) return;
    loadPending.current = true;
    try {
      const result = await api("/rider/dispatch");
      if (!alive.current) return;
      const serverTime = new Date(result.server_time).getTime();
      offset.current = Number.isFinite(serverTime)
        ? serverTime - Date.now()
        : 0;
      setNow(Date.now());
      const offers =
        result.offers?.length ||
        !import.meta.env.DEV ||
        !previewOffersEnabled.current
          ? result.offers || []
          : makePreviewOffers();
      setData({ ...result, offers });
      setFeed((previous) =>
        receiveOffers(
          previous,
          offers,
          Date.now() + offset.current,
          latest.current.compact,
        ),
      );
      setStatusUnavailable(false);
      setLoadError("");
    } catch (failure) {
      if (alive.current) {
        setLoadError(failure.message);
        setStatusUnavailable(true);
      }
    } finally {
      loadPending.current = false;
    }
  }
  useEffect(() => {
    alive.current = true;
    load();
    const handleOnline = () => {
      setConnected(true);
      load();
    };
    const handleOffline = () => setConnected(false);
    const handleVisibility = () => {
      if (document.visibilityState !== "hidden") load();
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibility);
    const unsubscribe = subscribeToLiveChanges(load, ["deliveries", "orders"]);
    const countdown = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive.current = false;
      enabled.current = false;
      unsubscribe();
      clearInterval(countdown);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
      stopWatch();
    };
  }, []);
  const riderId = data?.profile?.user_id;
  useEffect(() => {
    if (!riderId) return;
    let echo;
    try {
      echo = privateEcho();
      echo?.private(`rider.${riderId}`).listen(".dispatch.offer", () => {
        enqueueLiveRefresh(() => {
          load();
          latest.current.onAccepted?.();
        });
      });
    } catch {
      echo?.disconnect();
    }
    return () => {
      echo?.leave(`rider.${riderId}`);
      echo?.disconnect();
    };
  }, [riderId]);

  function stopWatch() {
    watchVersion.current++;
    enabled.current = false;
    watch.current?.();
    watch.current = null;
  }
  async function toggle(reconnect = false) {
    if (busy) return;
    setError("");
    setBusy(true);
    if (!reconnect && (online || data?.profile?.is_online)) {
      stopWatch();
      try {
        await api("/rider/presence", {
          method: "PUT",
          body: JSON.stringify({ is_online: false }),
        });
        setOnline(false);
        await load();
      } catch (failure) {
        setError(failure.message);
      } finally {
        if (alive.current) setBusy(false);
      }
      return;
    }
    if (!navigator.geolocation || locationNeedsSecureContext()) {
      setError(
        navigator.geolocation
          ? INSECURE_LOCATION_MESSAGE
          : "Your browser cannot share location. Use a supported browser with location services enabled.",
      );
      setBusy(false);
      return;
    }
    stopWatch();
    enabled.current = true;
    sentAt.current = 0;
    presenceToken.current = null;
    const version = watchVersion.current;
    watch.current = subscribeRiderLocation(
      navigator.geolocation,
      async ({ coords }) => {
        if (
          !enabled.current ||
          version !== watchVersion.current ||
          posting.current ||
          Date.now() - sentAt.current < 15000
        )
          return;
        if (coords.accuracy > 500) {
          stopWatch();
          setOnline(false);
          setError(
            "GPS accuracy is too low. Move to an open area and try again.",
          );
          setBusy(false);
          return;
        }
        posting.current = true;
        try {
          const result = await api("/rider/presence", {
            method: "PUT",
            body: JSON.stringify({
              is_online: true,
              start: !presenceToken.current,
              presence_token: presenceToken.current,
              latitude: coords.latitude,
              longitude: coords.longitude,
              accuracy_meters: coords.accuracy,
            }),
          });
          if (
            !enabled.current ||
            !alive.current ||
            version !== watchVersion.current
          )
            return;
          presenceToken.current = result.presence_token;
          sentAt.current = Date.now();
          setOnline(true);
          setBusy(false);
          setError("");
          await load();
        } catch (failure) {
          if (alive.current && version === watchVersion.current) {
            stopWatch();
            setOnline(false);
            setError(failure.message);
            setBusy(false);
          }
        } finally {
          posting.current = false;
        }
      },
      (failure) => {
        if (!alive.current || version !== watchVersion.current) return;
        stopWatch();
        setOnline(false);
        setBusy(false);
        setError(
          failure.code === 1
            ? locationDeniedMessage(
                "Location permission denied. Allow location access to receive nearby delivery offers.",
              )
            : "Location unavailable. Enable GPS and select Go online again. Offers pause when your location becomes stale.",
        );
      },
    );
  }
  async function respond(offer, response) {
    if (offer.preview_only) return;
    if (
      busy ||
      responseLock.current ||
      offer.feedStatus !== "available" ||
      new Date(offer.expires_at).getTime() <= Date.now() + offset.current
    )
      return;
    responseLock.current = true;
    setRespondingId(offer.id);
    setFeed((previous) => ({
      ...previous,
      visible: previous.visible.map((item) =>
        item.id === offer.id ? { ...item, feedStatus: "responding" } : item,
      ),
    }));
    setBusy(true);
    setError("");
    try {
      await api(`/rider/offers/${offer.id}/respond`, {
        method: "POST",
        body: JSON.stringify({ response }),
      });
      playSound(response === "accept" ? "success" : "remove");
      if (!alive.current) return;
      setFeed((previous) => ({
        ...previous,
        visible: previous.visible.map((item) =>
          item.id === offer.id
            ? {
                ...item,
                feedStatus: response === "accept" ? "accepted" : "declined",
              }
            : item,
        ),
      }));
      await load();
      latest.current.onAccepted?.();
    } catch (failure) {
      if (!alive.current) return;
      setFeed((previous) => ({
        ...previous,
        visible: previous.visible.map((item) =>
          item.id === offer.id
            ? {
                ...item,
                feedStatus: [409, 410, 422].includes(failure.status)
                  ? "unavailable"
                  : "available",
              }
            : item,
        ),
      }));
      setError(failure.message);
      await load();
    } finally {
      responseLock.current = false;
      if (alive.current) {
        setBusy(false);
        setRespondingId(null);
      }
    }
  }
  const fresh =
    data?.profile?.located_at &&
    now + offset.current - new Date(data.profile.located_at).getTime() < 90000;
  const active =
    online &&
    fresh &&
    data?.profile?.is_online &&
    connected &&
    !statusUnavailable;
  const presenceState = !connected
    ? "disconnected"
    : statusUnavailable
      ? "unknown"
      : !data
        ? "checking"
        : active
          ? "online"
          : online || data.profile?.is_online
            ? "paused"
            : "offline";
  const statusLabel = {
    online: "Online",
    offline: "Offline",
    paused: "GPS paused",
    disconnected: "No connection",
    unknown: "Status unavailable",
    checking: "Checking status",
  }[presenceState];
  useEffect(() => {
    updateRiderPresence({
      state: presenceState,
      locatedAt: data?.profile?.located_at || null,
    });
  }, [presenceState, data?.profile?.located_at]);
  const actionLabel =
    online || data?.profile?.is_online ? "Go offline" : "Go online";
  const statusTarget = document.getElementById("rider-presence-slot");
  const serverNow = now + offset.current;
  const queuedOffers = liveOffers(feed.queued, serverNow);
  const inactiveCount = feed.visible.filter(
    (offer) =>
      offer.feedStatus !== "responding" &&
      (offer.feedStatus !== "available" ||
        new Date(offer.expires_at).getTime() <= serverNow),
  ).length;
  const headerStatus =
    statusTarget &&
    createPortal(
      <div className="rider-presence-controls">
        <button
          className={`rider-header-presence ${presenceState}`}
          onClick={() => toggle()}
          disabled={busy || !connected || statusUnavailable || !data}
          aria-label={`Rider status: ${statusLabel}. ${actionLabel}`}
          title={`${statusLabel} · ${actionLabel}`}
        >
          <Power
            className="rider-presence-power"
            size={22}
            aria-hidden="true"
          />
          <span className="rider-presence-dot" aria-hidden="true" />
          <span aria-live="polite">{statusLabel}</span>
          <span className="rider-header-presence-action">
            {busy ? "Please wait…" : actionLabel}
          </span>
        </button>
        {presenceState === "paused" && (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => toggle(true)}
          >
            Reconnect GPS
          </Button>
        )}
      </div>,
      statusTarget,
    );
  function addPreviewOffers() {
    previewOffersEnabled.current = true;
    setFeed((previous) => ({
      ...previous,
      visible: [
        ...previous.visible,
        ...makePreviewOffers().map((offer) => ({
          ...offer,
          feedStatus: "available",
        })),
      ],
    }));
  }
  if (compact) {
    if (headerOnly)
      return (
        <>
          {headerStatus}
          {(error || loadError) && (
            <DispatchError message={error || loadError} />
          )}
        </>
      );
    const offers =
      data?.offers?.filter(
        (offer) => new Date(offer.expires_at).getTime() > now + offset.current,
      ).length || 0;
    return (
      <>
        {headerStatus}
        <section
          className={`rider-availability-bar ${presenceState}`}
          aria-label="Rider availability"
        >
          <div>
            <strong>
              <span className="rider-presence-dot" aria-hidden="true" />
              {!connected
                ? "Connection lost · offers paused"
                : statusUnavailable
                  ? "Unable to check your status"
                  : !data
                    ? "Checking your availability…"
                    : active
                      ? "Online · GPS active"
                      : online || data?.profile?.is_online
                        ? "GPS needs reconnecting"
                        : "You’re offline"}
            </strong>
            <small>
              {active
                ? "Available for delivery offers"
                : data?.profile?.is_online
                  ? "Select Reconnect GPS in the availability controls"
                  : "You won’t receive new offers until you go online"}
            </small>
          </div>
          <div className="rider-bar-actions">
            <Link to="/rider/offers">
              {offers
                ? `${offers} new offer${offers === 1 ? "" : "s"}`
                : "View offers"}
            </Link>
            <Button
              onClick={() => toggle()}
              busy={busy}
              disabled={!connected || statusUnavailable || !data}
              variant={active ? "secondary" : "primary"}
            >
              <LocateFixed size={17} aria-hidden="true" />
              {online || data?.profile?.is_online ? "Go offline" : "Go online"}
            </Button>
          </div>
          {(error || loadError) && (
            <DispatchError message={error || loadError} />
          )}
        </section>
      </>
    );
  }
  return (
    <>
      {headerStatus}
      <section
        className="rider-dispatch-panel"
        aria-labelledby="rider-offers-title"
      >
        <div className="rider-dispatch-heading">
          <div>
            <h2 id="rider-offers-title">Nearby delivery offers</h2>
            {!phone && (
              <p className="offers-subtitle">
                Pick up nearby. Deliver with confidence.
              </p>
            )}
          </div>
          {phone ? (
            <button
              type="button"
              className="offers-help-toggle"
              aria-expanded={showHelp}
              aria-controls="offers-help-note"
              aria-label="GPS & privacy"
              onClick={() => setShowHelp((open) => !open)}
            >
              <Info size={18} aria-hidden="true" />
            </button>
          ) : (
            <Button
              onClick={() => toggle()}
              busy={busy}
              disabled={!connected || statusUnavailable || !data}
              variant={online ? "secondary" : "primary"}
            >
              <LocateFixed size={17} aria-hidden="true" />
              {online || data?.profile?.is_online ? "Go offline" : "Go online"}
            </Button>
          )}
        </div>
        {(!phone ||
          ["disconnected", "unknown"].includes(presenceState)) && (
          <p
            role="status"
            aria-label="Rider availability"
            className={`rider-presence-state rider-offers-status${active ? " is-online" : " is-paused"}`}
          >
            {!connected
              ? "Connection lost · new offers are paused"
              : statusUnavailable
                ? "Unable to check availability. We’ll retry automatically."
                : !data
                  ? "Checking your availability…"
                  : active
                    ? "Online · location is up to date"
                    : online || data?.profile?.is_online
                      ? "Select Reconnect GPS in the availability controls to resume updates."
                      : "Offline · new offers are paused"}
          </p>
        )}
        {data?.enabled === false && (
          <p>
            Automatic search is currently disabled. Staff can still assign
            deliveries.
          </p>
        )}
        {(error || loadError) && <DispatchError message={error || loadError} />}
        {phone ? (
          showHelp && (
            <p id="offers-help-note" className="offers-help-note">
              Going online shares your location for offers and accepted
              deliveries. After pickup, the GPS trail is saved with that
              delivery.
            </p>
          )
        ) : (
          <details className="offers-help">
            <summary>GPS & privacy</summary>
            <p>
              Going online shares your location for offers and accepted
              deliveries. After pickup, the GPS trail is saved with that
              delivery. Keep this page open and save your vehicle details in
              Settings.
            </p>
          </details>
        )}
        {(!phone ||
          feed.visible.length > 0 ||
          queuedOffers.length > 0 ||
          inactiveCount > 0) && (
          <div
            className="offers-update-bar"
            data-has-updates={
              queuedOffers.length || inactiveCount ? "true" : undefined
            }
          >
            <span role="status" aria-label="Offer updates">
              {queuedOffers.length
                ? `${queuedOffers.length} new offer${queuedOffers.length === 1 ? "" : "s"} available`
                : inactiveCount
                  ? "Some offers have ended. Refresh the list when you're ready."
                  : "Live updates · cards stay in place while you browse"}
            </span>
            <Button
              variant="secondary"
              disabled={busy || (!queuedOffers.length && !inactiveCount)}
              onClick={() =>
                setFeed((previous) =>
                  showOfferUpdates(previous, Date.now() + offset.current),
                )
              }
            >
              {queuedOffers.length ? "Show new offers" : "Refresh list"}
            </Button>
          </div>
        )}
        {!data && !loadError && (
          <RiderScreenSkeleton
            variant="offers"
            label="Loading delivery offers"
          />
        )}
        {feed.visible.map((offer) => {
          const expired = new Date(offer.expires_at).getTime() <= serverNow;
          const pending = offer.feedStatus === "responding";
          const unavailable =
            !pending && (expired || offer.feedStatus !== "available");
          const remainingMs = Math.max(
            0,
            new Date(offer.expires_at).getTime() - now - offset.current,
          );
          if (!offerWindows.current.has(offer.id))
            offerWindows.current.set(offer.id, Math.max(remainingMs, 1));
          const remainingShare = Math.min(
            1,
            remainingMs / offerWindows.current.get(offer.id),
          );
          const stateLabel = pending
            ? "Processing…"
            : offer.feedStatus === "accepted"
              ? "Accepted"
              : offer.feedStatus === "declined"
                ? "Declined"
                : expired
                  ? "Expired"
                  : "Unavailable";
          return (
            <article
              className={`dispatch-offer-card${unavailable ? " is-ended" : ""}`}
              key={offer.id}
              aria-label={`Delivery offer ${offer.order_number}`}
            >
              <div className="rider-dispatch-heading">
                <strong>Order {offer.order_number}</strong>
                <span className="dispatch-countdown">
                  <Clock size={16} aria-hidden="true" />
                  {offer.preview_only ? (
                    "Preview only"
                  ) : unavailable || pending ? (
                    stateLabel
                  ) : (
                    <>
                      {Math.max(
                        0,
                        Math.ceil(
                          (new Date(offer.expires_at).getTime() -
                            now -
                            offset.current) /
                            1000,
                        ),
                      )}
                      s to respond
                    </>
                  )}
                </span>
              </div>
              {!offer.preview_only && !unavailable && !pending && (
                <span
                  className="dispatch-countdown-bar"
                  aria-hidden="true"
                  data-urgent={remainingMs <= 10000 || undefined}
                  style={{ "--offer-left": remainingShare }}
                />
              )}
              <ol className="dispatch-offer-route" aria-label="Offer route">
                <li>
                  <span
                    className="dispatch-offer-stop-marker"
                    aria-hidden="true"
                  />
                  <div>
                    <span className="dispatch-offer-stop-label">Pickup</span>
                    <strong>{offer.pickup}</strong>
                    <small>About {offer.eta_minutes} min away</small>
                  </div>
                </li>
                <li>
                  <span
                    className="dispatch-offer-stop-marker"
                    aria-hidden="true"
                  />
                  <div>
                    <span className="dispatch-offer-stop-label">Drop-off</span>
                    <strong>{offer.destination}</strong>
                  </div>
                </li>
              </ol>
              {offer.batched && (
                <p className="dispatch-offer-batch-note">
                  This offer includes a second compatible order.
                </p>
              )}
              {offer.preview_only && (
                <p className="dispatch-offer-preview-note">
                  Sample offer for layout preview. This is not a real delivery.
                </p>
              )}
              <div className="rider-offer-actions">
                <Button
                  busy={respondingId === offer.id}
                  disabled={busy || unavailable || offer.preview_only}
                  onClick={() => respond(offer, "accept")}
                >
                  {offer.feedStatus === "accepted"
                    ? "Accepted"
                    : "Accept delivery offer"}
                </Button>
                {offer.feedStatus === "accepted" ? (
                  <Link
                    className="offer-view-deliveries"
                    to="/rider/deliveries"
                  >
                    View my deliveries
                  </Link>
                ) : (
                  <Button
                    variant="secondary"
                    disabled={busy || unavailable || offer.preview_only}
                    onClick={() => respond(offer, "reject")}
                  >
                    Decline offer
                  </Button>
                )}
              </div>
            </article>
          );
        })}
        {data && !feed.visible.length && !phone && (
          <div
            className={`offers-empty${!active ? " offers-empty-paused" : ""}`}
          >
            <span className="offers-empty-icon">
              {active ? (
                <VehicleIcon type={data.profile?.vehicle_type} size={30} />
              ) : (
                <WifiOff size={30} aria-hidden="true" />
              )}
            </span>
            <h3>
              {active
                ? "Looking for nearby pickups"
                : !connected
                  ? "You're disconnected"
                  : statusUnavailable
                    ? "Availability is unavailable"
                    : !data
                      ? "Checking your availability"
                      : online || data?.profile?.is_online
                        ? "Reconnect your location"
                        : "You're offline"}
            </h3>
            <p>
              {active
                ? "You're online. New delivery offers will appear here automatically."
                : !connected
                  ? "Reconnect to the internet to receive delivery offers."
                  : online || data?.profile?.is_online
                    ? "Select Reconnect GPS in the availability controls to resume location updates."
                    : "Go online and allow location access to receive nearby delivery offers."}
            </p>
            <span className="offers-auto-chip">
              <Radio size={14} aria-hidden="true" />
              {active ? "Live search" : "Go online to start"}
            </span>
            {import.meta.env.DEV && !previewOffersEnabled.current && (
              <Button variant="secondary" onClick={addPreviewOffers}>
                Preview sample offers
              </Button>
            )}
          </div>
        )}
        {data && !feed.visible.length && phone && (
          <>
            <div
              className="offers-empty-phone"
              data-searching={active || undefined}
            >
              <div className="offers-empty-head">
                <span className="offers-empty-icon">
                  {active ? (
                    <VehicleIcon type={data.profile?.vehicle_type} size={24} />
                  ) : (
                    <WifiOff size={24} aria-hidden="true" />
                  )}
                </span>
                <div>
                  <h3>
                    {active
                      ? "Looking for nearby pickups"
                      : !connected
                        ? "You're disconnected"
                        : online || data?.profile?.is_online
                          ? "Reconnect your location"
                          : "You're offline"}
                  </h3>
                  <p>
                    {active
                      ? [
                          `Searching within ${data.search_radius_km || 3} km`,
                          checkedAgo(data.profile?.located_at, serverNow),
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : online || data?.profile?.is_online
                        ? "Your location stopped updating."
                        : "Check these, then go online for offers."}
                  </p>
                </div>
              </div>
              {!active && !(online || data?.profile?.is_online) && (
                <OffersReadiness
                  vehicle={data.profile?.vehicle_type}
                  location={locationPermission}
                  connected={connected}
                />
              )}
              {!active && (
                <div className="offers-empty-actions">
                  <Button
                    onClick={() =>
                      toggle(!!(online || data?.profile?.is_online))
                    }
                    busy={busy}
                    disabled={!connected || statusUnavailable}
                  >
                    <Power size={17} aria-hidden="true" />
                    {online || data?.profile?.is_online
                      ? "Reconnect GPS"
                      : "Go online"}
                  </Button>
                </div>
              )}
              {import.meta.env.DEV && !previewOffersEnabled.current && (
                <button
                  type="button"
                  className="offers-preview-link"
                  onClick={addPreviewOffers}
                >
                  Preview sample offers
                </button>
              )}
            </div>
            <OffersWaitingMap
              rider={data.profile}
              radiusKm={data.search_radius_km || 3}
              searching={active}
            />
          </>
        )}
      </section>
    </>
  );
}
