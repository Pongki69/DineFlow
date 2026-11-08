import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronRight, GripVertical } from "lucide-react";
import { Button } from "./ui";
import { DeliveryStatusPill } from "./OrderStatusPill";

const HOLD_MS = 220;
const SCROLL_SLOP = 8;
const MOUSE_SLOP = 5;

// While a row is held, the page must not scroll under the finger. These live
// outside the component so removal always matches the listener that was
// added (a per-render copy never would, and scrolling stayed blocked).
function blockScroll(event) {
  event.preventDefault();
}
function stopBlockingScroll() {
  document.removeEventListener("touchmove", blockScroll);
}

// The rider's stop list, shared by the Stops panel and fullscreen. A whole row
// is draggable: touch needs a short hold (so a swipe still scrolls and a tap
// still opens the delivery), a mouse or the grip drags straight away. The grip
// also takes the arrow keys. Other rows slide into place as the order changes.
export function RiderStopsList({
  deliveries,
  offset = 0,
  selectedId,
  saving = false,
  dirty = false,
  headingId,
  headerExtras = null,
  pagination = null,
  onOpen,
  onMove,
  onSuggest,
  onApply,
  onReset,
}) {
  const list = useRef(null);
  const press = useRef(null);
  const suppressClick = useRef(false);
  const lastTops = useRef(new Map());
  const [dragId, setDragId] = useState(null);
  const orderKey = deliveries.map((delivery) => delivery.id).join(",");

  // Slide the other rows from where they were to where they are now.
  useLayoutEffect(() => {
    const rows = [...(list.current?.querySelectorAll("[data-stop-id]") || [])];
    const previous = lastTops.current;
    const next = new Map();
    for (const row of rows) {
      const id = row.dataset.stopId;
      next.set(id, row.offsetTop);
      const before = previous.get(id);
      if (
        before == null ||
        before === row.offsetTop ||
        id === String(press.current?.id)
      )
        continue;
      row.style.transition = "none";
      row.style.transform = `translateY(${before - row.offsetTop}px)`;
      row.getBoundingClientRect();
      row.style.transition =
        "transform var(--df-motion-duration, 200ms) var(--df-motion-easing, ease)";
      row.style.transform = "";
    }
    lastTops.current = next;
    // The dragged row moved in the list: keep it under the finger.
    if (press.current?.active) follow(press.current);
  }, [orderKey]);

  useEffect(() => () => stopBlockingScroll(), []);

  function follow(current) {
    const offset = current.pointer - current.grab - current.el.offsetTop;
    current.el.style.transform = `translateY(${offset}px)`;
  }

  function activate() {
    const current = press.current;
    if (!current || current.active) return;
    current.active = true;
    current.el.setPointerCapture?.(current.pointerId);
    current.el.style.transition = "none";
    if (current.touch) {
      document.addEventListener("touchmove", blockScroll, { passive: false });
      // However the touch ends, scrolling comes back.
      for (const type of ["touchend", "touchcancel"])
        document.addEventListener(type, stopBlockingScroll, { once: true });
      navigator.vibrate?.(8);
    }
    setDragId(current.id);
  }

  function finish(event) {
    const current = press.current;
    if (!current || event.pointerId !== current.pointerId) return;
    window.clearTimeout(current.timer);
    press.current = null;
    if (!current.active) return;
    stopBlockingScroll();
    // Swallow the click a drag ends with, but only that one: a touch drag
    // often ends without a click, and the next tap must still open the row.
    suppressClick.current = current.moved;
    window.setTimeout(() => (suppressClick.current = false));
    // Settle into the slot it was dropped on.
    current.el.style.transition =
      "transform var(--df-motion-duration, 200ms) var(--df-motion-easing, ease)";
    current.el.style.transform = "";
    setDragId(null);
  }

  function move(event) {
    const current = press.current;
    if (!current || event.pointerId !== current.pointerId) return;
    const dy = event.clientY - current.startY;
    const dx = event.clientX - current.startX;
    if (!current.active) {
      if (current.quick && Math.abs(dy) > MOUSE_SLOP) activate();
      else if (Math.hypot(dx, dy) > SCROLL_SLOP) {
        // Moved before the hold finished: the rider is scrolling.
        window.clearTimeout(current.timer);
        press.current = null;
        return;
      }
      if (!current.active) return;
    }
    current.moved = true;
    current.pointer = event.clientY - list.current.getBoundingClientRect().top;
    follow(current);
    const rows = [...list.current.querySelectorAll("[data-stop-id]")];
    const above = rows.filter(
      (row) =>
        row !== current.el &&
        row.offsetTop + row.offsetHeight / 2 < current.pointer,
    ).length;
    if (above !== current.index) {
      current.index = above;
      onMove?.(current.id, offset + above);
    }
  }

  return (
    <section className="rider-delivery-queue" aria-labelledby={headingId}>
      <header>
        <div>
          <h2 id={headingId}>Your delivery queue</h2>
          <span>{deliveries.length} active</span>
        </div>
        {headerExtras}
        <button
          type="button"
          className="rider-queue-suggest"
          disabled={saving || deliveries.length < 2}
          onClick={onSuggest}
        >
          Suggest stop order
        </button>
      </header>
      <p className="rider-queue-drag-hint">
        Hold and drag a stop to change the order.
      </p>
      <div
        className="rider-delivery-queue-list"
        ref={list}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
        onLostPointerCapture={finish}
        onPointerLeave={(event) => {
          if (!press.current?.active) finish(event);
        }}
      >
        {deliveries.map((delivery, index) => {
          const onRoad = ["picked_up", "in_transit"].includes(delivery.status);
          const address = onRoad
            ? delivery.order.destination?.address
            : delivery.order.pickup?.address;
          const selected =
            selectedId != null && String(selectedId) === String(delivery.id);
          const dragging = dragId === delivery.id;
          return (
            <div
              className="rider-queue-item"
              key={delivery.id}
              data-stop-id={delivery.id}
              data-dragging={dragging || undefined}
              onPointerDown={(event) => {
                if (
                  saving ||
                  press.current ||
                  event.isPrimary === false ||
                  (event.pointerType === "mouse" && event.button)
                )
                  return;
                const row = event.currentTarget;
                const box = list.current.getBoundingClientRect();
                // A mouse, or a finger on the grip, drags at once; elsewhere
                // a finger holds first so the list can still scroll.
                const quick =
                  event.pointerType === "mouse" ||
                  !!event.target.closest(".rider-queue-handle");
                press.current = {
                  id: delivery.id,
                  index,
                  el: row,
                  quick,
                  touch: event.pointerType === "touch",
                  pointerId: event.pointerId,
                  startX: event.clientX,
                  startY: event.clientY,
                  grab: event.clientY - box.top - row.offsetTop,
                  pointer: event.clientY - box.top,
                  active: false,
                  moved: false,
                  timer: quick ? 0 : window.setTimeout(activate, HOLD_MS),
                };
              }}
              onClickCapture={(event) => {
                if (!suppressClick.current) return;
                suppressClick.current = false;
                event.preventDefault();
                event.stopPropagation();
              }}
              onContextMenu={(event) => {
                if (press.current) event.preventDefault();
              }}
            >
              <button
                type="button"
                className="rider-queue-handle"
                aria-label={`Reorder ${delivery.order.order_number}. Drag, or use the arrow keys.`}
                disabled={saving}
                onKeyDown={(event) => {
                  if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
                  event.preventDefault();
                  onMove?.(
                    delivery.id,
                    offset + index + (event.key === "ArrowUp" ? -1 : 1),
                  );
                }}
              >
                <GripVertical size={18} aria-hidden="true" />
              </button>
              <button
                className="rider-delivery-queue-row"
                type="button"
                aria-pressed={selected}
                onClick={() => onOpen?.(delivery)}
              >
                <span className="rider-queue-number">{offset + index + 1}</span>
                <span className="rider-queue-order">
                  <span className="rider-queue-title">
                    <strong>{delivery.order.order_number}</strong>
                    <DeliveryStatusPill status={delivery.status} />
                  </span>
                  <small>
                    <b>{onRoad ? "Drop-off" : "Pickup"}</b> ·{" "}
                    {address || "Stop address not recorded"}
                  </small>
                </span>
                <span className="rider-queue-action">
                  <span className="sr-only">
                    {selected ? "Viewing" : "View"}
                  </span>
                  <ChevronRight size={18} aria-hidden="true" />
                </span>
              </button>
            </div>
          );
        })}
      </div>
      {pagination}
      {dirty && (
        <div className="rider-queue-apply" role="status">
          <span>Stop order changed</span>
          <button
            type="button"
            className="rider-queue-reset"
            disabled={saving}
            onClick={onReset}
          >
            Reset
          </button>
          <Button busy={saving} onClick={onApply}>
            Apply order
          </Button>
        </div>
      )}
    </section>
  );
}
