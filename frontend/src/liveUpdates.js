const listeners = new Set(),
  mapListeners = new Set(),
  stateListeners = new Set(),
  pending = new Map();
let timer,
  pointerDown = false,
  liveDepth = 0,
  interactionVersion = 0,
  manualRequest = false;
let state = { connection: "connecting", pending: 0 };
function publish() {
  state = { ...state, pending: pending.size };
  stateListeners.forEach((listener) => listener());
}
export const getLiveState = () => state;
export function subscribeLiveState(listener) {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}
export function setLiveConnection(connection) {
  state = { ...state, connection };
  publish();
}
export function viewIsBusy() {
  const active = document.activeElement;
  return (
    document.visibilityState === "hidden" ||
    pointerDown ||
    window.scrollY > 32 ||
    active?.matches?.('input, textarea, select, [contenteditable="true"]') ||
    hasOpenEditor()
  );
}
function hasOpenEditor() {
  return [
    ...document.querySelectorAll(
      'dialog[open], [role="dialog"], [data-state="dirty"]',
    ),
  ].some(
    (element) =>
      // A dialog can opt in to live data (the rider's fullscreen map).
      !element.matches("[data-live-updates='allow']") &&
      element.getClientRects().length > 0,
  );
}
export function runLiveRequest(task, { manual = false } = {}) {
  const previous = manualRequest;
  manualRequest = manual;
  liveDepth++;
  try {
    return task();
  } finally {
    liveDepth--;
    manualRequest = previous;
  }
}
export const isLiveRequest = () => liveDepth > 0;
export const liveRequestContext = () => ({
  version: interactionVersion,
  allowScrolled: window.scrollY > 32,
  manual: manualRequest,
});
function schedule(key, task) {
  pending.set(key, task);
  publish();
  clearTimeout(timer);
  if (!viewIsBusy())
    timer = setTimeout(() => {
      if (!viewIsBusy()) applyLiveUpdates({ automatic: true });
    }, 250);
}
export function enqueueLiveRefresh(refresh) {
  schedule(refresh, refresh);
}
export function applyLiveUpdates({ automatic = false } = {}) {
  // Applying updates is an explicit action when the reader has scrolled down.
  if (
    document.activeElement?.matches?.(
      'input, textarea, select, [contenteditable="true"]',
    ) ||
    hasOpenEditor()
  )
    return;
  clearTimeout(timer);
  const jobs = [...pending.values()];
  pending.clear();
  publish();
  // Settles when every refresh has finished, so callers can show progress.
  return Promise.allSettled(
    jobs.map((job) =>
      Promise.resolve().then(() => runLiveRequest(job, { manual: !automatic })),
    ),
  );
}
export function subscribeToLiveChanges(refresh, topics = ["*"]) {
  const listener = { refresh, topics };
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    pending.delete(listener);
    pending.delete(refresh);
    publish();
  };
}
export function notifyLiveChange(topics = ["*"]) {
  for (const listener of mapListeners) {
    if (
      topics.includes("*") ||
      listener.topics.some((topic) => topics.includes(topic))
    )
      listener.schedule();
  }
  for (const listener of listeners) {
    if (
      topics.includes("*") ||
      listener.topics.includes("*") ||
      listener.topics.some((topic) => topics.includes(topic))
    )
      schedule(listener, listener.refresh);
  }
}
// Only map geometry subscribes here. Page lists and forms keep their guarded queue.
export function subscribeToMapChanges(refresh, topics = ["locations"]) {
  let timer;
  const listener = {
    topics,
    schedule: () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        if (document.visibilityState !== "hidden")
          Promise.resolve()
            .then(refresh)
            .catch(() => {});
      }, 120);
    },
  };
  const resume = () => {
    if (document.visibilityState === "visible") listener.schedule();
  };
  mapListeners.add(listener);
  document.addEventListener("visibilitychange", resume);
  return () => {
    clearTimeout(timer);
    mapListeners.delete(listener);
    document.removeEventListener("visibilitychange", resume);
  };
}
export function deferLiveResult(
  value,
  signal,
  context,
  structureChanged = false,
) {
  if (
    (!structureChanged || context?.manual) &&
    (!viewIsBusy() ||
      (context?.allowScrolled &&
        context.version === interactionVersion &&
        !hasOpenEditor() &&
        !document.activeElement?.matches?.(
          'input, textarea, select, [contenteditable="true"]',
        )))
  )
    return Promise.resolve(value);
  return new Promise((resolve, reject) => {
    const key = Symbol("response");
    const abort = () => {
      pending.delete(key);
      publish();
      reject(new DOMException("Request cancelled", "AbortError"));
    };
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      resolve(value);
    };
    if (signal?.aborted) return abort();
    signal?.addEventListener("abort", abort, { once: true });
    pending.set(key, finish);
    publish();
  });
}
export function protectLiveView() {
  const down = () => {
    pointerDown = true;
    interactionVersion++;
    clearTimeout(timer);
  };
  const up = () => {
    pointerDown = false;
  };
  const scroll = () => {
    interactionVersion++;
    clearTimeout(timer);
  };
  const changed = (event) => notifyLiveChange(event.detail?.topics || ["*"]);
  window.addEventListener("pointerdown", down, true);
  window.addEventListener("pointerup", up, true);
  window.addEventListener("pointercancel", up, true);
  window.addEventListener("scroll", scroll, true);
  window.addEventListener("workspace:changed", changed);
  return () => {
    window.removeEventListener("pointerdown", down, true);
    window.removeEventListener("pointerup", up, true);
    window.removeEventListener("pointercancel", up, true);
    window.removeEventListener("scroll", scroll, true);
    window.removeEventListener("workspace:changed", changed);
    clearTimeout(timer);
    pointerDown = false;
  };
}
