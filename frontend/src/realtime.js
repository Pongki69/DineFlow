import Echo from "laravel-echo";
import Pusher from "pusher-js";
import { api } from "./api";
import { notifyLiveChange, subscribeToLiveChanges } from "./liveUpdates";
let config = null,
  initializing;
const readyListeners = new Set();
export function initializeRealtime() {
  if (!initializing)
    initializing = api("/realtime/config")
      .then((result) => {
        config = result.data;
        readyListeners.forEach((listener) => listener());
      })
      .catch((error) => {
        initializing = null;
        throw error;
      });
  return initializing;
}

export function privateEcho() {
  const key = import.meta.env.VITE_REVERB_APP_KEY || config?.key;
  if (!key) return null;
  window.Pusher = Pusher;
  return new Echo({
    broadcaster: "reverb",
    key,
    wsHost:
      import.meta.env.VITE_REVERB_HOST ||
      config?.host ||
      window.location.hostname,
    wsPort: Number(import.meta.env.VITE_REVERB_PORT || config?.port || 8080),
    wssPort: Number(import.meta.env.VITE_REVERB_PORT || config?.port || 443),
    forceTLS:
      (import.meta.env.VITE_REVERB_SCHEME || config?.scheme || "http") ===
      "https",
    enabledTransports: ["ws", "wss"],
    channelAuthorization: {
      customHandler: ({ socketId, channelName }, callback) => {
        api("/broadcasting/auth", {
          method: "POST",
          body: JSON.stringify({
            socket_id: socketId,
            channel_name: channelName,
          }),
        })
          .then((authorization) => callback(null, authorization))
          .catch((error) => callback(error, null));
      },
    },
  });
}

export function subscribeToFloorChanges(refresh) {
  return subscribeToLiveChanges(refresh, ["floor", "reservations", "settings"]);
}

function subscribeToChanges(channel, event, refresh, isPrivate) {
  let echo,
    disposed = false;
  const stopQueue = subscribeToLiveChanges(refresh, ["public-location"]);
  const changed = () => notifyLiveChange(["public-location"]);
  const connect = () => {
    if (disposed) return;
    if (echo) return;
    try {
      echo = privateEcho();
      const subscription = isPrivate
        ? echo?.private(channel)
        : echo?.channel(channel);
      subscription?.listen(event, changed);
    } catch {
      echo?.disconnect();
    }
  };
  readyListeners.add(connect);
  if (config || import.meta.env.VITE_REVERB_APP_KEY) connect();
  return () => {
    disposed = true;
    readyListeners.delete(connect);
    stopQueue();
    echo?.leave(channel);
    echo?.disconnect();
  };
}

export function subscribeToOperations(refresh) {
  return subscribeToLiveChanges(refresh, [
    "orders",
    "deliveries",
    "locations",
    "settings",
    "accounts",
  ]);
}

export function subscribeToRestaurantLocation(refresh) {
  return subscribeToChanges(
    "restaurant.location",
    ".restaurant.location.updated",
    refresh,
    false,
  );
}
