import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Clock, LocateFixed, Bike, Radio, WifiOff } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { privateEcho } from "../realtime";
import { Button, Feedback } from "./ui";
import "./riderDispatch.css";
import { liveOffers, receiveOffers, showOfferUpdates } from "./offerFeed";
import { updateRiderPresence } from "./riderPresence";
import { subscribeRiderLocation } from "./riderLocationSession";

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
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(false);
  const [connected, setConnected] = useState(navigator.onLine !== false);
  const [statusUnavailable, setStatusUnavailable] = useState(false);
  const [now, setNow] = useState(Date.now());
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
      setData(result);
      setFeed((previous) =>
        receiveOffers(
          previous,
          result.offers,
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
    const poll = setInterval(() => {
        if (document.visibilityState !== "hidden") load();
      }, 5000),
      countdown = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive.current = false;
      enabled.current = false;
      clearInterval(poll);
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
        load();
        latest.current.onAccepted?.();
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
    if (!navigator.geolocation) {
      setError(
        "Your browser cannot share location. Use a supported browser with location services enabled.",
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
            ? "Location permission denied. Allow location access to receive nearby delivery offers."
            : "Location unavailable. Enable GPS and select Go online again. Offers pause when your location becomes stale.",
        );
      },
    );
  }
  async function respond(offer, response) {
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
  if (compact) {
    if (headerOnly)
      return (
        <>
          {headerStatus}
          {(error || loadError) && <Feedback>{error || loadError}</Feedback>}
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
          {(error || loadError) && <Feedback>{error || loadError}</Feedback>}
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
            <p className="offers-subtitle">
              Pick up nearby. Deliver with confidence.
            </p>
          </div>
          <Button
            onClick={() => toggle()}
            busy={busy}
            disabled={!connected || statusUnavailable || !data}
            variant={online ? "secondary" : "primary"}
          >
            <LocateFixed size={17} aria-hidden="true" />
            {online || data?.profile?.is_online ? "Go offline" : "Go online"}
          </Button>
        </div>
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
        {data?.enabled === false && (
          <p>
            Automatic search is currently disabled. Staff can still assign
            deliveries.
          </p>
        )}
        {(error || loadError) && <Feedback>{error || loadError}</Feedback>}
        <details className="offers-help">
          <summary>GPS & privacy</summary>
          <p>
            Going online shares your location for offers and accepted
            deliveries. After pickup, the GPS trail is saved with that delivery.
            Keep this page open and save your vehicle details in Settings.
          </p>
        </details>
        <div className="offers-update-bar">
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
        {feed.visible.map((offer) => {
          const expired = new Date(offer.expires_at).getTime() <= serverNow;
          const pending = offer.feedStatus === "responding";
          const unavailable =
            !pending && (expired || offer.feedStatus !== "available");
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
                  {unavailable || pending ? (
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
              <p>
                <strong>Pickup:</strong> {offer.pickup}
              </p>
              <p>
                <strong>Drop-off:</strong> {offer.destination}
              </p>
              <p>
                About {offer.eta_minutes} min to pickup
                {offer.batched
                  ? " · Adds a second compatible order to your pickup route"
                  : ""}
                .
              </p>
              <div className="rider-offer-actions">
                <Button
                  busy={respondingId === offer.id}
                  disabled={busy || unavailable}
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
                    disabled={busy || unavailable}
                    onClick={() => respond(offer, "reject")}
                  >
                    Decline offer
                  </Button>
                )}
              </div>
            </article>
          );
        })}
        {data && !feed.visible.length && (
          <div
            className={`offers-empty${!active ? " offers-empty-paused" : ""}`}
          >
            <span className="offers-empty-icon">
              {active ? (
                <Bike size={30} aria-hidden="true" />
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
          </div>
        )}
      </section>
    </>
  );
}
