import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import "./datePicker.css";

const dayValue = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const parseDay = (value) => new Date(`${value}T12:00:00`);
const displayDay = (value) =>
  parseDay(value).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export function DatePicker({ label, value = "", min, max, onChange }) {
  const root = useRef(null),
    trigger = useRef(null),
    calendar = useRef(null);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() =>
    parseDay(value || dayValue(new Date())),
  );
  const [placement, setPlacement] = useState({});
  const year = month.getFullYear(),
    index = month.getMonth();
  const allowed = (day) => (!min || day >= min) && (!max || day <= max);
  function close() {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }
  function choose(day) {
    onChange(day);
    close();
  }
  function show() {
    if (open) return close();
    const rect = root.current.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 24);
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const showAbove = below < 360 && above > below;
    setPlacement({
      width,
      maxHeight: Math.max(180, showAbove ? above : below),
      overflowY: "auto",
      left:
        Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)) -
        rect.left,
      ...(showAbove
        ? { bottom: "calc(100% + 8px)" }
        : { top: "calc(100% + 8px)" }),
    });
    setMonth(parseDay(value || min || max || dayValue(new Date())));
    setOpen(true);
  }
  useEffect(() => {
    if (!open) return;
    const dismiss = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    const keyboard = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    const resize = () => setOpen(false);
    document.addEventListener("pointerdown", dismiss);
    root.current.addEventListener("keydown", keyboard);
    const current = root.current;
    window.addEventListener("resize", resize);
    (
      calendar.current?.querySelector('[aria-pressed="true"]:not(:disabled)') ||
      calendar.current?.querySelector("button[data-day]:not(:disabled)")
    )?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      current.removeEventListener("keydown", keyboard);
      window.removeEventListener("resize", resize);
    };
  }, [open]);
  function moveDay(event) {
    const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[
      event.key
    ];
    const current = event.target.dataset.day;
    if (!offset || !current) return;
    event.preventDefault();
    const next = parseDay(current);
    next.setDate(next.getDate() + offset);
    const target = calendar.current.querySelector(
      `[data-day="${dayValue(next)}"]:not(:disabled)`,
    );
    target?.focus();
  }
  const days = Array.from(
    { length: new Date(year, index + 1, 0).getDate() },
    (_, i) => new Date(year, index, i + 1),
  );
  const today = dayValue(new Date());
  return (
    <div className="date-picker" ref={root}>
      <button
        ref={trigger}
        type="button"
        className="date-picker-trigger"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={show}
      >
        <CalendarDays size={16} aria-hidden="true" />
        <span className={!value ? "is-placeholder" : ""}>
          {value ? displayDay(value) : "Select date"}
        </span>
      </button>
      {open && (
        <div
          className="date-picker-popover"
          role="dialog"
          aria-label={`Choose ${label.toLowerCase()} date`}
          style={placement}
          onBlur={(event) => {
            if (!root.current.contains(event.relatedTarget)) setOpen(false);
          }}
        >
          <div className="date-picker-heading">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setMonth(new Date(year, index - 1, 1, 12))}
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <strong>
              {month.toLocaleDateString([], { month: "long", year: "numeric" })}
            </strong>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setMonth(new Date(year, index + 1, 1, 12))}
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="date-picker-weekdays" aria-hidden="true">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="date-picker-days" ref={calendar} onKeyDown={moveDay}>
            {Array.from(
              { length: new Date(year, index, 1).getDay() },
              (_, i) => (
                <span key={`blank-${i}`} />
              ),
            )}
            {days.map((date) => {
              const day = dayValue(date);
              return (
                <button
                  key={day}
                  type="button"
                  data-day={day}
                  aria-label={displayDay(day)}
                  aria-pressed={day === value}
                  aria-current={day === today ? "date" : undefined}
                  disabled={!allowed(day)}
                  onClick={() => choose(day)}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
          <div className="date-picker-footer">
            <button type="button" onClick={() => choose("")}>
              Clear date
            </button>
            <button
              type="button"
              disabled={!allowed(today)}
              onClick={() => choose(today)}
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
