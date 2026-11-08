import { useEffect, useRef } from "react";

/**
 * Lets a mouse drag a horizontally scrolling row left and right (touch and
 * trackpads already scroll it). A drag longer than a few pixels swallows the
 * click that follows, so dragging across a chip does not select it.
 */
export function useDragScroll() {
  const ref = useRef(null);
  useEffect(() => {
    const row = ref.current;
    if (!row) return undefined;
    let startX = 0;
    let startScroll = 0;
    let dragging = false;
    let moved = false;
    const down = (event) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      if (row.scrollWidth <= row.clientWidth) return;
      dragging = true;
      moved = false;
      startX = event.clientX;
      startScroll = row.scrollLeft;
    };
    const move = (event) => {
      if (!dragging) return;
      const distance = event.clientX - startX;
      if (!moved && Math.abs(distance) < 5) return;
      if (!moved) {
        moved = true;
        row.dataset.dragging = "true";
        row.setPointerCapture?.(event.pointerId);
      }
      row.scrollLeft = startScroll - distance;
    };
    const up = () => {
      dragging = false;
      delete row.dataset.dragging;
    };
    const click = (event) => {
      if (!moved) return;
      moved = false;
      event.preventDefault();
      event.stopPropagation();
    };
    row.addEventListener("pointerdown", down);
    row.addEventListener("pointermove", move);
    row.addEventListener("pointerup", up);
    row.addEventListener("pointercancel", up);
    row.addEventListener("click", click, true);
    return () => {
      row.removeEventListener("pointerdown", down);
      row.removeEventListener("pointermove", move);
      row.removeEventListener("pointerup", up);
      row.removeEventListener("pointercancel", up);
      row.removeEventListener("click", click, true);
    };
  }, []);
  return ref;
}
