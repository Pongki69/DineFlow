import { useCallback, useEffect, useRef, useState } from "react";
import {
  enqueueLiveRefresh,
  liveRequestContext,
  runLiveRequest,
  subscribeToLiveChanges,
} from "../liveUpdates";

// A single request per resource; refresh failures retain the last usable data.
export function usePollingResource(
  loader,
  {
    eventName,
    resourceKey,
    enabled = true,
    pauseWhenHidden = true,
    topics,
  } = {},
) {
  const load = useRef(loader);
  load.current = loader;
  const active = useRef(null);
  const mounted = useRef(false);
  const [state, setState] = useState({
    data: null,
    dataKey: resourceKey,
    error: "",
    loading: enabled,
    refreshing: false,
    updatedAt: null,
  });
  const refresh = useCallback(
    ({ live = false } = {}) => {
      const context = live ? liveRequestContext() : null;
      if (!mounted.current || !enabled) return Promise.resolve(null);
      if (active.current) return active.current.promise;
      const controller = new AbortController();
      const request = { controller, promise: null };
      active.current = request;
      setState((current) =>
        current.dataKey === resourceKey
          ? { ...current, refreshing: true }
          : {
              data: null,
              dataKey: resourceKey,
              error: "",
              loading: true,
              refreshing: true,
              updatedAt: null,
            },
      );
      request.promise = Promise.resolve()
        .then(() =>
          live
            ? runLiveRequest(
                () => load.current({ signal: controller.signal }),
                { manual: context?.manual },
              )
            : load.current({ signal: controller.signal }),
        )
        .then((data) => {
          if (!controller.signal.aborted && mounted.current) {
            setState({
              data,
              dataKey: resourceKey,
              error: "",
              loading: false,
              refreshing: false,
              updatedAt: new Date(),
            });
          }
          return controller.signal.aborted ? null : data;
        })
        .catch((error) => {
          if (!controller.signal.aborted && mounted.current) {
            setState((current) => ({
              ...current,
              error: error.message || "Updates are unavailable. Try again.",
              loading: false,
              refreshing: false,
            }));
          }
          return null;
        })
        .finally(() => {
          if (active.current === request) active.current = null;
        });
      return request.promise;
    },
    [enabled, resourceKey],
  );

  useEffect(() => {
    mounted.current = true;
    if (!enabled)
      setState((current) => ({
        ...current,
        loading: false,
        refreshing: false,
      }));
    const backgroundRefresh = () => {
      if (!pauseWhenHidden || document.visibilityState !== "hidden") refresh();
    };
    backgroundRefresh();
    const liveRefresh = () => refresh({ live: true });
    const unsubscribe = enabled
      ? subscribeToLiveChanges(liveRefresh, topics)
      : () => {};
    const visible = () => {
      if (document.visibilityState !== "hidden")
        enqueueLiveRefresh(liveRefresh);
    };
    document.addEventListener("visibilitychange", visible);
    const eventRefresh = () => enqueueLiveRefresh(liveRefresh);
    if (eventName) window.addEventListener(eventName, eventRefresh);
    return () => {
      mounted.current = false;
      unsubscribe();
      document.removeEventListener("visibilitychange", visible);
      if (eventName) window.removeEventListener(eventName, eventRefresh);
      active.current?.controller.abort();
      active.current = null;
    };
  }, [
    refresh,
    eventName,
    enabled,
    pauseWhenHidden,
    resourceKey,
    JSON.stringify(topics),
  ]);

  return {
    ...state,
    ...(state.dataKey !== resourceKey
      ? { data: null, error: "", loading: enabled, updatedAt: null }
      : {}),
    refresh,
  };
}
