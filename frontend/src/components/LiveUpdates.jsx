import { useEffect, useSyncExternalStore } from "react";
import { Radio, RefreshCw } from "lucide-react";
import { initializeRealtime, privateEcho } from "../realtime";
import {
  applyLiveUpdates,
  getLiveState,
  notifyLiveChange,
  protectLiveView,
  setLiveConnection,
  subscribeLiveState,
} from "../liveUpdates";
import "./liveUpdates.css";

// `seamless` (the rider app) applies queued updates by itself once the rider
// stops touching or scrolling, and shows no bar: pull to refresh covers the
// manual case.
export function LiveUpdates({ userId, seamless = false }) {
  const state = useSyncExternalStore(subscribeLiveState, getLiveState);
  useEffect(() => {
    if (!seamless || !state.pending) return;
    let timer;
    let down = false;
    const arm = () => {
      window.clearTimeout(timer);
      if (!down) timer = window.setTimeout(() => applyLiveUpdates(), 600);
    };
    const press = () => {
      down = true;
      window.clearTimeout(timer);
    };
    const release = () => {
      down = false;
      arm();
    };
    arm();
    window.addEventListener("scroll", arm, true);
    window.addEventListener("pointerdown", press, true);
    window.addEventListener("pointerup", release, true);
    window.addEventListener("pointercancel", release, true);
    window.addEventListener("focusout", arm, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", arm, true);
      window.removeEventListener("pointerdown", press, true);
      window.removeEventListener("pointerup", release, true);
      window.removeEventListener("pointercancel", release, true);
      window.removeEventListener("focusout", arm, true);
    };
  }, [seamless, state.pending]);
  useEffect(() => {
    const stopProtection = protectLiveView();
    let active = true,
      echo,
      connection;
    setLiveConnection("connecting");
    initializeRealtime()
      .then(() => {
        if (!active) return;
        echo = privateEcho();
        if (!echo) {
          setLiveConnection("unavailable");
          return;
        }
        connection = echo.connector?.pusher?.connection;
        const connected = () => {
          setLiveConnection("connecting");
        };
        const disconnected = () => setLiveConnection("disconnected");
        connection?.bind("connected", connected);
        connection?.bind("disconnected", disconnected);
        connection?.bind("unavailable", disconnected);
        connection?.bind("failed", disconnected);
        echo
          .private("workspace")
          .listen(".workspace.updated", (event) =>
            notifyLiveChange(event.topics),
          )
          .subscribed(() => {
            setLiveConnection("live");
            notifyLiveChange();
          })
          .error(() => setLiveConnection("disconnected"));
        if (connection?.state === "connected") connected();
        cleanup = () => {
          connection?.unbind("connected", connected);
          connection?.unbind("disconnected", disconnected);
          connection?.unbind("unavailable", disconnected);
          connection?.unbind("failed", disconnected);
        };
      })
      .catch(() => {
        if (active) setLiveConnection("unavailable");
      });
    let cleanup = () => {};
    const online = () => notifyLiveChange();
    window.addEventListener("online", online);
    return () => {
      active = false;
      cleanup();
      stopProtection();
      window.removeEventListener("online", online);
      echo?.disconnect();
    };
  }, [userId]);
  if (seamless) return null;
  return (
    <div
      className="live-updates-bar"
      aria-label="Live updates"
      data-connection={state.connection}
      data-pending={state.pending ? "true" : undefined}
    >
      <span>
        <Radio size={14} aria-hidden="true" />
        {state.connection === "live"
          ? "Live updates"
          : state.connection === "connecting"
            ? "Connecting to live updates…"
            : "Live updates offline"}
      </span>
      <button
        type="button"
        disabled={
          !state.pending && ["live", "connecting"].includes(state.connection)
        }
        onClick={() => {
          if (!state.pending) notifyLiveChange();
          applyLiveUpdates();
        }}
      >
        <RefreshCw size={14} aria-hidden="true" />
        {state.pending
          ? "Apply updates"
          : state.connection === "live"
            ? "Up to date"
            : "Use Refresh"}
      </button>
    </div>
  );
}
