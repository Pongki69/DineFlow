import Echo from "laravel-echo";
import Pusher from "pusher-js";
import { API_BASE } from "./api";

export function privateEcho() {
  const key = import.meta.env.VITE_REVERB_APP_KEY;
  if (!key) return null;
  window.Pusher = Pusher;
  const xsrf = document.cookie
    .split("; ")
    .find((row) => row.startsWith("XSRF-TOKEN="))
    ?.split("=")
    .slice(1)
    .join("=");
  return new Echo({
    broadcaster: "reverb",
    key,
    wsHost: import.meta.env.VITE_REVERB_HOST || window.location.hostname,
    wsPort: Number(import.meta.env.VITE_REVERB_PORT || 8080),
    wssPort: Number(import.meta.env.VITE_REVERB_PORT || 443),
    forceTLS: (import.meta.env.VITE_REVERB_SCHEME || "http") === "https",
    enabledTransports: ["ws", "wss"],
    channelAuthorization: {
      transport: "ajax",
      endpoint: `${API_BASE}/broadcasting/auth`,
      withCredentials: true,
      headers: {
        Accept: "application/json",
        ...(xsrf ? { "X-XSRF-TOKEN": decodeURIComponent(xsrf) } : {}),
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
