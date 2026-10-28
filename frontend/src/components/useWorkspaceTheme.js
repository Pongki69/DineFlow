import { useEffect, useSyncExternalStore } from "react";

let memoryTheme;
const eventName = "dineflow-theme-changed";

function snapshot() {
  if (memoryTheme) return memoryTheme;
  try {
    const saved =
      localStorage.getItem("dineflow-theme") ||
      localStorage.getItem("dineflow-admin-theme");
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    // The selected theme remains usable when browser storage is unavailable.
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function subscribe(listener) {
  const stored = () => {
    memoryTheme = undefined;
    listener();
  };
  window.addEventListener(eventName, listener);
  window.addEventListener("storage", stored);
  return () => {
    window.removeEventListener(eventName, listener);
    window.removeEventListener("storage", stored);
  };
}

function setTheme(value) {
  memoryTheme = value === "dark" ? "dark" : "light";
  try {
    localStorage.setItem("dineflow-theme", memoryTheme);
    localStorage.setItem("dineflow-admin-theme", memoryTheme);
  } catch {
    // A storage failure must not prevent switching contrast themes.
  }
  window.dispatchEvent(new Event(eventName));
}

export function useWorkspaceTheme() {
  const theme = useSyncExternalStore(subscribe, snapshot, () => "light");
  useEffect(() => {
    document.documentElement.style.colorScheme = theme;
  }, [theme]);
  return {
    theme,
    setTheme,
    toggleTheme: () => setTheme(theme === "light" ? "dark" : "light"),
  };
}
