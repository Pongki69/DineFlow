import { useLiveSettings } from "./components/useLiveSettings";
import { subscribeToLiveChanges } from "./liveUpdates";
import { AutoTextarea } from "./components/AutoTextarea";
import { EmptyState, Feedback, Skeleton } from "./components/ui";
import { usePrompt } from "./components/ConfirmProvider";
import { useConfirm } from "./components/ConfirmProvider";
import { bookingTime } from "./bookingTime";
import { subscribeToFloorChanges } from "./realtime";
import { chairPositions, defaultChairLayout } from "./floorPlanGeometry";
import {
  CalendarDays,
  CalendarPlus,
  Copy,
  Hand,
  Maximize2,
  Minimize2,
  RotateCw,
  Trash2,
  Undo2,
  Check,
  Clock3,
  LoaderCircle,
  Table2,
  UsersRound,
  CreditCard,
  Save,
  Settings2,
  RefreshCw,
  Minus,
  Plus,
  X,
  Search,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useMediaQuery } from "./components/useMediaQuery";
import { CustomerScreenSkeleton } from "./components/CustomerScreenSkeleton";
import { playSound } from "./uiSound";
import {
  Fragment,
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "./api";
import "./features/staffSage.css";
import "./features/reservationWorkspace.css";
import "./features/reservationSettings.css";
import "./features/reservationAdmin.css";
import "./features/floorEditorWorkspace.css";
import "./features/serviceTablesPhone.css";
const FloorScene = lazy(() =>
  import("./FloorScene").then((module) => ({ default: module.FloorScene })),
);

const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};
const makeTimeSlots = (policy) => {
  const [oh, om] = policy.open_time.split(":").map(Number);
  const [ch, cm] = policy.close_time.split(":").map(Number);
  const last = ch * 60 + cm - policy.duration_minutes;
  return Array.from({ length: 48 }, (_, i) => i * 30)
    .filter((m) => m >= oh * 60 + om && m <= last)
    .map(
      (m) =>
        `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`,
    );
};

const formatTime12 = (value) => {
  const [hour, minute] = value.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
};

const parseCalendarDate = (value) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
};

const formatBookingDate = (value) =>
  parseCalendarDate(value).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

function ReservationDatePicker({ value, min, onChange }) {
  const [open, setOpen] = useState(false);
  const selectedDate = parseCalendarDate(value);
  const minDate = parseCalendarDate(min);
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1, 12),
  );
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const minMonth = new Date(minDate.getFullYear(), minDate.getMonth(), 1, 12);
  const monthLabel = visibleMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  // Escape closes the calendar (phones show it as a sheet with a backdrop).
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function chooseDay(day) {
    const chosen = new Date(year, month, day, 12);
    const nextValue = `${chosen.getFullYear()}-${String(chosen.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    onChange(nextValue);
    setOpen(false);
  }

  return (
    <div className="reservation-date-picker">
      <button
        type="button"
        className="reservation-date-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{formatBookingDate(value)}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div
          className="reservation-date-scrim"
          aria-hidden="true"
          onClick={() => setOpen(false)}
        />
      )}
      {open && (
        <div
          className="reservation-date-popover"
          role="dialog"
          aria-label="Choose reservation date"
        >
          <div className="reservation-date-sheet-head">
            <strong>Choose a date</strong>
            <button
              type="button"
              aria-label="Close calendar"
              onClick={() => setOpen(false)}
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <div className="reservation-calendar-heading">
            <button
              type="button"
              aria-label="Previous month"
              disabled={visibleMonth <= minMonth}
              onClick={() => setVisibleMonth(new Date(year, month - 1, 1, 12))}
            >
              ‹
            </button>
            <strong>{monthLabel}</strong>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setVisibleMonth(new Date(year, month + 1, 1, 12))}
            >
              ›
            </button>
          </div>
          <div
            className="reservation-calendar-grid"
            role="grid"
            aria-label={monthLabel}
          >
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
              <span key={day} className="weekday" role="columnheader">
                {day}
              </span>
            ))}
            {Array.from({ length: firstWeekday }, (_, index) => (
              <span key={`blank-${index}`} aria-hidden="true" />
            ))}
            {Array.from({ length: daysInMonth }, (_, index) => {
              const day = index + 1;
              const date = new Date(year, month, day, 12);
              const isoDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isSelected = isoDate === value;
              return (
                <button
                  key={day}
                  type="button"
                  role="gridcell"
                  aria-pressed={isSelected}
                  className={isSelected ? "is-selected" : ""}
                  disabled={date < minDate}
                  onClick={() => chooseDay(day)}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const isoDay = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const timeGroup = (value) => {
  const hour = Number(value.split(":")[0]);
  return hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
};

// Phones: a strip of days, time chips and a guest stepper instead of the
// desktop dropdowns. The full calendar stays one tap away.
function MobileBookingControls({
  date,
  onDate,
  time,
  onTime,
  timeSlots,
  guests,
  onGuests,
  floors,
  floorId,
  onFloor,
}) {
  const strip = useRef(null);
  const first = parseCalendarDate(tomorrow());
  const days = Array.from({ length: 14 }, (_, index) => {
    const day = new Date(first);
    day.setDate(first.getDate() + index);
    return day;
  });
  const groups = ["Morning", "Afternoon", "Evening"]
    .map((name) => [name, timeSlots.filter((slot) => timeGroup(slot) === name)])
    .filter(([, slots]) => slots.length);
  const count = Number(guests) || 1;
  useEffect(() => {
    strip.current
      ?.querySelector('[aria-checked="true"]')
      ?.scrollIntoView?.({ block: "nearest", inline: "center" });
  }, [date]);
  return (
    <div className="booking-mobile">
      <section className="booking-mobile-block" aria-label="Date">
        <header>
          <span>
            <CalendarDays size={16} aria-hidden="true" />
            Date
          </span>
          <strong>{formatBookingDate(date)}</strong>
        </header>
        <div
          ref={strip}
          className="booking-day-strip"
          role="radiogroup"
          aria-label="Choose a day"
        >
          {days.map((day) => {
            const value = isoDay(day);
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={value === date}
                aria-label={day.toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
                onClick={() => onDate(value)}
              >
                <small>
                  {day.toLocaleDateString("en-US", { weekday: "short" })}
                </small>
                <b>{day.getDate()}</b>
                <small>
                  {day.toLocaleDateString("en-US", { month: "short" })}
                </small>
              </button>
            );
          })}
        </div>
        <div className="booking-more-dates">
          <span>Another date</span>
          <ReservationDatePicker
            value={date}
            min={tomorrow()}
            onChange={onDate}
          />
        </div>
      </section>
      <section className="booking-mobile-block" aria-label="Time">
        <header>
          <span>
            <Clock3 size={16} aria-hidden="true" />
            Time
          </span>
          <strong>{formatTime12(time)}</strong>
        </header>
        {groups.map(([name, slots]) => (
          <div key={name} className="booking-time-group">
            <small>{name}</small>
            <div role="radiogroup" aria-label={`${name} times`}>
              {slots.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  role="radio"
                  aria-checked={slot === time}
                  onClick={() => onTime(slot)}
                >
                  {formatTime12(slot)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>
      <section
        className="booking-mobile-block booking-mobile-row"
        aria-label="Party"
      >
        <span>
          <UsersRound size={16} aria-hidden="true" />
          Guests
        </span>
        <div className="booking-stepper">
          <button
            type="button"
            aria-label="Fewer guests"
            disabled={count <= 1}
            onClick={() => onGuests(Math.max(1, count - 1))}
          >
            <Minus size={18} aria-hidden="true" />
          </button>
          <output aria-live="polite" aria-label="Guests">
            {count}
          </output>
          <button
            type="button"
            aria-label="More guests"
            disabled={count >= 50}
            onClick={() => onGuests(Math.min(50, count + 1))}
          >
            <Plus size={18} aria-hidden="true" />
          </button>
        </div>
      </section>
      {floors.length > 1 && (
        <label className="booking-mobile-block booking-mobile-row">
          <span>
            <Table2 size={16} aria-hidden="true" />
            Floor
          </span>
          <select
            aria-label="Floor"
            value={floorId}
            onChange={(event) => onFloor(event.target.value)}
          >
            {floors.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

function ReservationFloorPlan2D({
  objects,
  availability,
  selectedId,
  onSelect,
}) {
  const boardRef = useRef(null);
  const layerRef = useRef(null);
  const panGesture = useRef(null);
  const suppressClick = useRef(false);
  // Gestures move one layer with a GPU transform, at most once per frame,
  // and only commit to React state when the finger lifts. Re-rendering every
  // table (and laying them out again) on each pointer move made dragging
  // stutter on phones.
  const live = useRef({ x: 0, y: 0, scale: 1 });
  const pointers = useRef(new Map());
  const frame = useRef(0);
  const [boardSize, setBoardSize] = useState({ width: 0, height: 0 });
  const touchPlan = useMediaQuery("(max-width: 850px), (pointer: coarse)");
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        setBoardSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
    });
    observer.observe(board);
    return () => observer.disconnect();
  }, []);
  const extents = objects.map((object) => {
    const x = Number(object.position?.x) || 0,
      z = Number(object.position?.z) || 0;
    const width = Number(object.dimensions?.width) || 1.45;
    const depth = Number(object.dimensions?.depth) || 1.45;
    const angle = Number(object.rotation?.y) || 0;
    const halfX =
      (Math.abs(Math.cos(angle)) * width + Math.abs(Math.sin(angle)) * depth) /
      2;
    const halfZ =
      (Math.abs(Math.sin(angle)) * width + Math.abs(Math.cos(angle)) * depth) /
      2;
    return {
      left: x - halfX,
      right: x + halfX,
      top: z - halfZ,
      bottom: z + halfZ,
    };
  });
  const left = extents.length
    ? Math.min(...extents.map((item) => item.left))
    : -10;
  const right = extents.length
    ? Math.max(...extents.map((item) => item.right))
    : 10;
  const top = extents.length
    ? Math.min(...extents.map((item) => item.top))
    : -8;
  const bottom = extents.length
    ? Math.max(...extents.map((item) => item.bottom))
    : 8;
  const centerX = (left + right) / 2,
    centerZ = (top + bottom) / 2;
  // Phones fit the plan to the tables themselves, so a small floor still
  // shows tables large enough to read and tap.
  const fitSpan = touchPlan ? 5 : 8,
    fitMargin = touchPlan ? 56 : 120;
  const unitPx =
    Math.max(
      1,
      Math.min(
        (boardSize.width - fitMargin) / Math.max(fitSpan, right - left + 2),
        (boardSize.height - fitMargin) / Math.max(fitSpan, bottom - top + 2),
      ),
    ) * zoom;
  const byId = new Map(availability.map((row) => [String(row.id), row]));
  // Phones list only the statuses that are on the plan right now.
  const shownStatuses = new Set(
    objects
      .filter((object) => object.object_type === "table")
      .map(
        (object) => byId.get(String(object.table_id))?.status || "unavailable",
      ),
  );
  const selectedIds = Array.isArray(selectedId)
    ? selectedId
    : selectedId == null
      ? []
      : [selectedId];
  const focusTableId = selectedIds.at(-1);
  const panNow = useRef(pan);
  panNow.current = pan;
  useEffect(() => {
    if (focusTableId == null) return;
    const selectedObject = objects.find(
      (object) => String(object.table_id) === String(focusTableId),
    );
    if (!selectedObject) return;
    // Phones keep the overview when the picked table is already on screen.
    const dx =
      ((Number(selectedObject.position?.x) || 0) - centerX) * unitPx +
      panNow.current.x;
    const dy =
      ((Number(selectedObject.position?.z) || 0) - centerZ) * unitPx +
      panNow.current.y;
    if (
      touchPlan &&
      Math.abs(dx) < boardSize.width / 2 - 48 &&
      Math.abs(dy) < boardSize.height / 2 - 48
    )
      return;
    setPan({
      x: -((Number(selectedObject.position?.x) || 0) - centerX) * unitPx,
      y: -((Number(selectedObject.position?.z) || 0) - centerZ) * unitPx,
    });
  }, [
    focusTableId,
    objects,
    unitPx,
    centerX,
    centerZ,
    touchPlan,
    boardSize.width,
    boardSize.height,
  ]);
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return undefined;
    const handleWheel = (event) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest(".editor-map-controls")
      )
        return;
      event.preventDefault();
      setZoom((current) =>
        Math.min(
          2.2,
          Math.max(
            0.55,
            Number((current * (event.deltaY < 0 ? 1.1 : 0.9)).toFixed(2)),
          ),
        ),
      );
    };
    board.addEventListener("wheel", handleWheel, { passive: false });
    return () => board.removeEventListener("wheel", handleWheel);
  }, []);
  // Built only when the plan, availability, selection or zoom changes, not
  // while the board is being dragged.
  const tables = useMemo(
    () =>
      objects.map((object) => {
        const isTable = object.object_type === "table";
        const info = isTable ? byId.get(String(object.table_id)) : null;
        const available = Boolean(info?.available);
        const isSelected =
          isTable &&
          selectedIds.some((id) => String(id) === String(object.table_id));
        const status = info?.status || (isTable ? "unavailable" : "available");
        const width =
          object.dimensions?.width ??
          (object.properties?.table_shape === "long" ? 2.4 : 1.45);
        const depth =
          object.dimensions?.depth ??
          (object.properties?.table_shape === "long" ? 1.15 : 1.45);
        const style = {
          left: `calc(50% + ${((Number(object.position?.x) || 0) - centerX) * unitPx}px)`,
          top: `calc(50% + ${((Number(object.position?.z) || 0) - centerZ) * unitPx}px)`,
          transform: `translate(-50%, -50%) rotate(${-(object.rotation?.y || 0)}rad)`,
          "--object-width": width,
          "--object-depth": depth,
        };
        const className = `editor-object ${object.object_type} ${object.properties?.table_shape || "short"} status-${status} ${isSelected ? "selected" : ""}`;
        const content = (
          <>
            {isTable &&
              chairPositions(
                object.properties?.table_shape || "short",
                object.table?.capacity || object.properties?.capacity || 2,
                object.properties?.chair_layout,
                object.dimensions,
              ).map((seat, index) => (
                <i
                  key={index}
                  className="editor-chair"
                  style={{
                    left: `${50 + (seat.x / (Number(width) || 1.45)) * 100}%`,
                    top: `${50 + (seat.z / (Number(depth) || 1.45)) * 100}%`,
                    transform: `translate(-50%, -50%) rotate(${-seat.rotation}rad)`,
                  }}
                />
              ))}
            <span>
              {isTable ? object.table?.table_number || object.label : ""}
            </span>
          </>
        );
        return isTable ? (
          <button
            key={object.id || object._key}
            type="button"
            className={className}
            style={style}
            disabled={!available}
            aria-pressed={isSelected}
            aria-label={`${object.table?.table_number || object.label}, ${status}, capacity ${object.table?.capacity || object.properties?.capacity || "unknown"}`}
            title={`${object.table?.table_number || object.label} · ${status} · ${object.table?.capacity || object.properties?.capacity || "—"} seats`}
            onClick={(event) => {
              event.stopPropagation();
              if (available) onSelect(object.table_id);
            }}
          >
            {content}
          </button>
        ) : (
          <div
            key={object.id || object._key}
            className={className}
            style={style}
            aria-hidden="true"
          >
            {content}
          </div>
        );
      }),
    [objects, availability, selectedId, unitPx, centerX, centerZ, onSelect],
  );
  function paint() {
    frame.current = 0;
    const { x, y, scale } = live.current;
    if (layerRef.current)
      layerRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    boardRef.current?.style.setProperty("--floor-pan-x-px", `${x}px`);
    boardRef.current?.style.setProperty("--floor-pan-y-px", `${y}px`);
  }
  function schedulePaint() {
    if (!frame.current) frame.current = requestAnimationFrame(paint);
  }
  useLayoutEffect(() => {
    live.current = { x: pan.x, y: pan.y, scale: 1 };
    paint();
  }, [pan, zoom]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  function pinchSpan() {
    const [a, b] = [...pointers.current.values()];
    return {
      distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    };
  }
  function beginGesture() {
    const count = pointers.current.size;
    if (count >= 2) {
      const span = pinchSpan();
      panGesture.current = {
        pinch: true,
        distance: span.distance,
        x: span.x,
        y: span.y,
        base: { ...live.current },
      };
    } else if (count === 1) {
      const [point] = pointers.current.values();
      panGesture.current = {
        pinch: false,
        x: point.x,
        y: point.y,
        base: { ...live.current },
      };
    } else panGesture.current = null;
  }
  function startPan(event) {
    if (
      (event.pointerType === "mouse" && event.button !== 0) ||
      event.target.closest("button.editor-object.table, .editor-map-controls")
    )
      return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    beginGesture();
  }
  function movePan(event) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    const gesture = panGesture.current;
    if (!gesture) return;
    if (gesture.pinch && pointers.current.size >= 2) {
      const span = pinchSpan();
      const scale = Math.min(
        2.2 / zoom,
        Math.max(
          0.55 / zoom,
          gesture.base.scale * (span.distance / gesture.distance),
        ),
      );
      live.current = {
        x: gesture.base.x + (span.x - gesture.x),
        y: gesture.base.y + (span.y - gesture.y),
        scale,
      };
      suppressClick.current = true;
    } else {
      const dx = event.clientX - gesture.x;
      const dy = event.clientY - gesture.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) suppressClick.current = true;
      live.current = {
        ...live.current,
        x: gesture.base.x + dx,
        y: gesture.base.y + dy,
      };
    }
    schedulePaint();
  }
  function endPan(event) {
    if (!pointers.current.delete(event.pointerId)) return;
    if (pointers.current.size) {
      // One finger left after a pinch: keep panning from here.
      beginGesture();
      return;
    }
    panGesture.current = null;
    const { x, y, scale } = live.current;
    if (scale !== 1)
      setZoom((current) =>
        Math.min(2.2, Math.max(0.55, Number((current * scale).toFixed(2)))),
      );
    setPan({ x, y });
  }
  return (
    <div
      ref={boardRef}
      className="editor-board reservation-floor-board"
      onPointerDown={startPan}
      onPointerMove={movePan}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onClick={(event) => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        if (
          !event.target.closest(
            "button.editor-object.table, .editor-map-controls",
          )
        )
          onSelect(null);
      }}
      style={{
        "--floor-grid-x": `${unitPx}px`,
        "--floor-grid-y": `${unitPx}px`,
        "--floor-grid-major-x": `${unitPx * 5}px`,
        "--floor-grid-major-y": `${unitPx * 5}px`,
        "--floor-pan-x-px": `${pan.x}px`,
        "--floor-pan-y-px": `${pan.y}px`,
      }}
    >
      <div
        ref={layerRef}
        className="reservation-floor-layer"
        style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0)` }}
      >
        {touchPlan && extents.length > 0 && (
          <div
            className="reservation-floor-room"
            aria-hidden="true"
            style={{
              left: `calc(50% + ${(left - 1 - centerX) * unitPx}px)`,
              top: `calc(50% + ${(top - 1 - centerZ) * unitPx}px)`,
              width: `${(right - left + 2) * unitPx}px`,
              height: `${(bottom - top + 2) * unitPx}px`,
            }}
          />
        )}
        {tables}
      </div>
      <div className="editor-status-legend" aria-label="Table availability">
        {[
          ["available", "Available"],
          ["reserved", "Reserved"],
          ["occupied", "Occupied"],
          ["cleaning", "Cleaning"],
          ["unavailable", "Unavailable"],
        ]
          .filter(
            ([key]) =>
              !touchPlan || key === "available" || shownStatuses.has(key),
          )
          .map(([key, label]) => (
            <span key={key}>
              <i className={`status-${key}`} />
              {label}
            </span>
          ))}
      </div>
      <span className="editor-board-hint">
        {touchPlan
          ? "Drag to move · Pinch to zoom · Tap a table with a green dot"
          : "Drag to pan · Scroll to zoom · Select an available table"}
      </span>
      <div className="editor-map-controls" aria-label="Floor plan navigation">
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() =>
            setZoom((current) =>
              Math.min(2.2, Number((current + 0.15).toFixed(2))),
            )
          }
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() =>
            setZoom((current) =>
              Math.max(0.55, Number((current - 0.15).toFixed(2))),
            )
          }
          aria-label="Zoom out"
        >
          −
        </button>
        <label className="editor-zoom-slider">
          <span>{Math.round(zoom * 100)}%</span>
          <input
            type="range"
            min="0.55"
            max="2.2"
            step="0.05"
            value={zoom}
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) => setZoom(Number(event.target.value))}
            aria-label="Canvas zoom"
          />
        </label>
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          aria-label="Reset view"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

export function ReservationBooking({ user }) {
  const compactScreen = useMediaQuery("(max-width: 850px)");
  const bookingDialog = useRef(null);
  const povControls = useRef(null);
  const [bookingModal, setBookingModal] = useState(false);
  const [povTableId, setPovTableId] = useState(null);
  const availabilityRequest = useRef(0);
  const [floors, setFloors] = useState([]);
  const [floorsLoading, setFloorsLoading] = useState(true);
  const [floorId, setFloorId] = useState("");
  const [date, setDate] = useState(tomorrow());
  const [time, setTime] = useState("18:00");
  const [guests, setGuests] = useState(2);
  const [availability, setAvailability] = useState([]);
  const [policy, setPolicy] = useState({
    open_time: "10:00",
    close_time: "22:00",
    duration_minutes: 90,
    buffer_minutes: 30,
    automatic_table_assignment: true,
  });
  const [selected, setSelected] = useState([]);
  const [autoAssign, setAutoAssign] = useState(false);
  const [view, setView] = useState("2d");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const floor = floors.find((f) => String(f.id) === String(floorId));
  const loadFloors = async () => {
    try {
      const data = await api("/floor-plan/floors");
      setFloors(data.data || []);
      if (!floorId && data.data?.length) setFloorId(String(data.data[0].id));
    } catch (e) {
      setError(e.message);
    } finally {
      setFloorsLoading(false);
    }
  };
  async function loadAvailability() {
    if (!date || !time) return;
    const request = ++availabilityRequest.current;
    try {
      const query = new URLSearchParams({
        starts_at: bookingTime(date, time, policy.timezone),
        guest_count: String(guests),
        include_small_tables: "1",
        ...(floorId ? { floor_id: floorId } : {}),
      });
      const data = await api(`/reservations/availability?${query}`);
      if (request !== availabilityRequest.current) return;
      const rows = data.data || [];
      setAvailability(rows);
      setSelected((ids) =>
        ids.filter((id) =>
          rows.some((row) => String(row.id) === String(id) && row.available),
        ),
      );
      if (data.policy) setPolicy(data.policy);
    } catch (e) {
      if (request !== availabilityRequest.current) return;
      setError(e.message);
      setAvailability([]);
      setSelected([]);
    }
  }
  useEffect(() => {
    loadFloors();
  }, []);
  useEffect(() => {
    setSelected([]);
    setAvailability([]);
    if (date && time) loadAvailability();
    return () => {
      availabilityRequest.current++;
    };
  }, [date, time, guests, floorId, policy.timezone]);
  useEffect(
    () =>
      subscribeToFloorChanges(() => {
        loadFloors();
        loadAvailability();
      }),
    [date, time, guests, floorId, policy.timezone],
  );
  const timeSlots = makeTimeSlots(policy);
  const bookingIds =
    bookingModal && povTableId != null ? [povTableId] : selected;
  const selectedTables = availability.filter((table) =>
    bookingIds.some((id) => String(id) === String(table.id)),
  );
  const selectedTable = selectedTables[0];
  const selectedCapacity = selectedTables.reduce(
    (total, table) => total + Number(table.capacity || 0),
    0,
  );
  useEffect(() => {
    if (bookingModal && selectedTables.length) {
      if (bookingDialog.current && !bookingDialog.current.open)
        bookingDialog.current.showModal();
    } else {
      bookingDialog.current?.close();
      if (bookingModal) setBookingModal(false);
    }
  }, [bookingModal, selectedTables.length]);
  function interactWithTable(id) {
    if (
      !availability.some(
        (table) => String(table.id) === String(id) && table.available,
      )
    )
      return;
    setAutoAssign(false);
    setPovTableId(id);
    setError("");
    setBookingModal(true);
  }
  function closeBooking() {
    if (busy) return;
    bookingDialog.current?.close();
    setBookingModal(false);
    setPovTableId(null);
    povControls.current?.resume();
  }
  function toggleTable(id) {
    setSelected((current) =>
      current.some((item) => String(item) === String(id))
        ? current.filter((item) => String(item) !== String(id))
        : [...current, id],
    );
  }
  async function book(event) {
    event.preventDefault();
    if (
      !autoAssign &&
      (!selectedTables.length ||
        selectedTables.some((table) => !table.available) ||
        selectedCapacity < Number(guests))
    ) {
      setError(
        selectedTables.length && selectedCapacity < Number(guests)
          ? "Add another available table to cover your party size."
          : "Choose available tables first.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const fields = new FormData(event.currentTarget);
      const data = await api("/reservations", {
        method: "POST",
        body: JSON.stringify({
          starts_at: bookingTime(date, time, policy.timezone),
          guest_count: Number(guests),
          table_id: autoAssign ? null : bookingIds[0],
          ...(autoAssign ? {} : { table_ids: bookingIds }),
          floor_id: Number(floorId),
          guest_name: fields.get("guest_name"),
          guest_email: fields.get("guest_email"),
          guest_phone: fields.get("guest_phone"),
          notes: fields.get("notes") || null,
        }),
      });
      playSound("success");
      setResult({
        ...data.data,
        deposit_required: data.deposit_required,
        deposit_amount: data.deposit_amount,
      });
      setSelected([]);
      setAutoAssign(false);
      setBookingModal(false);
      setPovTableId(null);
      await loadAvailability();
    } catch (e) {
      setError(e.message);
      await loadAvailability();
    } finally {
      setBusy(false);
    }
  }
  async function payDeposit() {
    try {
      const p = await api(`/reservations/${result.id}/deposit/checkout`, {
        method: "POST",
      });
      window.location.assign(p.data.checkout_url);
    } catch (e) {
      setError(e.message);
    }
  }
  const reservationForm = floor && (
    <form className="reservation-form" onSubmit={book}>
      <div className="reservation-form-heading">
        <span className="reservation-step-caption">GUEST DETAILS</span>
        <h2 id="reservation-booking-title">
          {autoAssign
            ? "Confirm your reservation"
            : selectedTables.length === 1
              ? `Confirm ${selectedTable.table_number}`
              : `Confirm ${selectedTables.length} tables`}
        </h2>
        <p>
          {guests} guests · {formatBookingDate(date)} at {formatTime12(time)} ·{" "}
          {floor.name}
          {autoAssign
            ? " · table assigned when confirmed"
            : ` · ${selectedCapacity} combined seats`}
        </p>
        {!autoAssign && (
          <p className="reservation-confirm-tables">
            <strong>Selected:</strong>{" "}
            {selectedTables.map((table) => table.table_number).join(", ")}
          </p>
        )}
      </div>
      <label>
        Name
        <input
          name="guest_name"
          defaultValue={user.name}
          required
          maxLength="120"
        />
      </label>
      <label>
        Email
        <input
          name="guest_email"
          defaultValue={user.email}
          type="email"
          maxLength="254"
        />
      </label>
      <label>
        Phone
        <input
          name="guest_phone"
          type="tel"
          autoComplete="tel"
          placeholder="e.g. 0917 123 4567"
          maxLength="32"
        />
      </label>
      <div className="reservation-notes">
        <label htmlFor="reservation-notes">
          Special requests{" "}
          <span className="reservation-notes-optional">(optional)</span>
        </label>
        <AutoTextarea
          id="reservation-notes"
          name="notes"
          rows={3}
          maxLength={1500}
          placeholder="Tell us about dietary needs, accessibility needs, or a special occasion…"
          aria-describedby="reservation-notes-hint"
        />
        <small id="reservation-notes-hint">
          Up to 1,500 characters. Requests are subject to availability.
        </small>
      </div>
      <div className="reservation-form-footer">
        <p>
          <Check size={16} aria-hidden="true" /> Availability is checked again
          when you confirm.
        </p>
        <button
          disabled={busy || (!autoAssign && selectedCapacity < Number(guests))}
        >
          {busy ? "Checking availability…" : "Confirm reservation"}
        </button>
      </div>
    </form>
  );
  const bookingOverlay = (
    <dialog
      ref={bookingDialog}
      className="reservation-booking-dialog"
      aria-labelledby="reservation-booking-title"
      onClose={() => setBookingModal(false)}
      onCancel={(event) => {
        event.preventDefault();
        closeBooking();
      }}
    >
      {bookingModal && (
        <>
          <button
            type="button"
            className="booking-dialog-close"
            disabled={busy}
            onClick={closeBooking}
            aria-label="Close booking dialog"
          >
            ×
          </button>
          {error && <Feedback>{error}</Feedback>}
          {!autoAssign && selectedCapacity < Number(guests) && (
            <p className="booking-dialog-capacity" role="status">
              These tables seat {selectedCapacity}. Close this dialog and choose
              more tables for your {guests} guests.
            </p>
          )}
          {reservationForm}
        </>
      )}
    </dialog>
  );
  const objects = floor?.objects || [];
  return (
    <section className="welcome reservation-page">
      <header className="reservation-page-heading">
        <span className="eyebrow">YOUR TABLE, YOUR TIME</span>
        <h1>Reserve a table</h1>
        <p>
          Find a seat for your next visit. Choose when you’re coming, then pick
          your tables.
        </p>
      </header>
      <ol className="reservation-steps" aria-label="Booking steps">
        <li>
          <span>
            <Check size={14} aria-hidden="true" />
          </span>{" "}
          Date & party
        </li>
        <li
          aria-current={
            !selectedTables.length && !autoAssign ? "step" : undefined
          }
        >
          <span>2</span> Choose tables
        </li>
        <li
          aria-current={
            selectedTables.length || autoAssign ? "step" : undefined
          }
        >
          <span>3</span> Guest details
        </li>
      </ol>
      {error && <Feedback>{error}</Feedback>}
      {result && (
        <div className="success reservation-confirmation" role="status">
          <strong>
            Reservation {result.reference} ·{" "}
            {result.status.replaceAll("_", " ")}
          </strong>
          <span>
            {result.tables?.length
              ? result.tables.map((table) => table.table_number).join(", ")
              : result.table?.table_number}{" "}
            · {formatBookingDate(date)} at {formatTime12(time)}
          </span>
          {result.deposit_required && (
            <button onClick={payDeposit}>
              Pay reservation deposit · ₱
              {Number(result.deposit_amount).toFixed(2)}
            </button>
          )}
        </div>
      )}
      {compactScreen ? (
        <MobileBookingControls
          date={date}
          onDate={setDate}
          time={time}
          onTime={setTime}
          timeSlots={timeSlots}
          guests={guests}
          onGuests={setGuests}
          floors={floors}
          floorId={floorId}
          onFloor={setFloorId}
        />
      ) : (
        <div className="reservation-controls">
          <label>
            <span>
              <CalendarDays size={15} aria-hidden="true" />
              Date
            </span>
            <ReservationDatePicker
              value={date}
              min={tomorrow()}
              onChange={setDate}
            />
          </label>
          <label>
            <span>
              <Clock3 size={15} aria-hidden="true" />
              Time
            </span>
            <select value={time} onChange={(e) => setTime(e.target.value)}>
              {timeSlots.map((t) => (
                <option key={t} value={t}>
                  {formatTime12(t)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>
              <UsersRound size={15} aria-hidden="true" />
              Guests
            </span>
            <input
              type="number"
              min="1"
              max="50"
              value={guests}
              onChange={(e) => setGuests(e.target.value)}
            />
          </label>
          <label>
            <span>
              <Table2 size={15} aria-hidden="true" />
              Floor
            </span>
            <select
              aria-label="Floor"
              value={floorId}
              onChange={(e) => setFloorId(e.target.value)}
            >
              {floors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {floorsLoading ? (
        <CustomerScreenSkeleton variant="plan" label="Loading floor plan" />
      ) : floor ? (
        <>
          <div className="reservation-plan-toolbar">
            <div>
              <h2>Seating plan</h2>
              <p>{floor.name} · Select tables on the plan or from the list.</p>
            </div>
            <div
              className="floor-view-toggle"
              role="group"
              aria-label="Floor plan view"
            >
              <button
                onClick={() => setView("3d")}
                aria-pressed={view === "3d"}
              >
                3D view
              </button>
              <button
                onClick={() => setView("2d")}
                aria-pressed={view === "2d"}
              >
                Accessible 2D view
              </button>
            </div>
          </div>
          <div
            className={`reservation-floor-layout ${view === "2d" ? "is-2d" : "is-3d"}`}
          >
            <div className="reservation-floor-stage">
              {view === "3d" ? (
                <Suspense
                  fallback={
                    <div className="floor-scene scene-loading">
                      Loading interactive 3D floor…
                    </div>
                  }
                >
                  <FloorScene
                    objects={objects}
                    availability={availability}
                    selectedId={selected}
                    onSelect={toggleTable}
                    onInteract={interactWithTable}
                    bookingOverlay={bookingOverlay}
                    bookingOpen={bookingModal}
                    resumeControls={povControls}
                    reservationMode
                  />
                </Suspense>
              ) : (
                <ReservationFloorPlan2D
                  objects={objects}
                  availability={availability}
                  selectedId={selected}
                  onSelect={toggleTable}
                />
              )}
            </div>
            <aside
              className="reservation-table-panel"
              aria-label="Choose a table"
            >
              <div className="reservation-table-panel-heading">
                <h2>Choose a table</h2>
                <span>
                  {availability.filter((table) => table.available).length}{" "}
                  available
                </span>
              </div>
              <p>
                Select one or more available tables. Their seats combine for
                your party.
              </p>
              <div className="reservation-table-options">
                {availability
                  .slice()
                  .sort((a, b) =>
                    String(a.table_number).localeCompare(
                      String(b.table_number),
                      undefined,
                      { numeric: true },
                    ),
                  )
                  .map((table) => (
                    <button
                      type="button"
                      key={table.id}
                      disabled={!table.available}
                      aria-pressed={selected.some(
                        (id) => String(id) === String(table.id),
                      )}
                      className={`reservation-table-option status-${table.status || "unavailable"} ${selected.some((id) => String(id) === String(table.id)) ? "is-selected" : ""}`}
                      onClick={() => {
                        setAutoAssign(false);
                        toggleTable(table.id);
                      }}
                    >
                      <strong>
                        <Table2 size={18} aria-hidden="true" />
                        {table.table_number}
                      </strong>
                      <span>
                        {table.capacity} seats · {table.status || "Unavailable"}
                      </span>
                      <small>
                        {selected.some(
                          (id) => String(id) === String(table.id),
                        ) ? (
                          <>
                            <Check size={14} aria-hidden="true" /> Added
                          </>
                        ) : table.available ? (
                          "＋ Add"
                        ) : (
                          "Unavailable"
                        )}
                      </small>
                    </button>
                  ))}
                {!availability.length && (
                  <small className="reservation-table-empty">
                    No tables are available for this party size and time.
                  </small>
                )}
              </div>
              {selectedTables.length > 0 && (
                <div className="reservation-selected-summary" role="status">
                  <strong>
                    {selectedTables.length} table
                    {selectedTables.length === 1 ? "" : "s"} selected
                  </strong>
                  <span className="reservation-selected-table-numbers">
                    {selectedTables
                      .map((table) => table.table_number)
                      .join(" · ")}
                  </span>
                  <span>
                    {selectedCapacity} seats for {guests} guests
                  </span>
                  {selectedCapacity < Number(guests) && (
                    <span className="reservation-capacity-needed">
                      Choose {Number(guests) - selectedCapacity} more seat
                      {Number(guests) - selectedCapacity === 1 ? "" : "s"}.
                    </span>
                  )}
                </div>
              )}
            </aside>
          </div>
          <p className="availability-note">
            Availability is checked again when you confirm. Occupied tables
            without an expected departure cannot be booked.
          </p>
          {policy.automatic_table_assignment && (
            <label className="auto-assign-option">
              <input
                type="checkbox"
                checked={autoAssign}
                onChange={(e) => {
                  setAutoAssign(e.target.checked);
                  if (e.target.checked) setSelected([]);
                }}
              />{" "}
              Assign one suitable table for me
            </label>
          )}
          {(selectedTables.length > 0 || autoAssign) &&
            !bookingModal &&
            reservationForm}
        </>
      ) : (
        <div className="empty-floor">
          <h2>Floor plan is not published yet</h2>
          <p>
            A restaurant manager needs to set up and publish the tables before
            online reservations can open.
          </p>
        </div>
      )}
      {view !== "3d" && bookingOverlay}
    </section>
  );
}

export function MyReservations() {
  const compactScreen = useMediaQuery("(max-width: 850px)");
  const [loading, setLoading] = useState(true);
  const ask = usePrompt();
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  async function load(syncObjects = false) {
    setError("");
    try {
      const d = await api("/reservations");
      setItems(d.data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    return subscribeToLiveChanges(load);
  }, []);
  async function cancel(item) {
    try {
      await api(`/reservations/${item.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "cancelled" }),
      });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }
  async function payDeposit(item) {
    try {
      const p = await api(`/reservations/${item.id}/deposit/checkout`, {
        method: "POST",
      });
      window.location.assign(p.data.checkout_url);
    } catch (e) {
      setError(e.message);
    }
  }
  async function reschedule(item) {
    const d = new Date(item.starts_at);
    const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const entered = await ask(
      "New reservation time (YYYY-MM-DDTHH:mm). The same table or tables will be requested.",
      local,
    );
    if (!entered) return;
    try {
      await api(`/reservations/${item.id}/reschedule`, {
        method: "POST",
        body: JSON.stringify({
          starts_at: new Date(entered).toISOString(),
          guest_count: item.guest_count,
          table_id: item.table_id,
          table_ids: item.tables?.length
            ? item.tables.map((table) => table.id)
            : [item.table_id],
          floor_id: item.floor_id,
        }),
      });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }
  // Phones: upcoming visits first (soonest on top), then past ones.
  const finished = ["cancelled", "completed", "no_show"];
  const isUpcoming = (item) =>
    !finished.includes(item.status) &&
    new Date(item.ends_at || item.starts_at).getTime() >= Date.now();
  const byStart = (a, b) => new Date(a.starts_at) - new Date(b.starts_at);
  const groups = compactScreen
    ? [
        ["Upcoming", items.filter(isUpcoming).sort(byStart)],
        [
          "Past",
          items
            .filter((item) => !isUpcoming(item))
            .sort((a, b) => byStart(b, a)),
        ],
      ].filter(([, list]) => list.length)
    : [["", items]];
  return (
    <section className="welcome my-reservations-workspace">
      <span className="eyebrow">YOUR BOOKINGS</span>
      <h1>My reservations</h1>
      <p>
        Your table bookings, visit details, and reservation updates in one
        place.
      </p>
      {loading && (
        <CustomerScreenSkeleton
          variant="bookingList"
          label="Loading your bookings"
        />
      )}
      {!loading && !error && items.length === 0 && (
        <EmptyState
          title="Your next visit is waiting"
          description="Choose your table and make a little time for something good."
          action={compactScreen ? "Book a table" : undefined}
          to={compactScreen ? "/reserve" : undefined}
        />
      )}
      {error && <Feedback onRetry={load}>{error}</Feedback>}
      {compactScreen && !loading && items.length > 0 && (
        <div className="my-reservation-book">
          <Link to="/reserve">
            <CalendarPlus size={16} aria-hidden="true" />
            Book a table
          </Link>
        </div>
      )}
      <div className="my-reservation-list">
        {groups.map(([group, list]) => (
          <Fragment key={group || "all"}>
            {group && <h2 className="my-reservation-group">{group}</h2>}
            {list.map((item) => (
              <article
                key={item.id}
                aria-label={`Reservation ${item.reference}`}
                data-status={item.status}
              >
                <div className="my-reservation-date">
                  <CalendarDays size={20} aria-hidden="true" />
                  <strong>
                    {new Date(item.starts_at).toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                    })}
                  </strong>
                  <span>
                    {new Date(item.starts_at).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div>
                  <strong>{item.reference}</strong>
                  <small>
                    <Table2 size={14} aria-hidden="true" />
                    {(item.tables?.length
                      ? item.tables
                          .map((table) => table.table_number)
                          .join(", ")
                      : item.table?.table_number) || "Unassigned"}{" "}
                    <span>·</span>
                    <UsersRound size={14} aria-hidden="true" />
                    {item.guest_count} guests
                  </small>
                  {item.deposit_required && (
                    <small>
                      Deposit{" "}
                      {item.deposit_paid
                        ? "paid"
                        : `due ₱${Number(item.deposit_amount).toFixed(2)}`}
                    </small>
                  )}
                </div>
                <div className="my-reservation-actions">
                  <span
                    className={`reservation-list-status status-${item.status}`}
                  >
                    {item.status.replaceAll("_", " ")}
                  </span>
                  <div className="my-reservation-buttons">
                    {item.deposit_required &&
                      !item.deposit_paid &&
                      item.status === "pending" && (
                        <button
                          className="is-primary"
                          onClick={() => payDeposit(item)}
                        >
                          Pay deposit
                        </button>
                      )}
                    {["pending", "confirmed"].includes(item.status) && (
                      <>
                        <button onClick={() => reschedule(item)}>
                          Reschedule
                        </button>
                        <button
                          className="is-danger"
                          onClick={() => cancel(item)}
                        >
                          Cancel booking
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </Fragment>
        ))}
      </div>
    </section>
  );
}

export function ReservationDesk({ user = { permissions: [] } }) {
  const [loading, setLoading] = useState(true);

  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  async function load() {
    setError("");
    try {
      const d = await api("/reservations");
      setItems(d.data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    return subscribeToLiveChanges(load);
  }, []);
  async function setStatus(item, status) {
    try {
      await api(`/reservations/${item.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }
  async function receiveDeposit(item) {
    try {
      await api(`/reservations/${item.id}/deposit/cash`, { method: "POST" });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }
  const next = {
    confirmed: ["checked_in", "no_show", "cancelled"],
    checked_in: ["seated"],
    seated: ["completed"],
    pending: ["confirmed", "cancelled"],
  };
  return (
    <section className="welcome">
      <span className="eyebrow">SERVICE DESK</span>
      <h1>Reservations</h1>
      {loading && <Skeleton label="Loading your content" />}
      {!loading && !error && items.length === 0 && (
        <EmptyState
          title="No reservations to show"
          description="New bookings will appear here for your team."
        />
      )}
      {error && <Feedback onRetry={load}>{error}</Feedback>}
      <div className="staff-list">
        {items.map((item) => (
          <article key={item.id}>
            <div>
              <strong>
                {item.reference} · {item.guest_name} · {item.status}
              </strong>
              <small>
                {(item.tables?.length
                  ? item.tables.map((table) => table.table_number).join(", ")
                  : item.table?.table_number) || "Unassigned"}{" "}
                · {item.guest_count} guests ·{" "}
                {new Date(item.starts_at).toLocaleString()}–
                {new Date(item.ends_at).toLocaleTimeString()}
              </small>
              {item.deposit_required && (
                <small>
                  Deposit{" "}
                  {item.deposit_paid
                    ? "paid"
                    : `due ₱${Number(item.deposit_amount).toFixed(2)}`}
                </small>
              )}
            </div>
            <div>
              {item.deposit_required &&
                !item.deposit_paid &&
                user.permissions?.includes("payments.manage") && (
                  <button onClick={() => receiveDeposit(item)}>
                    Record cash deposit
                  </button>
                )}
              {(next[item.status] || []).map((status) => (
                <button key={status} onClick={() => setStatus(item, status)}>
                  {status.replaceAll("_", " ")}
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function TableOccupancy() {
  const ask = usePrompt();
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tables, setTables] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [zone, setZone] = useState("");
  const [floor, setFloor] = useState("");
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  // Phones also filter by seats and by tables waiting on their bill.
  const [seats, setSeats] = useState(0);
  const [billOnly, setBillOnly] = useState(false);
  const [pending, setPending] = useState({});
  const [now, setNow] = useState(Date.now);
  // Phones: one slim row per table; tapping a row shows its actions.
  const phone = useMediaQuery("(max-width: 850px)");
  const [openId, setOpenId] = useState(null);
  const locks = useRef(new Set());
  const mounted = useRef(true);
  const requestVersion = useRef(0);
  async function load() {
    const version = ++requestVersion.current;
    setRefreshing(true);
    try {
      const result = await api("/service/tables");
      if (!mounted.current || version !== requestVersion.current) return;
      setTables(result.data || []);
      setHasLoaded(true);
      setError("");
      setNow(Date.now());
    } catch (failure) {
      if (mounted.current && version === requestVersion.current)
        setError(failure.message);
    } finally {
      if (mounted.current && version === requestVersion.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }
  useEffect(() => {
    mounted.current = true;
    load();
    const timer = setInterval(() => setNow(Date.now()), 30000);
    const unsubscribe = subscribeToLiveChanges(load, [
      "floor",
      "reservations",
      "orders",
      "payments",
    ]);
    return () => {
      mounted.current = false;
      requestVersion.current += 1;
      clearInterval(timer);
      unsubscribe();
    };
  }, []);
  // Tell the cashier this table is ready to pay.
  async function requestBill(table, session) {
    try {
      await api(`/dining-sessions/${session.id}/request-bill`, {
        method: "POST",
      });
      setNotice(`The cashier knows ${table.table_number} wants the bill.`);
      await load();
    } catch (failure) {
      setError(failure.message);
    }
  }
  async function change(table, next) {
    if (
      locks.current.has(table.id) ||
      table.is_active === false ||
      table.operational_status === next
    )
      return;
    locks.current.add(table.id);
    setPending((current) => ({ ...current, [table.id]: true }));
    setNotice("");
    setError("");
    try {
      let estimate = null;
      if (next === "occupied") {
        const suggested = new Date(Date.now() + 90 * 60000);
        const local = new Date(
          suggested.getTime() - suggested.getTimezoneOffset() * 60000,
        )
          .toISOString()
          .slice(0, 16);
        const entered = await ask(
          "Estimated table availability (this is not a guarantee)",
          local,
        );
        if (!entered) return;
        const enteredDate = new Date(entered);
        if (
          !Number.isFinite(enteredDate.getTime()) ||
          enteredDate.getTime() <= Date.now()
        )
          throw new Error(
            "Choose a valid future time for the table availability estimate.",
          );
        estimate = enteredDate.toISOString();
      }
      await api("/service/tables/" + table.id + "/occupancy", {
        method: "PATCH",
        body: JSON.stringify({ status: next, expected_available_at: estimate }),
      });
      if (!mounted.current) return;
      setNotice("Table " + table.table_number + " is now " + next + ".");
      await load();
    } catch (failure) {
      if (mounted.current) {
        setError(failure.message);
        if (failure.uncertain) await load();
      }
    } finally {
      locks.current.delete(table.id);
      if (mounted.current)
        setPending((current) => ({ ...current, [table.id]: false }));
    }
  }
  const zones = [
    ...new Set(tables.map((table) => table.zone).filter(Boolean)),
  ].sort();
  const floors = [
    ...new Map(
      tables
        .filter((table) => table.floor_id != null)
        .map((table) => [
          String(table.floor_id),
          table.floor?.name || "Floor " + table.floor_id,
        ]),
    ).entries(),
  ];
  const statuses = [
    ["available", "Available"],
    ["occupied", "Occupied"],
    ["cleaning", "Cleaning"],
    ["unavailable", "Unavailable"],
  ];
  const visible = tables.filter(
    (table) =>
      (!zone || table.zone === zone) &&
      (!floor || String(table.floor_id) === floor) &&
      (!status || table.operational_status === status) &&
      (!seats || Number(table.capacity) >= seats) &&
      (!billOnly ||
        Boolean(
          (table.current_session || table.currentSession)?.bill_requested_at,
        )) &&
      (!query ||
        [table.table_number, table.zone]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase())),
  );
  const filtered = query || zone || floor || status || seats > 0 || billOnly;
  const clearFilters = filtered ? (
    <button
      className="sage-button sage-button--secondary sage-clear-filters"
      onClick={() => {
        setQuery("");
        setZone("");
        setFloor("");
        setStatus("");
        setSeats(0);
        setBillOnly(false);
      }}
    >
      Clear filters
    </button>
  ) : null;
  return (
    <section className="welcome sage-staff sage-service">
      <header className="sage-page-heading">
        <div>
          <span className="eyebrow">DINING ROOM SERVICE</span>
          <h1>Every table, well looked after.</h1>
          <p>
            Follow the room at a glance. Seat your guests and keep the next
            table ready.
          </p>
        </div>
        <button
          className="sage-button sage-button--secondary"
          onClick={load}
          disabled={refreshing}
          aria-busy={refreshing}
        >
          <RefreshCw size={18} aria-hidden="true" />
          <span className="admin-refresh-label">
            {refreshing ? "Refreshing…" : "Refresh tables"}
          </span>
        </button>
      </header>
      {phone && (
        <div
          className="service-phone-counts"
          role="group"
          aria-label="Show tables by status"
        >
          {statuses.map(([value, label]) => (
            <button
              key={value}
              type="button"
              data-status={value}
              aria-pressed={status === value}
              onClick={() =>
                setStatus((current) => (current === value ? "" : value))
              }
            >
              <b>
                {loading || !hasLoaded
                  ? "—"
                  : tables.filter(
                      (table) =>
                        table.operational_status === value &&
                        table.is_active !== false,
                    ).length}
              </b>
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}
      <div
        className="sage-stat-grid sage-stat-grid--four"
        hidden={phone || undefined}
      >
        {statuses.map(([value, label]) => (
          <article key={value}>
            <span>{label}</span>
            <strong>
              {loading || !hasLoaded
                ? "—"
                : tables.filter(
                    (table) =>
                      table.operational_status === value &&
                      table.is_active !== false,
                  ).length}
            </strong>
            <small>Active tables</small>
          </article>
        ))}
      </div>
      <div className="sage-toolbar">
        <label
          className={`sage-field sage-field--search${phone ? " service-phone-search" : ""}`}
        >
          {phone ? (
            <>
              <Search size={17} aria-hidden="true" />
              <span className="sr-only">Find a table</span>
            </>
          ) : (
            "Find a table"
          )}
          <input
            type={phone ? "search" : undefined}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Table number or area"
          />
        </label>
        {zones.length > 0 && (
          <label className="sage-field">
            Dining area
            <select
              value={zone}
              onChange={(event) => setZone(event.target.value)}
            >
              <option value="">All areas</option>
              {zones.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        )}
        {(floors.length > 1 || floor) && (
          <label className="sage-field">
            Floor
            <select
              value={floor}
              onChange={(event) => setFloor(event.target.value)}
            >
              <option value="">All floors</option>
              {floors.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
        {phone && (
          <div
            className="service-phone-filters"
            role="group"
            aria-label="More filters"
          >
            {[
              [0, "Any seats"],
              [2, "2+ seats"],
              [4, "4+ seats"],
              [6, "6+ seats"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={seats === value}
                onClick={() => setSeats(value)}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={billOnly}
              onClick={() => setBillOnly((on) => !on)}
            >
              Bill requested
            </button>
          </div>
        )}
        <label className="sage-field" hidden={phone || undefined}>
          Status
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">All statuses</option>
            {statuses.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {!phone && clearFilters}
      </div>
      {phone && (
        <div className="service-phone-countrow">
          <p className="sage-freshness">
            {loading
              ? "Connecting to table service…"
              : `${visible.length} of ${tables.length} ${tables.length === 1 ? "table" : "tables"}`}
          </p>
          {clearFilters}
        </div>
      )}
      <p className="sage-freshness" hidden={phone || undefined}>
        {loading
          ? "Connecting to table service…"
          : !hasLoaded
            ? "Table status unavailable. Refresh to reconnect."
            : visible.length +
              " of " +
              tables.length +
              (tables.length === 1 ? " table" : " tables") +
              ""}
      </p>
      {loading && <Skeleton label="Loading dining room tables" />}
      {error && (
        <Feedback onRetry={load}>
          {error}
          {tables.length > 0 && " Last loaded table states remain visible."}
        </Feedback>
      )}
      {notice && <Feedback tone="success">{notice}</Feedback>}
      {!loading && !error && visible.length === 0 && (
        <EmptyState
          title={
            tables.length
              ? "No tables match this view"
              : "Your dining room starts here"
          }
          description={
            tables.length
              ? "Choose another area or clear the filters to see more tables."
              : "Tables appear after they are added to the restaurant floor plan."
          }
        />
      )}
      {phone && (
        <ul className="service-phone-list">
          {visible.map((table) => {
            const session = table.current_session || table.currentSession;
            const opened = session?.opened_at
              ? new Date(session.opened_at)
              : null;
            const elapsed =
              opened && Number.isFinite(opened.getTime())
                ? Math.max(0, Math.floor((now - opened.getTime()) / 60000))
                : null;
            const busy = !!pending[table.id];
            const open = openId === table.id;
            const state =
              table.is_active === false ? "inactive" : table.operational_status;
            const place =
              table.zone ||
              (table.floor_id != null
                ? table.floor?.name || "Floor " + table.floor_id
                : "Dining room");
            const line = session
              ? [
                  `${session.guest_count || "—"} guests`,
                  elapsed === null
                    ? null
                    : elapsed < 60
                      ? `${elapsed} min`
                      : elapsed < 1440
                        ? `${Math.floor(elapsed / 60)} h ${elapsed % 60} min`
                        : `${Math.floor(elapsed / 1440)} d ${Math.floor((elapsed % 1440) / 60)} h`,
                  session.bill_requested_at ? "bill requested" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : `${table.capacity} seats · ${place}`;
            return (
              <li
                key={table.id}
                data-status={state}
                data-open={open || undefined}
                aria-busy={busy}
              >
                <button
                  type="button"
                  className="service-phone-row"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : table.id)}
                >
                  <span className="service-phone-number" aria-hidden="true">
                    {String(table.table_number).replace(/^table\s+/i, "")}
                  </span>
                  <span className="service-phone-main">
                    <strong>{table.table_number}</strong>
                    <small>{line}</small>
                  </span>
                  <span className="service-phone-state" data-status={state}>
                    {state === "inactive"
                      ? "Inactive"
                      : statuses.find(([value]) => value === state)?.[1] ||
                        state}
                  </span>
                </button>
                {open && (
                  <div className="service-phone-actions">
                    {session && !session.bill_requested_at && (
                      <button
                        type="button"
                        className="service-phone-bill"
                        disabled={busy}
                        onClick={() => requestBill(table, session)}
                      >
                        Request bill
                      </button>
                    )}
                    {statuses
                      .filter(([value]) => value !== table.operational_status)
                      .map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          disabled={busy || table.is_active === false}
                          aria-label={
                            "Mark table " + table.table_number + " " + value
                          }
                          onClick={() => change(table, value)}
                        >
                          {busy ? "Updating…" : label}
                        </button>
                      ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="sage-service-grid" hidden={phone || undefined}>
        {!phone &&
          visible.map((table) => {
            const session = table.current_session || table.currentSession;
            const opened = session?.opened_at
              ? new Date(session.opened_at)
              : null;
            const elapsed =
              opened && Number.isFinite(opened.getTime())
                ? Math.max(0, Math.floor((now - opened.getTime()) / 60000))
                : null;
            const available = table.expected_available_at
              ? new Date(table.expected_available_at)
              : null;
            const hasEstimate =
              available && Number.isFinite(available.getTime());
            const busy = !!pending[table.id];
            return (
              <article
                className="sage-table-card"
                key={table.id}
                data-status={table.operational_status}
                aria-label={"Table " + table.table_number}
                aria-busy={busy}
              >
                <header>
                  <span className="sage-table-symbol" aria-hidden="true">
                    ▦
                  </span>
                  <span
                    className="sage-table-state"
                    data-status={table.operational_status}
                  >
                    {table.is_active === false
                      ? "Inactive"
                      : table.operational_status}
                  </span>
                </header>
                <h2>{table.table_number}</h2>
                <p>
                  {table.zone ||
                    (table.floor_id != null
                      ? table.floor?.name || "Floor " + table.floor_id
                      : "Dining room")}{" "}
                  · {table.capacity} seats
                </p>
                <div className="sage-table-session">
                  {session ? (
                    <>
                      <strong>
                        {session.guest_count || "—"} guests
                        {elapsed === null
                          ? ""
                          : " · " + elapsed + " min seated"}
                      </strong>
                      <span>
                        {session.bill_requested_at
                          ? "Bill requested · cashier notified"
                          : "Open dining session"}
                      </span>
                      {!session.bill_requested_at && (
                        <button
                          type="button"
                          className="sage-button sage-button--secondary sage-request-bill"
                          disabled={busy}
                          onClick={() => requestBill(table, session)}
                        >
                          Request bill
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <strong>
                        {table.operational_status === "available"
                          ? "Ready for your next guests"
                          : table.operational_status === "cleaning"
                            ? "Getting ready for the next party"
                            : "No open dining session"}
                      </strong>
                      <span>
                        {table.operational_status === "unavailable"
                          ? "Temporarily out of service"
                          : "Capacity " + table.capacity}
                      </span>
                    </>
                  )}
                </div>
                <p className="sage-table-estimate">
                  {hasEstimate
                    ? "Estimated available " +
                      available.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "Availability time not estimated"}
                </p>
                <fieldset
                  className="sage-table-actions"
                  disabled={busy || table.is_active === false}
                >
                  <legend className="sr-only">
                    Update table {table.table_number}
                  </legend>
                  {statuses.map(([value, label]) => (
                    <button
                      key={value}
                      className={
                        "sage-button " +
                        (value === "occupied" &&
                        table.operational_status === "available"
                          ? ""
                          : "sage-button--secondary")
                      }
                      disabled={table.operational_status === value}
                      aria-label={
                        "Mark table " + table.table_number + " " + value
                      }
                      onClick={() => change(table, value)}
                    >
                      {busy ? "Updating…" : label}
                    </button>
                  ))}
                </fieldset>
              </article>
            );
          })}
      </div>
      <p className="sage-service-note">
        Availability times are staff estimates. A table with an unpaid dining
        bill must be settled before it can be cleared.
      </p>
    </section>
  );
}

export function FloorPlanEditor() {
  const [loading, setLoading] = useState(true);
  const ask = usePrompt();
  const confirm = useConfirm();
  const [floors, setFloors] = useState([]);
  const [floorId, setFloorId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [objects, setObjects] = useState([]);
  const [pendingAdds, setPendingAdds] = useState(0);
  const [busyAction, setBusyAction] = useState("");
  const [presets, setPresets] = useState([]);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [selectionBox, setSelectionBox] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [preview, setPreview] = useState(false);
  const [previewSelectedId, setPreviewSelectedId] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [boardSize, setBoardSize] = useState({ width: 0, height: 0 });
  // Full screen keeps the plan editable, with its own Add to layout card.
  const [boardFull, setBoardFull] = useState(false);
  // Hand tool: every drag moves the view, even over objects.
  const [handMode, setHandMode] = useState(false);
  const boardRef = useRef(null);
  const gesture = useRef(null);
  // Fingers on the board, for two-finger pinch zoom.
  const pointers = useRef(new Map());
  const suppressClick = useRef(false);
  const clipboard = useRef([]);
  const undoStack = useRef([]);
  const pendingDeleteIds = useRef([]);
  const spaceHeld = useRef(false);
  const dirty = useRef(false);
  const floor = floors.find((f) => String(f.id) === String(floorId));
  function rememberUndo() {
    const entry = {
      objects: JSON.parse(JSON.stringify(objects)),
      createdObjectIds: [],
      deletedObjectIds: [...pendingDeleteIds.current],
    };
    undoStack.current.push(entry);
    if (undoStack.current.length > 50) undoStack.current.shift();
    return entry;
  }
  async function undo() {
    if (pendingAdds || busyAction) {
      setNotice("Wait for the current action to finish before undoing.");
      return;
    }
    const entry = undoStack.current.pop();
    if (!entry) {
      setNotice("There are no editor changes to undo.");
      return;
    }
    try {
      await Promise.all(
        entry.createdObjectIds.map((id) =>
          api(`/admin/floor-plan/objects/${id}`, { method: "DELETE" }),
        ),
      );
      setObjects(entry.objects);
      pendingDeleteIds.current = entry.deletedObjectIds || [];
      dirty.current = true;
      setError("");
      setNotice("Last action undone. Save draft to keep this change.");
    } catch (e) {
      undoStack.current.push(entry);
      setError(e.message);
    }
  }
  async function load(syncObjects = false) {
    setError("");
    try {
      const d = await api("/admin/floor-plan/floors");
      const nextFloors = d.data || [];
      setFloors((current) =>
        JSON.stringify(current) === JSON.stringify(nextFloors)
          ? current
          : nextFloors,
      );
      if (syncObjects && !dirty.current && floorId) {
        const latestFloor = nextFloors.find(
          (item) => String(item.id) === String(floorId),
        );
        if (latestFloor) setObjects(latestFloor.objects || []);
        dirty.current = false;
      }
      if (!floorId && d.data?.length) setFloorId(String(d.data[0].id));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    const board = boardRef.current;
    if (!board || preview) return undefined;
    const handleWheel = (event) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest(
          "input, select, textarea, [contenteditable='true']",
        )
      )
        return;
      event.preventDefault();
      setZoom((current) =>
        Math.min(
          2.2,
          Math.max(
            0.55,
            Number((current * (event.deltaY < 0 ? 1.1 : 0.9)).toFixed(2)),
          ),
        ),
      );
    };
    board.addEventListener("wheel", handleWheel, { passive: false });
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setBoardSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(board);
    return () => {
      observer.disconnect();
      board.removeEventListener("wheel", handleWheel);
    };
  }, [floorId, preview]);
  async function loadPresets() {
    try {
      const d = await api("/admin/floor-plan/presets");
      setPresets(d.data || []);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    loadPresets();
  }, []);
  useEffect(() => {
    setObjects(floor?.objects || []);
    undoStack.current = [];
    pendingDeleteIds.current = [];
    clipboard.current = [];
    dirty.current = false;
  }, [floorId]);
  useEffect(() => {
    if (!floorId) return undefined;
    const refreshIfClean = () => {
      if (dirty.current) {
        return;
      }
      load(true);
    };
    const unsubscribe = subscribeToFloorChanges(refreshIfClean);

    return () => {
      unsubscribe();
    };
  }, [floorId]);
  async function addFloor() {
    const name = await ask("Floor name");
    if (!name) return;
    setBusyAction("Creating floor");
    try {
      const d = await api("/admin/floor-plan/floors", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      await load();
      setFloorId(String(d.data.id));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyAction("");
    }
  }
  async function deleteDraftFloor() {
    if (!floor || floor.is_published || pendingAdds) return;
    const objectCount = objects.length;
    const message = `Delete “${floor.name}” and its ${objectCount} layout item${objectCount === 1 ? "" : "s"}? This cannot be undone. Table and reservation history will be kept.`;
    if (
      !(await confirm(message, {
        title: `Delete “${floor.name}”?`,
        confirmLabel: "Delete draft floor",
        destructive: true,
      }))
    )
      return;
    setError("");
    setBusyAction("Deleting floor");
    try {
      await api(`/admin/floor-plan/floors/${floor.id}`, { method: "DELETE" });
      const remaining = floors.filter(
        (item) => String(item.id) !== String(floor.id),
      );
      setFloors(remaining);
      const nextFloor = remaining[0] || null;
      setFloorId(nextFloor ? String(nextFloor.id) : "");
      setObjects(nextFloor?.objects || []);
      undoStack.current = [];
      dirty.current = false;
      setNotice(`Draft floor “${floor.name}” was removed.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyAction("");
    }
  }
  async function addTable(
    shape = "short",
    blueprint = null,
    position = { x: 0, z: 0 },
    rotation = { y: 0 },
  ) {
    if (!floor) return;
    const undoEntry = rememberUndo();
    const usedNumbers = new Set(
      [
        ...floors
          .flatMap((item) => item.objects || [])
          .map((item) => item.table?.table_number),
        ...objects.map((item) => item.table?.table_number),
      ]
        .filter(Boolean)
        .map((number) => String(number).trim().toLowerCase()),
    );
    let number = 1;
    while (usedNumbers.has(`table ${number}`)) number += 1;
    const table_number = `Table ${number}`;
    const capacity = Math.max(
      1,
      Math.min(12, Number(blueprint?.capacity) || (shape === "long" ? 6 : 2)),
    );
    const chair_layout =
      blueprint?.chair_layout || defaultChairLayout(shape, capacity);
    const dimensions =
      blueprint?.dimensions ||
      (shape === "long"
        ? { width: 2.4, depth: 1.15, height: 0.8 }
        : { width: 1.45, depth: 1.45, height: 0.8 });
    const tempKey = `pending-table-${Date.now()}-${Math.random()}`;
    const optimisticObject = {
      _key: tempKey,
      _pending: true,
      _selected: true,
      floor_id: floor.id,
      object_type: "table",
      label: table_number,
      position,
      rotation: { ...rotation },
      dimensions,
      properties: { capacity, table_shape: shape, chair_layout },
      table: { table_number, capacity, operational_status: "available" },
    };
    dirty.current = true;
    setError("");
    setNotice("");
    setPendingAdds((count) => count + 1);
    setObjects((rows) => [
      ...rows.map((row) => ({ ...row, _selected: false })),
      optimisticObject,
    ]);
    try {
      const d = await api(`/admin/floor-plan/floors/${floor.id}/tables`, {
        method: "POST",
        body: JSON.stringify({
          table_number,
          capacity,
          shape,
          dimensions: blueprint?.dimensions,
          chair_layout,
          position,
        }),
      });
      const newObject = {
        ...d.data.floor_plan_object,
        table: d.data,
        rotation: { ...rotation },
        _selected: true,
      };
      if (newObject.id) undoEntry.createdObjectIds.push(newObject.id);
      setObjects((rows) =>
        rows.map((row) =>
          row._key === tempKey
            ? {
                ...newObject,
                position: row.position,
                rotation: { ...rotation },
                _selected: true,
              }
            : { ...row, _selected: false },
        ),
      );
      setFloors((rows) =>
        rows.map((row) =>
          row.id === floor.id ? { ...row, is_published: false } : row,
        ),
      );
      setNotice(
        `${table_number} added. Drag it into place; edit its number or capacity in Properties.`,
      );
      return newObject.id;
    } catch (e) {
      undoStack.current = undoStack.current.filter(
        (entry) => entry !== undoEntry,
      );
      setObjects((rows) => rows.filter((row) => row._key !== tempKey));
      setNotice("");
      setError(e.message);
      return null;
    } finally {
      setPendingAdds((count) => Math.max(0, count - 1));
    }
  }
  async function addObject(type, dimensions = {}) {
    if (!floor) return;
    rememberUndo();
    dirty.current = true;
    const defaults =
      type === "wall"
        ? { width: 8, depth: 0.24, height: 2.2 }
        : type === "door"
          ? { width: 1.1, depth: 0.14, height: 2.1 }
          : type === "entrance"
            ? { width: 1.4, depth: 0.3, height: 0.12 }
            : type === "flooring"
              ? { width: 4, depth: 4, height: 0.06 }
              : { width: 1.5, depth: 1, height: 0.6 };
    const labels = {
      wall: "Wall",
      door: "Door",
      entrance: "Entry",
      counter: "Counter",
      furniture: "Furniture",
      flooring: "Floor panel",
    };
    setObjects((rows) => [
      ...rows.map((row) => ({ ...row, _selected: false })),
      {
        _key: `new-${Date.now()}-${Math.random()}`,
        floor_id: floor.id,
        object_type: type,
        label: labels[type] || type,
        position: { x: 0, z: 0 },
        rotation: { y: 0 },
        dimensions: { ...defaults, ...dimensions },
        properties: {},
        _selected: true,
      },
    ]);
  }
  function update(id, changes) {
    rememberUndo();
    dirty.current = true;
    setObjects((rows) =>
      rows.map((o) => ((o.id ?? o._key) === id ? { ...o, ...changes } : o)),
    );
  }
  function setTableCapacity(object, rawValue) {
    const id = object.id ?? object._key;
    if (rawValue === "") {
      update(id, { table: { ...object.table, capacity: "" } });
      return;
    }
    const capacity = Math.max(
      1,
      Math.min(12, Number.parseInt(rawValue, 10) || 1),
    );
    const shape = object.properties?.table_shape || "short";
    update(id, {
      table: { ...object.table, capacity },
      properties: {
        ...object.properties,
        chair_layout: defaultChairLayout(shape, capacity),
      },
    });
  }
  function setChairCount(object, side, rawValue) {
    const id = object.id ?? object._key;
    const shape = object.properties?.table_shape || "short";
    const currentLayout =
      object.properties?.chair_layout ||
      defaultChairLayout(shape, object.table?.capacity || 2);
    if (rawValue === "") {
      update(id, {
        properties: {
          ...object.properties,
          chair_layout: { ...currentLayout, [side]: "" },
        },
      });
      return;
    }
    if (shape !== "long") {
      const count = Math.max(
        1,
        Math.min(12, Number.parseInt(rawValue, 10) || 1),
      );
      update(id, {
        table: { ...object.table, capacity: count },
        properties: { ...object.properties, chair_layout: { around: count } },
      });
      return;
    }
    const otherSeats = ["top", "bottom", "left", "right"]
      .filter((name) => name !== side)
      .reduce((total, name) => total + (Number(currentLayout[name]) || 0), 0);
    const count = Math.max(
      0,
      Math.min(12 - otherSeats, Number.parseInt(rawValue, 10) || 0),
    );
    const chair_layout = {
      ...defaultChairLayout("long", object.table?.capacity || 2),
      ...currentLayout,
      [side]: count,
    };
    const capacity = Math.max(
      1,
      ["top", "bottom", "left", "right"].reduce(
        (total, name) => total + (Number(chair_layout[name]) || 0),
        0,
      ),
    );
    update(id, {
      table: { ...object.table, capacity },
      properties: { ...object.properties, chair_layout },
    });
  }
  function selectObject(id, mode = "replace") {
    setObjects((rows) =>
      rows.map((row) => ({
        ...row,
        _selected:
          mode === "toggle" && (row.id ?? row._key) === id
            ? !row._selected
            : mode === "add"
              ? row._selected || (row.id ?? row._key) === id
              : (row.id ?? row._key) === id,
      })),
    );
  }
  async function saveAsPreset(object) {
    const name = await ask(
      "Preset name",
      object.table?.table_number || "Table preset",
    );
    if (!name) return;
    const shape = object.properties?.table_shape || "short";
    const definition = {
      shape,
      capacity: object.table?.capacity || object.properties?.capacity || 2,
      dimensions: {
        width: object.dimensions?.width || 1.45,
        depth: object.dimensions?.depth || 1.45,
      },
      chair_layout:
        object.properties?.chair_layout ||
        defaultChairLayout(shape, object.table?.capacity || 2),
    };
    setBusyAction("Saving table preset");
    try {
      const d = await api("/admin/floor-plan/presets", {
        method: "POST",
        body: JSON.stringify({ name, definition }),
      });
      setPresets((rows) =>
        [...rows, d.data].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setNotice(`“${name}” was saved to table presets.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyAction("");
    }
  }
  async function saveSelectionAsPreset() {
    const selected = objects.filter((object) => object._selected);
    if (selected.length < 2 || selected.some((object) => object._pending))
      return;
    const name = await ask("Preset name", "Layout preset");
    if (!name) return;
    const origin = {
      x: Math.min(...selected.map((object) => Number(object.position?.x) || 0)),
      z: Math.min(...selected.map((object) => Number(object.position?.z) || 0)),
    };
    const definition = {
      type: "group",
      objects: selected.map((object) => ({
        object_type: object.object_type,
        label: object.label || object.table?.table_number || object.object_type,
        position: {
          x: (Number(object.position?.x) || 0) - origin.x,
          z: (Number(object.position?.z) || 0) - origin.z,
        },
        rotation: { y: Number(object.rotation?.y) || 0 },
        dimensions: {
          width: Number(object.dimensions?.width) || 0,
          depth: Number(object.dimensions?.depth) || 0,
          height: Number(object.dimensions?.height) || 0.6,
        },
        properties: {
          ...(object.properties || {}),
          ...(object.object_type === "table"
            ? {
                capacity:
                  Number(
                    object.table?.capacity || object.properties?.capacity,
                  ) || 2,
                table_shape: object.properties?.table_shape || "short",
                chair_layout:
                  object.properties?.chair_layout ||
                  defaultChairLayout(
                    object.properties?.table_shape || "short",
                    object.table?.capacity || 2,
                  ),
              }
            : {}),
        },
      })),
    };
    setBusyAction("Saving layout preset");
    try {
      const d = await api("/admin/floor-plan/presets", {
        method: "POST",
        body: JSON.stringify({ name, definition }),
      });
      setPresets((rows) =>
        [...rows, d.data].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setNotice(`“${name}” was saved as a reusable layout preset.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyAction("");
    }
  }
  async function addPreset(preset) {
    const definition = preset.definition || {};
    if (definition.type !== "group") {
      return addTable(definition.shape, definition);
    }
    if (!floor || pendingAdds) return;
    rememberUndo();
    dirty.current = true;
    const newItems = [];
    const tableIds = [];
    for (const item of definition.objects || []) {
      const position = {
        x: Number(item.position?.x) || 0,
        z: Number(item.position?.z) || 0,
      };
      if (item.object_type === "table") {
        const id = await addTable(
          item.properties?.table_shape || "short",
          {
            capacity: item.properties?.capacity,
            chair_layout: item.properties?.chair_layout,
            dimensions: item.dimensions,
          },
          position,
          item.rotation || { y: 0 },
        );
        if (id !== null && id !== undefined) tableIds.push(id);
      } else {
        newItems.push({
          _key: `preset-${Date.now()}-${Math.random()}`,
          floor_id: floor.id,
          object_type: item.object_type,
          label: item.label || item.object_type,
          position,
          rotation: item.rotation || { y: 0 },
          dimensions: item.dimensions || {},
          properties: item.properties || {},
          _selected: true,
        });
      }
    }
    if (newItems.length) {
      setObjects((rows) => [
        ...rows.map((row) => ({ ...row, _selected: false })),
        ...newItems,
      ]);
    }
    const allIds = new Set([...tableIds, ...newItems.map((item) => item._key)]);
    setObjects((rows) =>
      rows.map((row) => ({
        ...row,
        _selected: allIds.has(row.id ?? row._key),
      })),
    );
    setNotice(
      `Added “${preset.name}”. The ${allIds.size} preset items are selected; drag them together to place the layout.`,
    );
  }
  async function deletePreset(preset) {
    if (
      !(await confirm("Existing tables will not change.", {
        title: `Delete “${preset.name}”?`,
        confirmLabel: "Delete preset",
        destructive: true,
      }))
    )
      return;
    setBusyAction("Deleting table preset");
    try {
      await api(`/admin/floor-plan/presets/${preset.id}`, { method: "DELETE" });
      setPresets((rows) => rows.filter((item) => item.id !== preset.id));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyAction("");
    }
  }
  function startObjectDrag(event, object) {
    if (event.button !== 0 && event.button !== 1) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    suppressClick.current = false;
    if (event.button === 1 || spaceHeld.current || handMode) {
      gesture.current = {
        kind: "pan",
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        pan: { ...pan },
      };
      return;
    }
    const id = object.id ?? object._key;
    const toggleSelection = event.ctrlKey || event.metaKey;
    if (toggleSelection && object._selected) {
      setObjects((rows) =>
        rows.map((row) =>
          (row.id ?? row._key) === id ? { ...row, _selected: false } : row,
        ),
      );
      suppressClick.current = true;
      gesture.current = null;
      return;
    }
    if (toggleSelection) suppressClick.current = true;
    rememberUndo();
    const selectedIds = objects
      .filter((item) => item._selected)
      .map((item) => item.id ?? item._key);
    const additiveSelection = event.shiftKey || toggleSelection;
    const ids = additiveSelection
      ? [...new Set([...selectedIds, id])]
      : object._selected
        ? selectedIds
        : [id];
    setObjects((rows) =>
      rows.map((row) => ({
        ...row,
        _selected: ids.includes(row.id ?? row._key),
      })),
    );
    const positions = Object.fromEntries(
      ids.map((selectedId) => {
        const selectedObject = objects.find(
          (item) => (item.id ?? item._key) === selectedId,
        );
        return [
          selectedId,
          { ...(selectedObject?.position || object.position) },
        ];
      }),
    );
    gesture.current = {
      kind: "object",
      ids,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      positions,
    };
  }
  // Two fingers: zoom around the point between them and move with them.
  function trackPointer(event) {
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (pointers.current.size !== 2 || !boardRef.current) return;
    const [a, b] = [...pointers.current.values()];
    const rect = boardRef.current.getBoundingClientRect();
    gesture.current = {
      kind: "pinch",
      rect,
      distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      mid: { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top },
      zoom,
      pan: { ...pan },
    };
    suppressClick.current = true;
    setSelectionBox(null);
    // The second finger starts no drag of its own.
    event.stopPropagation();
  }
  function pinchMove(event) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    const active = gesture.current;
    if (active?.kind !== "pinch" || pointers.current.size < 2) return;
    event.stopPropagation();
    const [a, b] = [...pointers.current.values()];
    const { rect } = active;
    const nextZoom = Math.min(
      2.2,
      Math.max(
        0.55,
        (active.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / active.distance,
      ),
    );
    const ratio = nextZoom / active.zoom;
    const mid = {
      x: (a.x + b.x) / 2 - rect.left,
      y: (a.y + b.y) / 2 - rect.top,
    };
    const centre = { x: rect.width / 2, y: rect.height / 2 };
    const startPan = {
      x: (active.pan.x / 100) * rect.width,
      y: (active.pan.y / 100) * rect.height,
    };
    // Keep the spot that started between the fingers under them.
    const panX =
      mid.x - centre.x - (active.mid.x - centre.x - startPan.x) * ratio;
    const panY =
      mid.y - centre.y - (active.mid.y - centre.y - startPan.y) * ratio;
    setZoom(Number(nextZoom.toFixed(3)));
    setPan({ x: (panX * 100) / rect.width, y: (panY * 100) / rect.height });
  }
  function releasePointer(event) {
    pointers.current.delete(event.pointerId);
    if (gesture.current?.kind === "pinch" && pointers.current.size < 2)
      gesture.current = null;
  }
  function rotateSelected() {
    if (!objects.some((object) => object._selected)) return;
    rememberUndo();
    setObjects((rows) =>
      rows.map((object) =>
        object._selected
          ? {
              ...object,
              rotation: {
                ...object.rotation,
                y: ((object.rotation?.y || 0) + Math.PI / 4) % (2 * Math.PI),
              },
            }
          : object,
      ),
    );
    dirty.current = true;
  }
  function startCanvasPan(event) {
    if (event.target !== event.currentTarget) return;
    setObjects((rows) =>
      rows.map((object) =>
        object._selected ? { ...object, _selected: false } : object,
      ),
    );
    setContextMenu(null);
    event.currentTarget.setPointerCapture(event.pointerId);
    suppressClick.current = false;
    if (event.shiftKey && !spaceHeld.current) {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      gesture.current = { kind: "box", pointerId: event.pointerId, x, y, rect };
      setSelectionBox({ left: x, top: y, width: 0, height: 0 });
    } else {
      gesture.current = {
        kind: "pan",
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        pan: { ...pan },
      };
    }
  }
  function moveGesture(event) {
    const active = gesture.current;
    const board = boardRef.current;
    if (!active || active.pointerId !== event.pointerId || !board) return;
    const rect = board.getBoundingClientRect();
    const dx = event.clientX - active.x;
    const dy = event.clientY - active.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) suppressClick.current = true;
    if (active.kind === "pan") {
      setPan({
        x: active.pan.x + (dx * 100) / rect.width,
        y: active.pan.y + (dy * 100) / rect.height,
      });
      return;
    }
    if (active.kind === "box") {
      const point = {
        x: event.clientX - active.rect.left,
        y: event.clientY - active.rect.top,
      };
      setSelectionBox({
        left: Math.min(active.x, point.x),
        top: Math.min(active.y, point.y),
        width: Math.abs(point.x - active.x),
        height: Math.abs(point.y - active.y),
      });
      return;
    }
    const unitPx =
      Math.max(1, Math.min((rect.width * 0.9) / 20, (rect.height * 0.9) / 16)) *
      zoom;
    const snap = (value) =>
      snapToGrid ? Math.round(value) : Number(value.toFixed(2));
    const snapWallToFloorSeam = (wall, position, rows) => {
      const angle = wall.rotation?.y || 0;
      const horizontal = Math.abs(Math.cos(angle)) >= Math.abs(Math.sin(angle));
      const axis = horizontal ? "z" : "x";
      let nearest = position[axis];
      let nearestDistance = 0.8;
      for (const panel of rows) {
        if (panel.object_type !== "flooring") continue;
        const panelPosition = panel.position || { x: 0, z: 0 };
        const panelDimensions = panel.dimensions || {};
        const span =
          Number(horizontal ? panelDimensions.depth : panelDimensions.width) ||
          4;
        const center = Number(panelPosition[axis]) || 0;
        const firstSeam = center - span / 2;
        const seams = [firstSeam, firstSeam + span];
        for (let step = 1; step < span; step += 1) seams.push(firstSeam + step);
        for (const seam of seams) {
          const distance = Math.abs(position[axis] - seam);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearest = seam;
          }
        }
      }
      return { ...position, [axis]: nearest };
    };
    setObjects((rows) =>
      rows.map((o) => {
        const id = o.id ?? o._key;
        if (!active.ids.includes(id)) return o;
        const position = active.positions[id] || o.position;
        const x = position.x + dx / unitPx;
        const z = position.z + dy / unitPx;
        let nextPosition = { x: snap(x), z: snap(z) };
        if (o.object_type === "wall") {
          nextPosition = snapWallToFloorSeam(o, nextPosition, objects);
          let bestDistance = 0.8;
          const angle = o.rotation?.y || 0;
          const halfLength = (Number(o.dimensions?.width) || 4) / 2;
          const offset = {
            x: Math.cos(angle) * halfLength,
            z: -Math.sin(angle) * halfLength,
          };
          const endpoints = [1, -1].map((side) => ({
            x: nextPosition.x + offset.x * side,
            z: nextPosition.z + offset.z * side,
          }));
          for (const neighbor of objects) {
            if (
              neighbor.object_type !== "wall" ||
              active.ids.includes(neighbor.id ?? neighbor._key)
            )
              continue;
            const neighborAngle = neighbor.rotation?.y || 0;
            const angleDelta = Math.abs(
              Math.atan2(
                Math.sin(angle - neighborAngle),
                Math.cos(angle - neighborAngle),
              ),
            );
            const perpendicularDelta = Math.abs(Math.PI / 2 - angleDelta);
            if (
              Math.min(
                angleDelta,
                Math.abs(Math.PI - angleDelta),
                perpendicularDelta,
              ) >
              Math.PI / 18
            )
              continue;
            const neighborPosition = neighbor.position || { x: 0, z: 0 };
            const neighborOffset = {
              x:
                (Math.cos(neighborAngle) *
                  (Number(neighbor.dimensions?.width) || 4)) /
                2,
              z:
                (-Math.sin(neighborAngle) *
                  (Number(neighbor.dimensions?.width) || 4)) /
                2,
            };
            const neighborEndpoints = [1, -1].map((side) => ({
              x: neighborPosition.x + neighborOffset.x * side,
              z: neighborPosition.z + neighborOffset.z * side,
            }));
            endpoints.forEach((endpoint) =>
              neighborEndpoints.forEach((target) => {
                const distance = Math.hypot(
                  target.x - endpoint.x,
                  target.z - endpoint.z,
                );
                if (distance < bestDistance) {
                  bestDistance = distance;
                  nextPosition = {
                    x: nextPosition.x + target.x - endpoint.x,
                    z: nextPosition.z + target.z - endpoint.z,
                  };
                }
              }),
            );
          }
        }
        return { ...o, position: nextPosition };
      }),
    );
    dirty.current = true;
  }
  function alignObjectsToGrid() {
    if (pendingAdds || !objects.length) return;
    rememberUndo();
    const snapWallToFloorSeam = (wall, position, rows) => {
      const angle = wall.rotation?.y || 0;
      const horizontal = Math.abs(Math.cos(angle)) >= Math.abs(Math.sin(angle));
      const axis = horizontal ? "z" : "x";
      let nearest = position[axis];
      let nearestDistance = Infinity;
      for (const panel of rows) {
        if (panel.object_type !== "flooring") continue;
        const panelPosition = panel.position || { x: 0, z: 0 };
        const panelDimensions = panel.dimensions || {};
        const span =
          Number(horizontal ? panelDimensions.depth : panelDimensions.width) ||
          4;
        const firstSeam = (Number(panelPosition[axis]) || 0) - span / 2;
        const seams = [firstSeam, firstSeam + span];
        for (let step = 1; step < span; step += 1) seams.push(firstSeam + step);
        for (const seam of seams) {
          const distance = Math.abs(position[axis] - seam);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearest = seam;
          }
        }
      }
      return {
        ...position,
        [axis]: Number.isFinite(nearestDistance)
          ? nearest
          : Math.round(position[axis]),
      };
    };
    setObjects((rows) => {
      const aligned = rows.map((object) => ({
        ...object,
        position: {
          x: Math.round(Number(object.position?.x) || 0),
          z: Math.round(Number(object.position?.z) || 0),
        },
      }));
      return aligned.map((object) => {
        const position = object.position;
        return {
          ...object,
          position:
            object.object_type === "wall"
              ? snapWallToFloorSeam(object, position, aligned)
              : position,
        };
      });
    });
    dirty.current = true;
    setNotice(
      "All objects are aligned to the grid. Save draft to keep the changes.",
    );
  }
  function finishGesture(event) {
    const active = gesture.current;
    if (active?.pointerId !== event.pointerId) return;
    if (active.kind === "box") {
      const board = boardRef.current?.getBoundingClientRect();
      if (board) {
        const left = Math.min(active.x, event.clientX - board.left);
        const top = Math.min(active.y, event.clientY - board.top);
        const right = Math.max(active.x, event.clientX - board.left);
        const bottom = Math.max(active.y, event.clientY - board.top);
        setObjects((rows) =>
          rows.map((o) => {
            const unitPx =
              Math.max(
                1,
                Math.min((board.width * 0.9) / 20, (board.height * 0.9) / 16),
              ) * zoom;
            const x =
              board.width / 2 +
              (o.position?.x || 0) * unitPx +
              (pan.x / 100) * board.width;
            const y =
              board.height / 2 +
              (o.position?.z || 0) * unitPx +
              (pan.y / 100) * board.height;
            return {
              ...o,
              _selected: x >= left && x <= right && y >= top && y <= bottom,
            };
          }),
        );
      }
      setSelectionBox(null);
    }
    gesture.current = null;
  }
  useEffect(() => {
    if (!boardFull) return undefined;
    const leave = (event) => event.key === "Escape" && setBoardFull(false);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", leave);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", leave);
    };
  }, [boardFull]);
  async function duplicateObject(object, offset = { x: 1, z: 1 }) {
    const position = {
      x: (object.position?.x || 0) + offset.x,
      z: (object.position?.z || 0) + offset.z,
    };
    setContextMenu(null);
    if (
      object.object_type === "table" ||
      object.table_id ||
      object._clipboardTable
    ) {
      const shape = object.properties?.table_shape || "short";
      return addTable(
        shape,
        {
          capacity:
            object._clipboardTableData?.capacity ||
            object.table?.capacity ||
            object.properties?.capacity ||
            2,
          dimensions: object.dimensions,
          chair_layout:
            object.properties?.chair_layout ||
            defaultChairLayout(
              shape,
              object._clipboardTableData?.capacity ||
                object.table?.capacity ||
                2,
            ),
        },
        position,
        object.rotation || { y: 0 },
      );
    }
    rememberUndo();
    dirty.current = true;
    const { _clipboardTable, _clipboardTableData, ...copyable } = object;
    const duplicate = {
      ...copyable,
      id: null,
      _key: `copy-${Date.now()}-${Math.random()}`,
      table_id: null,
      table: null,
      position,
      _selected: true,
    };
    setObjects((rows) => [
      ...rows.map((row) => ({ ...row, _selected: false })),
      duplicate,
    ]);
    return duplicate._key;
  }
  async function pasteCopiedObjects() {
    const selection = objects.filter((object) => object._selected);
    const bounds = (items) =>
      items.reduce(
        (result, object) => {
          const width =
            Number(
              object.dimensions?.width ??
                (object.object_type === "table" ? 1.45 : 1),
            ) || 0;
          const depth =
            Number(
              object.dimensions?.depth ??
                (object.object_type === "table" ? 1.45 : 1),
            ) || 0;
          const angle = Number(object.rotation?.y) || 0;
          const halfX =
            (Math.abs(Math.cos(angle)) * width +
              Math.abs(Math.sin(angle)) * depth) /
            2;
          const halfZ =
            (Math.abs(Math.sin(angle)) * width +
              Math.abs(Math.cos(angle)) * depth) /
            2;
          const x = Number(object.position?.x) || 0;
          const z = Number(object.position?.z) || 0;
          result.minX = Math.min(result.minX, x - halfX);
          result.maxX = Math.max(result.maxX, x + halfX);
          result.minZ = Math.min(result.minZ, z - halfZ);
          result.maxZ = Math.max(result.maxZ, z + halfZ);
          return result;
        },
        { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
      );
    const copyBounds = bounds(clipboard.current);
    const targetBounds = selection.length ? bounds(selection) : copyBounds;
    const gap = 0.5;
    const offset = {
      x: targetBounds.maxX + gap - copyBounds.minX,
      z:
        (targetBounds.minZ +
          targetBounds.maxZ -
          copyBounds.minZ -
          copyBounds.maxZ) /
        2,
    };
    const pastedIds = [];
    for (const object of clipboard.current) {
      const id = await duplicateObject(
        { ...object, position: { ...object.position } },
        offset,
      );
      if (id !== null && id !== undefined) pastedIds.push(id);
    }
    const pasted = new Set(pastedIds);
    setObjects((rows) =>
      rows.map((row) => ({
        ...row,
        _selected: pasted.has(row.id ?? row._key),
      })),
    );
    if (pasted.size)
      setNotice(
        `${pasted.size} pasted item${pasted.size === 1 ? "" : "s"} selected.`,
      );
  }
  function copySelectedObjects() {
    const selected = objects.filter((object) => object._selected);
    if (!selected.length) return false;
    clipboard.current = selected.map((object) => {
      const { id, table_id, table, _key, _pending, _selected, ...source } =
        object;
      return {
        ...JSON.parse(JSON.stringify(source)),
        _clipboardTable: Boolean(table_id),
        _clipboardTableData: table ? { ...table } : null,
      };
    });
    return true;
  }
  function cutSelectedObjects() {
    const selected = objects.filter((object) => object._selected);
    if (!selected.length) return;
    if (selected.some((object) => object._pending)) {
      setNotice("Wait for the new table to finish adding before cutting it.");
      return;
    }
    copySelectedObjects();
    rememberUndo();
    const idsToDelete = selected
      .filter((object) => object.id)
      .map((object) => object.id);
    pendingDeleteIds.current = [
      ...new Set([...pendingDeleteIds.current, ...idsToDelete]),
    ];
    const selectedIds = new Set(
      selected.map((object) => object.id ?? object._key),
    );
    setObjects((rows) =>
      rows.filter((object) => !selectedIds.has(object.id ?? object._key)),
    );
    dirty.current = true;
    setNotice(
      `${selected.length} item${selected.length === 1 ? "" : "s"} cut. Press Ctrl+Z to undo, or save the draft to apply the removal.`,
    );
  }
  async function deleteSelected() {
    const selected = objects.filter((object) => object._selected);
    if (!selected.length) return;
    if (selected.some((object) => object._pending)) {
      setNotice("Wait for the new table to finish adding before removing it.");
      return;
    }
    const tableCount = selected.filter((object) => object.table_id).length;
    const removal = tableCount
      ? `Remove ${selected.length} selected item${selected.length === 1 ? "" : "s"} from the floor plan? Table records will be deactivated, and active reservations or dining sessions will block removal.`
      : `Remove ${selected.length} selected item${selected.length === 1 ? "" : "s"} from the floor plan?`;
    if (
      !(await confirm(removal, {
        title: "Remove selected items?",
        confirmLabel: "Remove items",
        destructive: true,
      }))
    )
      return;
    dirty.current = true;
    setError("");
    setBusyAction("Removing items");
    try {
      await Promise.all(
        selected
          .filter((object) => object.id)
          .map((object) =>
            api(`/admin/floor-plan/objects/${object.id}`, { method: "DELETE" }),
          ),
      );
      const ids = new Set(selected.map((object) => object.id ?? object._key));
      setObjects((rows) =>
        rows.filter((object) => !ids.has(object.id ?? object._key)),
      );
      undoStack.current = [];
      setContextMenu(null);
      setNotice(
        `${selected.length} layout item${selected.length === 1 ? "" : "s"} removed from this draft.`,
      );
    } catch (e) {
      setError(e.message);
      dirty.current = false;
      load(true);
    } finally {
      setBusyAction("");
    }
  }
  useEffect(() => {
    function onKeyDown(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r") {
        event.preventDefault();
        event.stopPropagation();
        setNotice(
          dirty.current
            ? "Your floor plan has unsaved changes. Save the draft before refreshing; press R to rotate selected items."
            : "Ctrl+R refresh is disabled in the floor-plan editor. Use R to rotate selected items.",
        );
        return;
      }
      if (
        event.target instanceof HTMLElement &&
        ["INPUT", "SELECT", "TEXTAREA"].includes(event.target.tagName)
      )
        return;
      if (event.code === "Space") {
        spaceHeld.current = true;
        event.preventDefault();
        return;
      }
      if (event.key === "Escape") {
        setContextMenu(null);
        setSelectionBox(null);
        return;
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "c" &&
        objects.some((object) => object._selected)
      ) {
        event.preventDefault();
        copySelectedObjects();
        setNotice(
          `${clipboard.current.length} item${clipboard.current.length === 1 ? "" : "s"} copied.`,
        );
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "x" &&
        objects.some((object) => object._selected)
      ) {
        event.preventDefault();
        cutSelectedObjects();
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "v" &&
        clipboard.current.length
      ) {
        event.preventDefault();
        // Place the copied group beside the current selection while preserving its layout.
        pasteCopiedObjects();
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === "z"
      ) {
        event.preventDefault();
        undo();
      }
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        objects.some((object) => object._selected)
      ) {
        event.preventDefault();
        deleteSelected();
      }
      if (
        !event.ctrlKey &&
        !event.metaKey &&
        event.key.toLowerCase() === "r" &&
        objects.some((object) => object._selected)
      ) {
        event.preventDefault();
        rememberUndo();
        setObjects((rows) =>
          rows.map((object) =>
            object._selected
              ? {
                  ...object,
                  rotation: {
                    ...object.rotation,
                    y:
                      ((object.rotation?.y || 0) + Math.PI / 4) % (2 * Math.PI),
                  },
                }
              : object,
          ),
        );
        dirty.current = true;
      }
    }
    function onKeyUp(event) {
      if (event.code === "Space") spaceHeld.current = false;
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onKeyUp);
    };
  }, [objects]);
  async function save() {
    if (pendingAdds) {
      setNotice("Wait for new items to finish adding before saving the draft.");
      return;
    }
    setBusyAction("Saving draft");
    try {
      if (pendingDeleteIds.current.length) {
        await Promise.all(
          pendingDeleteIds.current.map((id) =>
            api(`/admin/floor-plan/objects/${id}`, { method: "DELETE" }),
          ),
        );
        pendingDeleteIds.current = [];
      }
      const d = await api(`/admin/floor-plan/floors/${floor.id}/layout`, {
        method: "PUT",
        body: JSON.stringify({
          objects: objects.map((o) => ({
            id: o.id || null,
            table_id: o.table_id || null,
            object_type: o.object_type,
            label: o.label,
            position: o.position,
            rotation: o.rotation,
            dimensions: o.dimensions,
            properties: o.properties,
          })),
        }),
      });
      setFloors((rows) => rows.map((f) => (f.id === d.data.id ? d.data : f)));
      setObjects(d.data.objects || []);
      undoStack.current = [];
      pendingDeleteIds.current = [];
      dirty.current = false;
      setNotice("Draft saved. Publish when the preview looks right.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyAction("");
    }
  }
  async function publish() {
    if (pendingAdds) {
      setNotice(
        "Wait for new items to finish adding before publishing the layout.",
      );
      return;
    }
    if (
      !(await confirm(
        "Customers will see this floor plan once it is published.",
        { title: "Publish this layout?", confirmLabel: "Publish layout" },
      ))
    )
      return;
    setBusyAction("Publishing layout");
    try {
      if (pendingDeleteIds.current.length) {
        await Promise.all(
          pendingDeleteIds.current.map((id) =>
            api(`/admin/floor-plan/objects/${id}`, { method: "DELETE" }),
          ),
        );
        pendingDeleteIds.current = [];
      }
      const d = await api(`/admin/floor-plan/floors/${floor.id}/publish`, {
        method: "POST",
      });
      setFloors((rows) => rows.map((f) => (f.id === d.data.id ? d.data : f)));
      setObjects(d.data.objects || []);
      undoStack.current = [];
      dirty.current = false;
      setNotice("Floor plan published for customers.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyAction("");
    }
  }
  async function saveTable(o) {
    setBusyAction("Saving table setup");
    try {
      const d = await api(`/admin/floor-plan/tables/${o.table_id}`, {
        method: "PUT",
        body: JSON.stringify({
          table_number: o.table.table_number,
          capacity: Number(o.table.capacity),
          zone: o.table.zone || null,
          is_active: o.table.is_active ?? true,
        }),
      });
      setObjects((rows) =>
        rows.map((row) =>
          row.table_id === o.table_id ? { ...row, table: d.data } : row,
        ),
      );
      undoStack.current = [];
      setNotice("Table setup saved.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyAction("");
    }
  }
  const selectedObjects = objects.filter((o) => o._selected);
  return (
    <section className="welcome floor-editor">
      <span className="eyebrow">RESTAURANT LAYOUT</span>
      <h1>Floor plan editor</h1>
      <p>
        Drag objects on the 2D editor to position. Rotate and resize selected
        objects, save the draft, preview, then publish.
      </p>
      {loading && <Skeleton label="Loading your content" />}
      {!loading && !error && floors.length === 0 && (
        <EmptyState
          title="Create your restaurant layout"
          description="Add a floor, arrange your tables, then publish when everything is ready."
        />
      )}
      {error && <Feedback onRetry={load}>{error}</Feedback>}
      {notice && <Feedback tone="success">{notice}</Feedback>}
      <div className="floor-editor-toolbar">
        <div
          className="floor-toolbar-group floor-toolbar-floors"
          role="group"
          aria-label="Floor management"
        >
          <span className="floor-toolbar-label">Floor</span>
          <select
            aria-label="Floor"
            value={floorId}
            disabled={Boolean(busyAction) || pendingAdds > 0}
            onChange={(e) => setFloorId(e.target.value)}
          >
            {floors.length === 0 && <option value="">No floors yet</option>}
            {floors.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
                {f.is_published ? " · published" : " · draft"}
              </option>
            ))}
          </select>
          <button
            className="floor-action-secondary"
            onClick={addFloor}
            disabled={Boolean(busyAction)}
          >
            Add floor
          </button>
          {floor && (
            <button
              className="floor-action-delete"
              onClick={deleteDraftFloor}
              disabled={
                floor.is_published || pendingAdds > 0 || Boolean(busyAction)
              }
              title={
                floor.is_published
                  ? "Save this published floor as a draft before deleting it"
                  : pendingAdds
                    ? "Wait for new items to finish adding"
                    : `Delete draft floor ${floor.name}`
              }
            >
              Delete draft floor
            </button>
          )}
        </div>
        {floor && (
          <>
            <div
              className="floor-toolbar-group floor-toolbar-actions"
              role="group"
              aria-label="Layout actions"
            >
              <button
                className="floor-action-secondary"
                onClick={() => setPreview(!preview)}
                disabled={pendingAdds > 0 || Boolean(busyAction)}
              >
                {preview ? "Edit layout" : "Preview 3D"}
              </button>
              <button
                className="floor-action-primary"
                onClick={save}
                disabled={pendingAdds > 0 || Boolean(busyAction)}
                title={
                  pendingAdds
                    ? "Wait for new items to finish adding"
                    : "Save this draft"
                }
              >
                Save draft
              </button>
              <button
                className="floor-action-publish"
                onClick={publish}
                disabled={pendingAdds > 0 || Boolean(busyAction)}
                title={
                  pendingAdds
                    ? "Wait for new items to finish adding"
                    : "Publish this layout"
                }
              >
                Publish layout
              </button>
            </div>
            <div
              className="floor-toolbar-group floor-toolbar-library"
              role="group"
              aria-label="Add to layout"
            >
              <span className="floor-toolbar-label">Add to layout</span>
              <details className="builder-menu" name="floor-editor-popover">
                <summary>Object library</summary>
                <div className="builder-menu-popover">
                  <strong className="builder-popover-title">
                    Add an object
                  </strong>
                  <section>
                    <strong>Tables & seating</strong>
                    <button onClick={() => addTable("short")}>
                      Add round table
                    </button>
                    <button onClick={() => addTable("long")}>
                      Add rectangular table
                    </button>
                  </section>
                  <section>
                    <strong>Room structure</strong>
                    <button onClick={() => addObject("wall", { width: 8 })}>
                      Add long wall
                    </button>
                    <button onClick={() => addObject("wall", { width: 4 })}>
                      Add short wall
                    </button>
                    <button onClick={() => addObject("door")}>Add door</button>
                    <button onClick={() => addObject("entrance")}>
                      Add entry marker
                    </button>
                  </section>
                  <section>
                    <strong>Room finish & decor</strong>
                    <button onClick={() => addObject("flooring")}>
                      Add floor panel
                    </button>
                    <button onClick={() => addObject("counter")}>
                      Add counter
                    </button>
                    <button onClick={() => addObject("furniture")}>
                      Add furniture
                    </button>
                  </section>
                </div>
              </details>
              <details
                className="builder-menu builder-presets-menu"
                name="floor-editor-popover"
              >
                <summary>
                  Table templates{presets.length ? ` · ${presets.length}` : ""}
                </summary>
                <div className="builder-menu-popover">
                  <strong className="builder-popover-title">
                    Your table templates
                  </strong>
                  {presets.length ? (
                    presets.map((preset) => (
                      <div className="preset-menu-row" key={preset.id}>
                        <div>
                          <b>{preset.name}</b>
                          <small>
                            {preset.definition.type === "group"
                              ? `${preset.definition.objects?.length || 0} layout items`
                              : `${preset.definition.shape === "long" ? "Rectangular" : "Round"} · ${preset.definition.capacity} seats`}
                          </small>
                        </div>
                        <button onClick={() => addPreset(preset)}>
                          Add preset
                        </button>
                        <button
                          className="preset-delete"
                          aria-label={`Delete ${preset.name}`}
                          title={`Delete ${preset.name}`}
                          onClick={() => deletePreset(preset)}
                        >
                          ×
                        </button>
                      </div>
                    ))
                  ) : (
                    <small>
                      No saved presets yet. Select a table to save a table
                      preset, or select multiple items to save a layout preset.
                    </small>
                  )}
                </div>
              </details>
            </div>
            <div
              className="floor-toolbar-group floor-toolbar-canvas"
              role="group"
              aria-label="Arrange objects"
            >
              <label className="snap-toggle">
                <input
                  type="checkbox"
                  checked={snapToGrid}
                  onChange={(e) => setSnapToGrid(e.target.checked)}
                />
                Snap to grid
              </label>
              <button
                className="floor-action-secondary"
                onClick={alignObjectsToGrid}
                disabled={
                  !objects.length || pendingAdds > 0 || Boolean(busyAction)
                }
                title="Align every object to the nearest grid block"
              >
                Align objects
              </button>
              <button
                className="floor-action-secondary"
                onClick={undo}
                disabled={
                  !undoStack.current.length ||
                  pendingAdds > 0 ||
                  Boolean(busyAction)
                }
                title="Undo the last floor-plan edit (Ctrl+Z)"
              >
                Undo
              </button>
              <details
                className="builder-menu floor-shortcuts"
                name="floor-editor-popover"
              >
                <summary>Shortcuts</summary>
                <div className="builder-menu-popover">
                  <strong className="builder-popover-title">
                    Keyboard shortcuts
                  </strong>
                  <p>Ctrl/Shift-click or drag to select multiple objects.</p>
                  <p>Ctrl+C / X / V to copy, cut, and paste. Ctrl+Z to undo.</p>
                  <p>R to rotate. Delete to remove.</p>
                </div>
              </details>
            </div>
          </>
        )}
      </div>
      {(busyAction || pendingAdds > 0) && (
        <div className="floor-work-indicator" role="status" aria-live="polite">
          <LoaderCircle size={17} className="spin" aria-hidden="true" />
          <span>
            {pendingAdds > 0
              ? `Adding ${pendingAdds} item${pendingAdds === 1 ? "" : "s"}…`
              : `${busyAction}…`}
          </span>
          <i aria-hidden="true">
            <b />
          </i>
        </div>
      )}
      {floor && !preview && (
        <div
          ref={boardRef}
          className={`editor-board${boardFull ? " is-fullscreen" : ""}${handMode ? " is-hand" : ""}`}
          onPointerDownCapture={trackPointer}
          onPointerMoveCapture={pinchMove}
          onPointerUpCapture={releasePointer}
          onPointerCancelCapture={releasePointer}
          onPointerDown={startCanvasPan}
          onPointerMove={moveGesture}
          onPointerUp={finishGesture}
          onPointerCancel={finishGesture}
          style={{
            "--floor-zoom": zoom,
            "--floor-pan-x": `${pan.x}%`,
            "--floor-pan-y": `${pan.y}%`,
            "--floor-grid-x": `${Math.max(1, Math.min((boardSize.width * 0.9) / 20, (boardSize.height * 0.9) / 16) * zoom)}px`,
            "--floor-grid-y": `${Math.max(1, Math.min((boardSize.width * 0.9) / 20, (boardSize.height * 0.9) / 16) * zoom)}px`,
            "--floor-grid-major-x": `${Math.max(5, Math.min((boardSize.width * 0.9) / 20, (boardSize.height * 0.9) / 16) * 5 * zoom)}px`,
            "--floor-grid-major-y": `${Math.max(5, Math.min((boardSize.width * 0.9) / 20, (boardSize.height * 0.9) / 16) * 5 * zoom)}px`,
            "--floor-pan-x-px": `${(pan.x / 100) * boardSize.width}px`,
            "--floor-pan-y-px": `${(pan.y / 100) * boardSize.height}px`,
          }}
        >
          {objects.map((o) => (
            <button
              key={o.id || o._key}
              onPointerDown={(e) => startObjectDrag(e, o)}
              onClick={(e) => {
                if (suppressClick.current) {
                  suppressClick.current = false;
                  return;
                }
                selectObject(
                  o.id ?? o._key,
                  e.ctrlKey || e.metaKey
                    ? "toggle"
                    : e.shiftKey
                      ? "add"
                      : "replace",
                );
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const rect = boardRef.current.getBoundingClientRect();
                selectObject(o.id ?? o._key);
                setContextMenu({
                  id: o.id ?? o._key,
                  x: Math.min(e.clientX - rect.left, rect.width - 170),
                  y: Math.min(e.clientY - rect.top, rect.height - 90),
                });
              }}
              data-object-key={String(o.id ?? o._key)}
              style={{
                left: `calc(50% + ${(o.position?.x || 0) * Math.max(1, Math.min((boardSize.width * 0.9) / 20, (boardSize.height * 0.9) / 16) * zoom)}px + ${pan.x}%)`,
                top: `calc(50% + ${(o.position?.z || 0) * Math.max(1, Math.min((boardSize.width * 0.9) / 20, (boardSize.height * 0.9) / 16) * zoom)}px + ${pan.y}%)`,
                transform: `translate(-50%,-50%) rotate(${-(o.rotation?.y || 0)}rad)`,
                "--object-width":
                  o.dimensions?.width ??
                  (o.properties?.table_shape === "long" ? 2.4 : 1.45),
                "--object-depth":
                  o.dimensions?.depth ??
                  (o.properties?.table_shape === "long" ? 1.15 : 1.45),
              }}
              className={`editor-object ${o.object_type} ${o.properties?.table_shape || "short"} status-${o.table?.operational_status || "available"} ${o._selected ? "selected" : ""} ${o._pending ? "is-pending" : ""}`}
              title={
                o.table_id
                  ? `${o.table?.operational_status || "available"} · ${o.table?.capacity || o.properties?.capacity || 2} seats`
                  : o.object_type
              }
              aria-label={
                o.table_id
                  ? `${o.table?.table_number || o.label}, ${o.table?.operational_status || "available"}, capacity ${o.table?.capacity || 2}`
                  : o.label || o.object_type
              }
            >
              {o.object_type === "table" &&
                chairPositions(
                  o.properties?.table_shape || "short",
                  o.table?.capacity || o.properties?.capacity || 2,
                  o.properties?.chair_layout,
                  o.dimensions,
                ).map((seat, i) => (
                  <i
                    key={i}
                    className="editor-chair"
                    style={{
                      left: `${50 + (seat.x / (o.dimensions?.width || 1.45)) * 100}%`,
                      top: `${50 + (seat.z / (o.dimensions?.depth || 1.45)) * 100}%`,
                      transform: `translate(-50%, -50%) rotate(${-seat.rotation}rad)`,
                    }}
                  />
                ))}
              <span>
                {o.object_type === "flooring"
                  ? ""
                  : o.table?.table_number || o.label || o.object_type}
              </span>
            </button>
          ))}
          <div
            className="editor-map-controls"
            aria-label="Floor plan navigation"
          >
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() =>
                setZoom((z) => Math.min(2.2, Number((z + 0.15).toFixed(2))))
              }
              aria-label="Zoom in"
              title="Zoom in"
            >
              +
            </button>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() =>
                setZoom((z) => Math.max(0.55, Number((z - 0.15).toFixed(2))))
              }
              aria-label="Zoom out"
              title="Zoom out"
            >
              −
            </button>
            <label className="editor-zoom-slider">
              <span>{Math.round(zoom * 100)}%</span>
              <input
                type="range"
                min="0.55"
                max="2.2"
                step="0.05"
                value={zoom}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => setZoom(Number(e.target.value))}
                aria-label="Canvas zoom"
                title="Adjust canvas zoom"
              />
            </label>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
              aria-label="Reset view"
              title="Reset view"
            >
              Reset
            </button>
            <button
              type="button"
              className="editor-tool-toggle"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setHandMode((value) => !value)}
              aria-pressed={handMode}
              aria-label="Hand tool: drag to move the view"
              title="Hand tool: drag to move the view"
            >
              <Hand size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="editor-tool-toggle"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setBoardFull((value) => !value)}
              aria-pressed={boardFull}
              aria-label={boardFull ? "Exit full screen" : "Full screen"}
              title={boardFull ? "Exit full screen" : "Full screen"}
            >
              {boardFull ? (
                <Minimize2 size={16} aria-hidden="true" />
              ) : (
                <Maximize2 size={16} aria-hidden="true" />
              )}
            </button>
          </div>
          {boardFull && (
            <aside
              className="editor-full-card"
              aria-label="Add to layout"
              onPointerDown={(e) => e.stopPropagation()}
              onPointerDownCapture={(e) => e.stopPropagation()}
            >
              <div className="editor-full-card-head">
                <strong>Add to layout</strong>
                <button
                  type="button"
                  className="editor-full-done"
                  onClick={() => setBoardFull(false)}
                >
                  Done
                </button>
              </div>
              <div className="editor-full-add">
                {[
                  ["Round table", () => addTable("short")],
                  ["Long table", () => addTable("long")],
                  ["Long wall", () => addObject("wall", { width: 8 })],
                  ["Short wall", () => addObject("wall", { width: 4 })],
                  ["Door", () => addObject("door")],
                  ["Entry", () => addObject("entrance")],
                  ["Floor panel", () => addObject("flooring")],
                  ["Counter", () => addObject("counter")],
                  ["Furniture", () => addObject("furniture")],
                ].map(([label, add]) => (
                  <button
                    type="button"
                    key={label}
                    onClick={add}
                    disabled={Boolean(busyAction)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="editor-full-actions">
                {objects.some((object) => object._selected) && (
                  <>
                    <button
                      type="button"
                      onClick={rotateSelected}
                      aria-label="Rotate selected"
                      title="Rotate selected"
                    >
                      <RotateCw size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const item = objects.find((row) => row._selected);
                        if (item) duplicateObject(item);
                      }}
                      aria-label="Duplicate selected"
                      title="Duplicate selected"
                    >
                      <Copy size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      data-tone="danger"
                      onClick={deleteSelected}
                      aria-label="Delete selected"
                      title="Delete selected"
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={undo}
                  disabled={
                    !undoStack.current.length ||
                    pendingAdds > 0 ||
                    Boolean(busyAction)
                  }
                  aria-label="Undo"
                  title="Undo"
                >
                  <Undo2 size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="editor-full-save"
                  onClick={save}
                  disabled={pendingAdds > 0 || Boolean(busyAction)}
                >
                  Save draft
                </button>
              </div>
            </aside>
          )}
          <div
            className="editor-status-legend"
            aria-label="Table status legend"
          >
            {[
              ["available", "Available"],
              ["reserved", "Reserved"],
              ["occupied", "Occupied"],
              ["cleaning", "Cleaning"],
              ["unavailable", "Unavailable"],
            ].map(([key, label]) => (
              <span key={key}>
                <i className={`status-${key}`} />
                {label}
              </span>
            ))}
          </div>
          <span className="editor-board-hint">
            Drag to move · objects snap one block at a time · Ctrl/Shift-click
            to select · drag empty space or use the hand to pan · pinch or
            scroll to zoom
          </span>
          <span className="editor-room-label">Room area · 20 × 16 units</span>
          {selectionBox && (
            <div className="editor-selection-box" style={selectionBox} />
          )}
          {contextMenu && (
            <div
              className="editor-context-menu"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => {
                  const item = objects.find(
                    (row) =>
                      String(row.id ?? row._key) === String(contextMenu.id),
                  );
                  if (item) duplicateObject(item);
                }}
              >
                Duplicate
              </button>
              <button onClick={deleteSelected}>Delete selected</button>
            </div>
          )}
        </div>
      )}
      {floor && preview && (
        <Suspense
          fallback={
            <div className="floor-scene scene-loading">Loading preview…</div>
          }
        >
          <FloorScene
            objects={objects}
            selectedId={previewSelectedId}
            selectLayoutObjects
            onSelect={(id) => {
              // Tapping the selected object again lets it go.
              if (String(previewSelectedId) === String(id)) {
                setPreviewSelectedId(null);
                setObjects((rows) =>
                  rows.map((row) =>
                    row._selected ? { ...row, _selected: false } : row,
                  ),
                );
                return;
              }
              setPreviewSelectedId(id);
              selectObject(id);
              setInspectorCollapsed(false);
            }}
          />
        </Suspense>
      )}
      {floor && (
        <section
          className={`editor-selection ${inspectorCollapsed ? "is-collapsed" : ""}`}
          aria-label="Selected object settings"
        >
          <button
            className="editor-inspector-toggle"
            onClick={() => setInspectorCollapsed((value) => !value)}
            aria-expanded={!inspectorCollapsed}
          >
            <strong>Properties</strong>
            <span>
              {selectedObjects.length
                ? `${selectedObjects.length} selected`
                : "No selection"}
            </span>
            <b>{inspectorCollapsed ? "Expand" : "Collapse"}</b>
          </button>
          {!inspectorCollapsed && (
            <>
              {selectedObjects.length > 1 && (
                <>
                  <p className="editor-inspector-empty">
                    {selectedObjects.length} items selected. Drag any selected
                    item to move the group, press R to rotate, or remove them
                    below.
                  </p>
                  <button
                    className="editor-save-details"
                    onClick={saveSelectionAsPreset}
                    disabled={selectedObjects.some(
                      (item) => item._pending || Boolean(busyAction),
                    )}
                  >
                    Save selection as preset
                  </button>
                  <button
                    className="editor-remove-items"
                    onClick={deleteSelected}
                    disabled={selectedObjects.some((item) => item._pending)}
                  >
                    Remove selected ({selectedObjects.length})
                  </button>
                </>
              )}
              {selectedObjects.length === 1 &&
                selectedObjects.map((o) => (
                  <div key={o.id || o._key}>
                    <strong>
                      Selected:{" "}
                      {o.table?.table_number || o.label || o.object_type}
                    </strong>
                    <small className="floor-editor-helper">
                      Drag the object to place it. Use these fields for precise
                      adjustments.
                    </small>
                    {!o.table_id && (
                      <label>
                        Object label
                        <input
                          value={o.label || ""}
                          onChange={(e) =>
                            update(o.id ?? o._key, { label: e.target.value })
                          }
                        />
                      </label>
                    )}
                    {o.table_id && (
                      <>
                        <label>
                          Table shape
                          <select
                            value={o.properties?.table_shape || "short"}
                            onChange={(e) => {
                              const shape = e.target.value;
                              update(o.id ?? o._key, {
                                properties: {
                                  ...o.properties,
                                  table_shape: shape,
                                  chair_layout: defaultChairLayout(
                                    shape,
                                    o.table?.capacity || 2,
                                  ),
                                },
                                dimensions:
                                  shape === "long"
                                    ? {
                                        ...o.dimensions,
                                        width: 2.4,
                                        depth: 1.15,
                                      }
                                    : {
                                        ...o.dimensions,
                                        width: 1.45,
                                        depth: 1.45,
                                      },
                              });
                            }}
                          >
                            <option value="short">Short / round</option>
                            <option value="long">Long / rectangular</option>
                          </select>
                        </label>
                        <label>
                          Table number
                          <input
                            value={o.table?.table_number || ""}
                            onChange={(e) =>
                              update(o.id ?? o._key, {
                                table: {
                                  ...o.table,
                                  table_number: e.target.value,
                                },
                              })
                            }
                          />
                        </label>
                        <label>
                          Capacity
                          <input
                            type="number"
                            step="1"
                            min="1"
                            max="12"
                            inputMode="numeric"
                            aria-label="Table capacity, 1 to 12 seats"
                            value={o.table?.capacity ?? 2}
                            onChange={(e) =>
                              setTableCapacity(o, e.target.value)
                            }
                            onBlur={() => {
                              if (!o.table?.capacity) setTableCapacity(o, "1");
                            }}
                          />
                        </label>
                        <label>
                          Zone
                          <input
                            value={o.table?.zone || ""}
                            onChange={(e) =>
                              update(o.id ?? o._key, {
                                table: { ...o.table, zone: e.target.value },
                              })
                            }
                          />
                        </label>
                        <fieldset className="chair-layout-controls">
                          <legend>Chair arrangement</legend>
                          {o.properties?.table_shape === "long" ? (
                            <>
                              <small className="chair-layout-help">
                                Set seats on each side. Total seats follow the
                                side counts (maximum 12).
                              </small>
                              {["top", "bottom", "left", "right"].map(
                                (side) => (
                                  <label key={side}>
                                    {side}
                                    <input
                                      type="number"
                                      min="0"
                                      max="12"
                                      step="1"
                                      inputMode="numeric"
                                      value={
                                        o.properties?.chair_layout?.[side] ??
                                        defaultChairLayout(
                                          "long",
                                          o.table?.capacity || 2,
                                        )[side]
                                      }
                                      onChange={(e) =>
                                        setChairCount(o, side, e.target.value)
                                      }
                                    />
                                  </label>
                                ),
                              )}
                            </>
                          ) : (
                            <label>
                              Seats around
                              <input
                                type="number"
                                min="1"
                                max="12"
                                step="1"
                                inputMode="numeric"
                                aria-label="Seats around table, 1 to 12"
                                value={
                                  o.properties?.chair_layout?.around ??
                                  o.table?.capacity ??
                                  2
                                }
                                onChange={(e) =>
                                  setChairCount(o, "around", e.target.value)
                                }
                                onBlur={() => {
                                  if (!o.properties?.chair_layout?.around)
                                    setChairCount(o, "around", "1");
                                }}
                              />
                            </label>
                          )}
                        </fieldset>
                        <button
                          className="editor-save-details"
                          onClick={() => saveTable(o)}
                        >
                          Save table details
                        </button>
                        <button
                          className="editor-save-details"
                          onClick={() => saveAsPreset(o)}
                        >
                          Save as preset
                        </button>
                      </>
                    )}
                    <div className="editor-transform-fields">
                      <label>
                        Position X
                        <input
                          type="number"
                          step={snapToGrid ? "1" : "0.1"}
                          value={Number((o.position?.x || 0).toFixed(2))}
                          onChange={(e) =>
                            update(o.id ?? o._key, {
                              position: {
                                ...o.position,
                                x: snapToGrid
                                  ? Math.round(Number(e.target.value) || 0)
                                  : Number(e.target.value) || 0,
                              },
                            })
                          }
                        />
                      </label>
                      <label>
                        Position Z
                        <input
                          type="number"
                          step={snapToGrid ? "1" : "0.1"}
                          value={Number((o.position?.z || 0).toFixed(2))}
                          onChange={(e) =>
                            update(o.id ?? o._key, {
                              position: {
                                ...o.position,
                                z: snapToGrid
                                  ? Math.round(Number(e.target.value) || 0)
                                  : Number(e.target.value) || 0,
                              },
                            })
                          }
                        />
                      </label>
                      <label className="editor-rotation-field">
                        Rotation ·{" "}
                        {Math.round(
                          (((((o.rotation?.y || 0) * 180) / Math.PI) % 360) +
                            360) %
                            360,
                        )}
                        °
                        <input
                          type="range"
                          min="0"
                          max="345"
                          step="15"
                          value={
                            Math.round(
                              ((((((o.rotation?.y || 0) * 180) / Math.PI) %
                                360) +
                                360) %
                                360) /
                                15,
                            ) * 15
                          }
                          onChange={(e) =>
                            update(o.id ?? o._key, {
                              rotation: {
                                ...o.rotation,
                                y: (Number(e.target.value) * Math.PI) / 180,
                              },
                            })
                          }
                        />
                      </label>
                      {o.object_type !== "table" && (
                        <>
                          <label>
                            Width
                            <input
                              type="number"
                              min="0"
                              max="30"
                              step="0.1"
                              value={o.dimensions?.width ?? 1}
                              onChange={(e) =>
                                update(o.id ?? o._key, {
                                  dimensions: {
                                    ...o.dimensions,
                                    width:
                                      e.target.value === ""
                                        ? ""
                                        : Math.max(
                                            0,
                                            Number(e.target.value) || 0,
                                          ),
                                  },
                                })
                              }
                              onBlur={() => {
                                if (o.dimensions?.width === "")
                                  update(o.id ?? o._key, {
                                    dimensions: { ...o.dimensions, width: 0 },
                                  });
                              }}
                            />
                          </label>
                          <label>
                            Depth
                            <input
                              type="number"
                              min="0"
                              max="30"
                              step="0.1"
                              value={o.dimensions?.depth ?? 1}
                              onChange={(e) =>
                                update(o.id ?? o._key, {
                                  dimensions: {
                                    ...o.dimensions,
                                    depth:
                                      e.target.value === ""
                                        ? ""
                                        : Math.max(
                                            0,
                                            Number(e.target.value) || 0,
                                          ),
                                  },
                                })
                              }
                              onBlur={() => {
                                if (o.dimensions?.depth === "")
                                  update(o.id ?? o._key, {
                                    dimensions: { ...o.dimensions, depth: 0 },
                                  });
                              }}
                            />
                          </label>
                        </>
                      )}
                    </div>
                    <button
                      className="editor-remove-items"
                      onClick={deleteSelected}
                      disabled={o._pending}
                    >
                      Remove item from floor
                    </button>
                  </div>
                ))}
              {selectedObjects.length === 0 && (
                <p className="editor-inspector-empty">
                  Select a table or layout object to edit it. Drag items on the
                  canvas to arrange the floor.
                </p>
              )}
            </>
          )}
        </section>
      )}
    </section>
  );
}

export function ReservationSettings() {
  const [loading, setLoading] = useState(true),
    [initialError, setInitialError] = useState(""),
    [attempt, setAttempt] = useState(0);

  const [form, setForm] = useState({
    open_time: "10:00",
    close_time: "22:00",
    duration_minutes: 90,
    buffer_minutes: 30,
    booking_window_days: 60,
    grace_minutes: 15,
    cancellation_cutoff_hours: 4,
    automatic_confirmation: true,
    automatic_table_assignment: true,
    deposit_required: false,
    deposit_amount: 0,
  });
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [receiveForm] = useLiveSettings(
    () => api("/admin/reservation-policy").then((r) => r.data),
    form,
    setForm,
  );
  useEffect(() => {
    setLoading(true);
    setInitialError("");
    setError("");
    api("/admin/reservation-policy")
      .then((d) => receiveForm(d.data))
      .catch((e) => {
        setError(e.message);
        setInitialError(e.message);
      })
      .finally(() => setLoading(false));
  }, [attempt]);
  async function save(e) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    const data = { ...form };
    for (const key of [
      "duration_minutes",
      "buffer_minutes",
      "booking_window_days",
      "grace_minutes",
      "cancellation_cutoff_hours",
      "deposit_amount",
    ])
      data[key] = Number(data[key]);
    for (const key of [
      "automatic_confirmation",
      "automatic_table_assignment",
      "deposit_required",
    ])
      data[key] = Boolean(data[key]);
    try {
      const d = await api("/admin/reservation-policy", {
        method: "PUT",
        body: JSON.stringify(data),
      });
      receiveForm(d.data);
      setDirty(false);
      setNotice("Reservation policy saved.");
    } catch (ex) {
      setError(ex.message);
    } finally {
      setSaving(false);
    }
  }
  if (loading || initialError)
    return (
      <section className="welcome">
        <h1>Reservation settings</h1>
        {loading ? (
          <Skeleton label="Loading reservation settings" />
        ) : (
          <Feedback onRetry={() => setAttempt((value) => value + 1)}>
            {initialError}
          </Feedback>
        )}
      </section>
    );
  function change(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setNotice("");
  }
  const field = (key, label, help, type = "number", min, max) => (
    <label className="reservation-setting-field">
      <span id={`reservation-policy-${key}-label`}>{label}</span>
      <input
        name={key}
        aria-labelledby={`reservation-policy-${key}-label`}
        aria-describedby={`reservation-policy-${key}-help`}
        type={type}
        min={min}
        max={max}
        required
        step={key === "deposit_amount" ? "0.01" : undefined}
        value={form[key] ?? ""}
        onChange={(event) => change(key, event.target.value)}
      />
      <small id={`reservation-policy-${key}-help`}>{help}</small>
    </label>
  );
  const toggle = (key, label, help) => (
    <label className="reservation-setting-toggle">
      <span>
        <strong id={`reservation-policy-${key}-label`}>{label}</strong>
        <small id={`reservation-policy-${key}-help`}>{help}</small>
      </span>
      <input
        type="checkbox"
        name={key}
        aria-labelledby={`reservation-policy-${key}-label`}
        aria-describedby={`reservation-policy-${key}-help`}
        checked={!!form[key]}
        onChange={(event) => change(key, event.target.checked)}
      />
    </label>
  );
  const heading = (Icon, title, description) => (
    <header className="reservation-settings-card-heading">
      <span className="reservation-settings-icon">
        <Icon size={19} aria-hidden="true" />
      </span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </header>
  );
  const cycleMinutes =
    Number(form.duration_minutes || 0) + Number(form.buffer_minutes || 0);
  return (
    <section className="welcome reservation-settings-page">
      <div className="reservation-settings-intro">
        <span className="eyebrow">RESTAURANT POLICY</span>
        <h1>Reservation settings</h1>
        <p>
          Shape your booking experience, from the first reservation to the next
          seating.
        </p>
      </div>
      {error && <Feedback>{error}</Feedback>}
      {notice && <Feedback tone="success">{notice}</Feedback>}
      <form
        className="reservation-settings-form"
        onSubmit={save}
        data-state={dirty ? "dirty" : "saved"}
        aria-busy={saving}
      >
        <fieldset className="reservation-settings-controls" disabled={saving}>
          <legend className="sr-only">Reservation policy</legend>
          <div className="reservation-settings-grid">
            <section
              className="reservation-settings-card"
              aria-label="Booking availability"
            >
              {heading(
                CalendarDays,
                "Booking availability",
                "Choose when guests can book a table.",
              )}
              <div className="reservation-settings-fields">
                {field(
                  "open_time",
                  "Opens",
                  "First booking time of the day.",
                  "time",
                )}
                {field(
                  "close_time",
                  "Closes",
                  "Reservations must finish by this time.",
                  "time",
                )}
                {field(
                  "booking_window_days",
                  "Booking window (days)",
                  "How far ahead guests can reserve.",
                  "number",
                  1,
                  365,
                )}
                {field(
                  "cancellation_cutoff_hours",
                  "Cancellation cutoff (hours)",
                  "How long before arrival guests can cancel.",
                  "number",
                  0,
                  168,
                )}
              </div>
            </section>
            <section
              className="reservation-settings-card"
              aria-label="Table timing"
            >
              {heading(
                Clock3,
                "Table timing",
                "Give each party time to dine and your team time to reset.",
              )}
              <div className="reservation-settings-fields">
                {field(
                  "duration_minutes",
                  "Reservation duration (minutes)",
                  "Time allocated to each reservation.",
                  "number",
                  30,
                  360,
                )}
                {field(
                  "buffer_minutes",
                  "Turnaround buffer (minutes)",
                  "Reset time between reservations.",
                  "number",
                  0,
                  240,
                )}
                {field(
                  "grace_minutes",
                  "Late arrival grace (minutes)",
                  "Time allowed for guests arriving late.",
                  "number",
                  0,
                  120,
                )}
              </div>
              <div className="reservation-turnover-summary">
                <Clock3 size={17} aria-hidden="true" />
                <span>
                  <strong>{cycleMinutes} minutes per table cycle</strong>
                  <small>
                    {form.duration_minutes || 0} minutes dining +{" "}
                    {form.buffer_minutes || 0} minutes turnaround
                  </small>
                </span>
              </div>
            </section>
            <section
              className="reservation-settings-card"
              aria-label="Booking handling"
            >
              {heading(
                Settings2,
                "Booking handling",
                "Decide how reservations are confirmed and assigned.",
              )}
              <div className="reservation-settings-toggles">
                {toggle(
                  "automatic_confirmation",
                  "Automatically confirm bookings",
                  "Confirm eligible reservations as soon as guests book.",
                )}
                {toggle(
                  "automatic_table_assignment",
                  "Allow automatic table assignment",
                  "Let guests ask the system to choose a suitable table.",
                )}
              </div>
            </section>
            <section
              className="reservation-settings-card"
              aria-label="Reservation deposits"
            >
              {heading(
                CreditCard,
                "Reservation deposits",
                "Choose whether a deposit is required when booking.",
              )}
              <div className="reservation-settings-toggles">
                {toggle(
                  "deposit_required",
                  "Require a reservation deposit",
                  "Ask guests to pay a deposit for their reservation.",
                )}
              </div>
              <div className="reservation-deposit-field">
                {form.deposit_required ? (
                  field(
                    "deposit_amount",
                    "Deposit per reservation (PHP)",
                    "Charged once per reservation, not per guest.",
                    "number",
                    1,
                    100000,
                  )
                ) : (
                  <p>
                    No deposit required. Guests can reserve without a deposit.
                  </p>
                )}
              </div>
            </section>
          </div>
        </fieldset>
        <footer className="reservation-settings-save">
          <div>
            <Check size={18} aria-hidden="true" />
            <span>
              <strong>{dirty ? "Unsaved changes" : "All changes saved"}</strong>
              <small>
                {dirty
                  ? "Save to apply your reservation policy."
                  : "Your current booking rules are up to date."}
              </small>
            </span>
          </div>
          <button type="submit" disabled={saving || !dirty}>
            <Save size={16} aria-hidden="true" />
            {saving ? "Saving…" : "Save reservation policy"}
          </button>
        </footer>
      </form>
    </section>
  );
}
