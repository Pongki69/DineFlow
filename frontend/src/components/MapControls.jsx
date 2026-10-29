import { useEffect, useRef, useState } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { LocateFixed, Maximize2, Minimize2 } from "lucide-react";
import "./mapControls.css";

export function useMapFullscreen(target, enabled = true) {
  const button = useRef(null);
  const pending = useRef(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!target || !enabled) return;
    const changed = () => {
      if (document.fullscreenElement === target) setExpanded(true);
      else if (document.fullscreenElement == null) setExpanded(false);
    };
    document.addEventListener("fullscreenchange", changed);
    return () => {
      document.removeEventListener("fullscreenchange", changed);
      if (document.fullscreenElement === target)
        document.exitFullscreen?.().catch(() => {});
    };
  }, [target, enabled]);

  useEffect(() => {
    if (!expanded || !target || !enabled) return;
    const placeholder = document.createElement("div");
    placeholder.style.height = `${target.getBoundingClientRect().height}px`;
    placeholder.setAttribute("aria-hidden", "true");
    target.before(placeholder);
    const siblings = [],
      ancestors = [];
    for (
      let parent = target;
      parent?.parentElement && parent !== document.body;
      parent = parent.parentElement
    ) {
      if (parent.parentElement !== document.body) {
        ancestors.push(parent.parentElement);
        parent.parentElement.classList.add("dineflow-map-expanded-ancestor");
      }
      for (const sibling of parent.parentElement.children) {
        if (sibling !== parent && !sibling.inert) {
          sibling.inert = true;
          siblings.push(sibling);
        }
      }
    }
    const previousOverflow = document.body.style.overflow;
    const page = document.documentElement;
    const previousPageOverflow = page.style.overflow;
    const previousGutter = page.style.scrollbarGutter;
    const previousRole = target.getAttribute("role");
    const previousLabel = target.getAttribute("aria-label");
    target.classList.add("dineflow-map--fullscreen");
    target.setAttribute("role", "dialog");
    target.setAttribute("aria-modal", "true");
    target.setAttribute("aria-label", "Fullscreen map");
    document.body.style.overflow = "hidden";
    page.style.overflow = "hidden";
    page.style.scrollbarGutter = "auto";
    button.current?.focus({ preventScroll: true });
    function keydown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (document.fullscreenElement === target)
          document.exitFullscreen?.().catch(() => {});
        setExpanded(false);
      } else if (event.key === "Tab") {
        const controls = [
          ...target.querySelectorAll(
            'button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
          ),
        ].filter((control) => control.getClientRects().length);
        const first = controls[0],
          last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
    target.addEventListener("keydown", keydown);
    return () => {
      target.removeEventListener("keydown", keydown);
      target.classList.remove("dineflow-map--fullscreen");
      target.removeAttribute("aria-modal");
      for (const [attribute, value] of [
        ["role", previousRole],
        ["aria-label", previousLabel],
      ]) {
        if (value == null) target.removeAttribute(attribute);
        else target.setAttribute(attribute, value);
      }
      placeholder.remove();
      siblings.forEach((sibling) => {
        sibling.inert = false;
      });
      ancestors.forEach((ancestor) =>
        ancestor.classList.remove("dineflow-map-expanded-ancestor"),
      );
      document.body.style.overflow = previousOverflow;
      page.style.overflow = previousPageOverflow;
      page.style.scrollbarGutter = previousGutter;
      button.current?.focus({ preventScroll: true });
    };
  }, [expanded, target, enabled]);

  async function toggle() {
    if (!target || pending.current) return;
    pending.current = true;
    try {
      if (expanded) {
        if (document.fullscreenElement === target)
          await document.exitFullscreen();
        setExpanded(false);
      } else {
        setExpanded(true);
        try {
          await target.requestFullscreen?.();
        } catch {
          /* Use the viewport overlay when native fullscreen is unavailable. */
        }
      }
    } finally {
      pending.current = false;
    }
  }
  return { button, expanded, toggle };
}

// Shared map chrome; callers retain ownership of their pins, routes and fit behavior.
export function MapControls({
  center,
  zoom = 16,
  bounds,
  onRecenter,
  recenterLabel = "Recenter map",
  fullscreen,
}) {
  const map = useMap();
  const target = map.getContainer?.();
  const internal = useMapFullscreen(target, !fullscreen);
  const view = fullscreen || internal;
  useEffect(() => {
    if (!target) return;
    target.classList.add("dineflow-map");
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => map.invalidateSize())
        : null;
    observer?.observe(target);
    return () => {
      observer?.disconnect();
      target.classList.remove("dineflow-map");
    };
  }, [map, target]);
  function recenter() {
    if (onRecenter) onRecenter(map);
    else if (bounds?.length)
      map.fitBounds(bounds, { padding: [45, 45], maxZoom: zoom });
    else if (center) map.setView(center, zoom);
  }
  return (
    <MapActionButtons
      fullscreen={view}
      onRecenter={recenter}
      recenterLabel={recenterLabel}
    />
  );
}

export function MapActionButtons({
  fullscreen: view,
  onRecenter,
  recenterLabel = "Recenter map",
}) {
  const controls = useRef(null);
  useEffect(() => {
    if (!controls.current) return;
    L.DomEvent.disableClickPropagation(controls.current);
    L.DomEvent.disableScrollPropagation(controls.current);
  }, []);
  return (
    <div className="dineflow-map-actions" ref={controls}>
      <button
        ref={view.button}
        type="button"
        aria-label={
          view.expanded ? "Exit fullscreen map" : "Enter fullscreen map"
        }
        title={
          view.expanded ? "Exit fullscreen map (Esc)" : "Enter fullscreen map"
        }
        aria-expanded={view.expanded}
        onClick={view.toggle}
      >
        {view.expanded ? (
          <Minimize2 size={19} aria-hidden="true" />
        ) : (
          <Maximize2 size={19} aria-hidden="true" />
        )}
      </button>
      <button
        type="button"
        aria-label={recenterLabel}
        title={recenterLabel}
        onClick={onRecenter}
      >
        <LocateFixed size={19} aria-hidden="true" />
      </button>
    </div>
  );
}
