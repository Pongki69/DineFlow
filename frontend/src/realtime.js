import Echo from "laravel-echo";
import Pusher from "pusher-js";
import { api } from "./api";

export function privateEcho() {
  const key = import.meta.env.VITE_REVERB_APP_KEY;
  if (!key) return null;
  window.Pusher = Pusher;
  return new Echo({
    broadcaster: "reverb",
    key,
    wsHost: import.meta.env.VITE_REVERB_HOST || window.location.hostname,
    wsPort: Number(import.meta.env.VITE_REVERB_PORT || 8080),
    wssPort: Number(import.meta.env.VITE_REVERB_PORT || 443),
    forceTLS: (import.meta.env.VITE_REVERB_SCHEME || "http") === "https",
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
  let echo;
  try {
    echo = privateEcho();
    echo?.private("floor-plan").listen(".floor.updated", refresh);
  } catch {
    echo?.disconnect();
  }
  return () => {
    echo?.leave("floor-plan");
    echo?.disconnect();
  };
}

function subscribeToChanges(channel, event, refresh, isPrivate) {
  let echo, timer;
  const changed = () => {
    if (document.visibilityState === "hidden" || timer) return;
    timer = setTimeout(() => {
      timer = null;
      if (document.visibilityState !== "hidden") refresh();
    }, 150);
  };
  try {
    echo = privateEcho();
    const subscription = isPrivate
      ? echo?.private(channel)
      : echo?.channel(channel);
    subscription?.listen(event, changed);
  } catch {
    echo?.disconnect();
  }
  return () => {
    clearTimeout(timer);
    echo?.leave(channel);
    echo?.disconnect();
  };
}

export function subscribeToOperations(refresh) {
  return subscribeToChanges(
    "admin.operations",
    ".operations.updated",
    refresh,
    true,
  );
}

export function subscribeToRestaurantLocation(refresh) {
  return subscribeToChanges(
    "restaurant.location",
    ".restaurant.location.updated",
    refresh,
    false,
  );
}
