import { useEffect, useLayoutEffect, useState } from "react";
import { api } from "../api";
import { adminBrandTheme } from "./brandTheme";

const STORAGE_KEY = "dineflow:brand-color";

function savedColor() {
  try {
    return localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

/**
 * The restaurant's colour on the signed-out pages (front page, sign in,
 * password recovery). The last colour seen paints first, so a returning
 * visitor doesn't see the default green flash.
 */
export function usePublicBrand(active, theme) {
  const [color, setColor] = useState(savedColor);
  useEffect(() => {
    if (!active) return undefined;
    const controller = new AbortController();
    api("/restaurant/branding", { signal: controller.signal })
      .then((result) => {
        const next = result.data?.brand_color || "";
        setColor(next);
        try {
          localStorage.setItem(STORAGE_KEY, next);
        } catch {
          /* Only a first-paint convenience. */
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [active]);
  useLayoutEffect(() => {
    const root = document.querySelector(".dineflow-app");
    if (!active || !root || !/^#[0-9a-f]{6}$/i.test(color)) return undefined;
    const vars = Object.entries(adminBrandTheme(color, theme));
    vars.forEach(([name, value]) => root.style.setProperty(name, value));
    return () => vars.forEach(([name]) => root.style.removeProperty(name));
  }, [active, color, theme]);
}
