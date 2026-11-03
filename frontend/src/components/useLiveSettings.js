import { useCallback, useEffect, useRef } from "react";
import { subscribeToLiveChanges } from "../liveUpdates";

// Remote settings may update a clean form; a draft always belongs to its editor.
export function useLiveSettings(
  loader,
  value,
  setValue,
  topics = ["settings"],
) {
  const latest = useRef(value),
    load = useRef(loader),
    saved = useRef(null);
  latest.current = value;
  load.current = loader;
  const receive = useCallback(
    (next) => {
      const result = typeof next === "function" ? next(latest.current) : next;
      saved.current = JSON.stringify(result);
      setValue(result);
    },
    [setValue],
  );
  const markSaved = useCallback((next) => {
    saved.current = JSON.stringify(next);
  }, []);
  useEffect(() => {
    let mounted = true;
    const stop = subscribeToLiveChanges(async () => {
      const before = saved.current;
      if (before == null || before !== JSON.stringify(latest.current)) return;
      const result = await load.current();
      if (
        mounted &&
        saved.current === before &&
        JSON.stringify(latest.current) === before
      )
        receive(result);
    }, topics);
    return () => {
      mounted = false;
      stop();
    };
  }, [receive, JSON.stringify(topics)]);
  return [receive, markSaved];
}
