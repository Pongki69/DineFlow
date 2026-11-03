import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronsRight, LoaderCircle } from "lucide-react";
import { Button } from "./ui";
import { useMediaQuery } from "./useMediaQuery";

const CONFIRM_RATIO = 0.85;

// Touch screens get a slide-to-confirm track so a pocket tap cannot pick up
// or complete an order. Mouse users keep a normal button. Keyboard and
// assistive-technology activation (a click with no pointer gesture) still
// confirms, so the control never depends on dragging alone.
export function SwipeToConfirm({
  children,
  onConfirm,
  disabled = false,
  busy = false,
  className = "",
}) {
  const coarse = useMediaQuery("(pointer: coarse)");
  const hintId = useId();
  const trackRef = useRef(null);
  const drag = useRef(null);
  const gesture = useRef(false);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [nudge, setNudge] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const locked = disabled || busy;

  useEffect(() => {
    if (busy) return;
    // Hold the confirmed state briefly so the rider sees it land, then reset
    // (an action that never goes busy would otherwise leave the thumb stuck).
    const timer = window.setTimeout(
      () => {
        setOffset(0);
        setConfirmed(false);
      },
      confirmed ? 700 : 0,
    );
    return () => window.clearTimeout(timer);
  }, [busy, confirmed]);

  if (!coarse)
    return (
      <Button
        className={className}
        busy={busy}
        disabled={disabled}
        onClick={onConfirm}
      >
        {children}
      </Button>
    );

  const maxOffset = () => {
    const track = trackRef.current;
    if (!track) return 0;
    const thumb = track.querySelector(".df-swipe-thumb");
    return Math.max(0, track.clientWidth - (thumb?.offsetWidth || 0) - 8);
  };

  return (
    <button
      ref={trackRef}
      type="button"
      className={`df-swipe ${className}`.trim()}
      data-dragging={dragging || undefined}
      data-nudge={nudge || undefined}
      data-confirmed={confirmed || undefined}
      disabled={locked}
      aria-busy={busy || undefined}
      aria-describedby={hintId}
      onPointerDown={(event) => {
        gesture.current = true;
        if (locked) return;
        drag.current = { startX: event.clientX, max: maxOffset() };
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setDragging(true);
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        const { startX, max } = drag.current;
        setOffset(Math.min(max, Math.max(0, event.clientX - startX)));
      }}
      onPointerUp={(event) => {
        if (!drag.current) return;
        const { startX, max } = drag.current;
        drag.current = null;
        setDragging(false);
        const travelled = event.clientX - startX;
        if (max > 0 && travelled >= max * CONFIRM_RATIO) {
          setOffset(max);
          setConfirmed(true);
          onConfirm?.();
        } else {
          setOffset(0);
          if (Math.abs(travelled) < 6) {
            setNudge(true);
            window.setTimeout(() => setNudge(false), 600);
          }
        }
      }}
      onPointerCancel={() => {
        drag.current = null;
        setDragging(false);
        setOffset(0);
      }}
      onClick={() => {
        if (gesture.current) {
          gesture.current = false;
          return;
        }
        if (!locked) onConfirm?.();
      }}
    >
      <span
        className="df-swipe-fill"
        style={{ inlineSize: `calc(${offset}px + var(--df-swipe-thumb))` }}
        aria-hidden="true"
      />
      <span
        className="df-swipe-thumb"
        style={{ transform: `translateX(${offset}px)` }}
        aria-hidden="true"
      >
        {busy ? (
          <LoaderCircle size={22} className="spin" />
        ) : confirmed ? (
          <Check size={24} strokeWidth={2.5} />
        ) : (
          <ChevronsRight size={24} strokeWidth={2} />
        )}
      </span>
      <span className="df-swipe-label">{children}</span>
      <span id={hintId} className="df-swipe-hint" aria-hidden="true">
        {busy ? "Saving…" : "Slide to confirm"}
      </span>
    </button>
  );
}
