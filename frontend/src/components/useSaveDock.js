import { useEffect, useState } from "react";

// Keep unchanged forms unobstructed; acknowledge a successful save briefly.
export function useSaveDock(state) {
  const [recent, setRecent] = useState(false);
  useEffect(() => {
    if (!["saved", "discarded"].includes(state)) {
      setRecent(false);
      return;
    }
    setRecent(true);
    const timer = setTimeout(() => setRecent(false), 3500);
    return () => clearTimeout(timer);
  }, [state]);
  return ["dirty", "unsaved", "saving", "error"].includes(state) || recent;
}
