// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "./api";
import {
  privateEcho,
  subscribeToOperations,
  subscribeToRestaurantLocation,
} from "./realtime";

const socket = vi.hoisted(() => ({
  options: null,
  changed: null,
  publicChannel: null,
  leave: vi.fn(),
  disconnect: vi.fn(),
}));
vi.mock("./api", () => ({ api: vi.fn() }));
vi.mock("laravel-echo", () => ({
  default: class {
    constructor(options) {
      socket.options = options;
    }
    private() {
      return {
        listen: (_name, changed) => {
          socket.changed = changed;
        },
      };
    }
    channel(name) {
      socket.publicChannel = name;
      return {
        listen: (_event, changed) => {
          socket.changed = changed;
        },
      };
    }
    leave(...args) {
      socket.leave(...args);
    }
    disconnect() {
      socket.disconnect();
    }
  },
}));
beforeEach(() => {
  vi.stubEnv("VITE_REVERB_APP_KEY", "test-public-key");
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

it("authorizes private subscriptions through the credentialed API client instead of unauthenticated cross-origin XHR", async () => {
  api.mockResolvedValue({ auth: "test-authorization" });
  privateEcho();
  const callback = vi.fn();
  socket.options.channelAuthorization.customHandler(
    { socketId: "123.456", channelName: "private-admin.operations" },
    callback,
  );
  await vi.waitFor(() =>
    expect(callback).toHaveBeenCalledWith(null, { auth: "test-authorization" }),
  );
  expect(api).toHaveBeenCalledWith("/broadcasting/auth", {
    method: "POST",
    body: JSON.stringify({
      socket_id: "123.456",
      channel_name: "private-admin.operations",
    }),
  });
});
it("coalesces rapid live events, pauses hidden tabs and cleans up subscriptions", () => {
  const refresh = vi.fn();
  const stop = subscribeToOperations(refresh);
  socket.changed();
  socket.changed();
  socket.changed();
  vi.advanceTimersByTime(150);
  expect(refresh).toHaveBeenCalledOnce();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  socket.changed();
  vi.advanceTimersByTime(150);
  expect(refresh).toHaveBeenCalledOnce();
  stop();
  expect(socket.leave).toHaveBeenCalledWith("admin.operations");
  expect(socket.disconnect).toHaveBeenCalledOnce();
});

it("refreshes public restaurant details without subscribing to private fleet locations", () => {
  const refresh = vi.fn();
  const stop = subscribeToRestaurantLocation(refresh);
  expect(socket.publicChannel).toBe("restaurant.location");
  socket.changed();
  vi.advanceTimersByTime(150);
  expect(refresh).toHaveBeenCalledOnce();
  expect(api).not.toHaveBeenCalled();
  stop();
  expect(socket.leave).toHaveBeenCalledWith("restaurant.location");
});
