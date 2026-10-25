import { useCallback, useEffect, useRef, useState } from "react";

// A single request per resource; refresh failures retain the last usable data.
export function usePollingResource(
  loader,
  {
    intervalMs = 15000,
    eventName,
    resourceKey,
    enabled = true,
    pauseWhenHidden = true,
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
  const refresh = useCallback(() => {
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
      .then(() => load.current({ signal: controller.signal }))
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
  }, [enabled, resourceKey]);

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
    const timer =
      enabled && intervalMs > 0
        ? setInterval(backgroundRefresh, intervalMs)
        : null;
    const visible = () => {
      if (document.visibilityState !== "hidden") refresh();
    };
    document.addEventListener("visibilitychange", visible);
    if (eventName) window.addEventListener(eventName, backgroundRefresh);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
      if (eventName) window.removeEventListener(eventName, backgroundRefresh);
      active.current?.controller.abort();
      active.current = null;
    };
  }, [refresh, intervalMs, eventName, enabled, pauseWhenHidden, resourceKey]);

  return {
    ...state,
    ...(state.dataKey !== resourceKey
      ? { data: null, error: "", loading: enabled, updatedAt: null }
      : {}),
    refresh,
  };
}
