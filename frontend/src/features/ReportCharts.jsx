import { useCallback, useEffect, useRef, useState } from "react";
import { BarChart3 } from "lucide-react";
import { DeskIcon } from "../components/adminDesk";
import "./reportCharts.css";

// Categorical colours come from CSS (--report-series-1..4, validated for
// colour-blind separation on the light and dark card surfaces); each entity
// keeps its slot, so filtering never repaints the others.
const SLOTS = 4;

const peso = (value) =>
  `₱${Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "₱0", "₱2.5K", "₱12K", "₱1.2M" for axis ticks. */
export function compactPeso(value) {
  const n = Number(value || 0);
  if (n >= 1e6) return `₱${(n / 1e6).toFixed(n % 1e6 ? 1 : 0)}M`;
  if (n >= 1e3) return `₱${(n / 1e3).toFixed(n % 1e3 && n < 1e4 ? 1 : 0)}K`;
  return `₱${Math.round(n)}`;
}

/** Clean axis ticks from 0 to just above `max`: 3–5 round steps. */
export function niceTicks(max) {
  if (!(max > 0)) return [0];
  const rough = max / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= rough) ||
    10 * power;
  const ticks = [];
  for (let value = 0; value < max + step; value += step) ticks.push(value);
  return ticks;
}

/** Whole-number axis ticks from 0 to just above `max`: 3–5 steps. */
function wholeTicks(max) {
  if (!(max > 0)) return [0];
  const step = Math.max(1, Math.ceil(max / 4));
  const ticks = [];
  for (let value = 0; value < max + step; value += step) ticks.push(value);
  return ticks;
}

/**
 * Parts of one whole, in a fixed slot order: known keys take their slot,
 * the rest fold into "Other" so there are never more than four colours.
 */
export function shareParts(rows, order) {
  const known = rows.filter((row) => order.includes(row.key) && row.value > 0);
  const rest = rows.filter((row) => !order.includes(row.key) && row.value > 0);
  const parts = known
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
    .map((row) => ({ ...row, slot: order.indexOf(row.key) % SLOTS }));
  const other = rest.reduce((sum, row) => sum + row.value, 0);
  if (other > 0)
    parts.push({ key: "other", label: "Other", value: other, slot: "other" });
  const total = parts.reduce((sum, row) => sum + row.value, 0);
  return parts.map((part) => ({
    ...part,
    share: total ? part.value / total : 0,
  }));
}

/** A thin bar of one whole split into parts, with a small key underneath. */
export function ShareBar({ parts, label }) {
  if (!parts.length) return null;
  return (
    <figure className="report-share" aria-label={label}>
      <div
        className="report-share-bar"
        role="img"
        aria-label={parts
          .map((p) => `${p.label} ${Math.round(p.share * 100)}%`)
          .join(", ")}
      >
        {parts.map((part) => (
          <span
            key={part.key}
            data-slot={part.slot}
            style={{ flexGrow: part.value }}
            title={`${part.label}: ${Math.round(part.share * 100)}%`}
          />
        ))}
      </div>
      <figcaption className="report-share-key">
        {parts.map((part) => (
          <span key={part.key}>
            <i data-slot={part.slot} aria-hidden="true" />
            {part.label}
            <b>{Math.round(part.share * 100)}%</b>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

// A callback ref, so the observer attaches whenever the plot mounts.
function useWidth() {
  const [width, setWidth] = useState(0);
  const observer = useRef(null);
  const ref = useCallback((node) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!node) return;
    setWidth(Math.floor(node.getBoundingClientRect().width));
    observer.current = new ResizeObserver(([entry]) =>
      setWidth(Math.floor(entry.contentRect.width)),
    );
    observer.current.observe(node);
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);
  return [ref, width];
}

// 13 -> "1 PM"; 0 -> "12 AM".
const hourLabel = (hour) =>
  `${((hour + 11) % 12) + 1} ${hour % 24 < 12 ? "AM" : "PM"}`;

/**
 * A column for each day's (or, with bucket="hour", each hour's) order gross,
 * with a tooltip per column.
 */
export function SalesTrend({
  rows,
  span = null,
  bucket = "day",
  action = null,
  // "gross" (order gross, pesos) or "orders" (how many orders).
  measure = "gross",
}) {
  const counting = measure === "orders";
  const tickText = counting
    ? (value) => String(Math.round(value))
    : compactPeso;
  const amount = counting
    ? (value) => `${value} ${value === 1 ? "order" : "orders"}`
    : peso;
  const [ref, width] = useWidth();
  const [active, setActive] = useState(null);
  const hourly = bucket === "hour";
  const weekly = bucket === "week";
  const days = rows.map((row) => ({
    date: hourly ? row.hour : row.date,
    gross: Number(row.gross || 0),
    orders: Number(row.orders || 0),
    value: Number((counting ? row.orders : row.gross) || 0),
  }));
  if (days.length < 2) return null;
  const height = 190;
  const pad = { top: 12, right: 8, bottom: 26, left: 44 };
  // Counts step in whole numbers (never 2.5 orders).
  const ticks = counting
    ? wholeTicks(Math.max(...days.map((d) => d.value)))
    : niceTicks(Math.max(...days.map((d) => d.value)));
  const top = ticks.at(-1) || 1;
  const plotW = Math.max(0, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;
  const band = days.length ? plotW / days.length : 0;
  const barW = Math.max(4, Math.min(24, band * 0.6));
  const y = (value) => pad.top + plotH - (value / top) * plotH;
  const label = (date) =>
    hourly
      ? hourLabel(date)
      : new Date(`${date}T12:00:00`).toLocaleDateString([], {
          month: "short",
          day: "numeric",
        });
  // The tooltip names the whole hour ("1 PM – 2 PM") or week.
  const longLabel = (date) =>
    hourly
      ? `${hourLabel(date)} – ${hourLabel(date + 1)}`
      : weekly
        ? `Week of ${label(date)}`
        : label(date);
  const every = Math.max(
    1,
    Math.ceil(days.length / Math.max(1, Math.floor(plotW / 48))),
  );
  const picked = active === null ? null : days[active];
  const total = days.reduce((sum, d) => sum + d.value, 0);
  // The highest day gets its value over the column and a note in the header.
  const best = days.reduce(
    (top, day, index) => (day.value > (days[top]?.value ?? 0) ? index : top),
    -1,
  );
  return (
    <figure className="report-trend">
      <figcaption>
        <DeskIcon icon={BarChart3} />
        <h3>
          {counting ? "Orders" : "Sales"}{" "}
          {hourly ? "by hour" : weekly ? "by week" : "by day"}
        </h3>
        <small>
          {span ||
            (hourly
              ? "This day"
              : `${days.length} ${weekly ? "weeks" : "days"}`)}{" "}
          · {counting ? amount(total) : `${peso(total)} order gross`}
          {best >= 0 && (
            <>
              {" "}
              · {hourly ? "Busiest" : "Best"}{" "}
              {weekly ? longLabel(days[best].date) : label(days[best].date)}
            </>
          )}
        </small>
        {action}
      </figcaption>
      <div className="report-trend-plot" ref={ref}>
        {width > 0 && (
          <svg
            width={width}
            height={height}
            // A group, not one image: each day below is reachable on its own.
            role="group"
            aria-label={`Order gross per ${hourly ? "hour" : weekly ? "week" : "day"}, ${label(days[0].date)} to ${label(days.at(-1).date)}`}
            onMouseLeave={() => setActive(null)}
          >
            {ticks.map((tick) => (
              <g key={tick} className="report-trend-grid">
                <line
                  x1={pad.left}
                  x2={width - pad.right}
                  y1={y(tick)}
                  y2={y(tick)}
                />
                <text x={pad.left - 8} y={y(tick)} dy="0.32em" textAnchor="end">
                  {tickText(tick)}
                </text>
              </g>
            ))}
            {days.map((day, index) => {
              const x = pad.left + band * index + (band - barW) / 2;
              const h = Math.max(0, y(0) - y(day.value));
              const r = Math.min(4, h, barW / 2);
              const base = y(0);
              // Rounded data end at the top, square at the baseline.
              const path = h
                ? `M${x},${base}V${base - h + r}Q${x},${base - h} ${x + r},${base - h}H${x + barW - r}Q${x + barW},${base - h} ${x + barW},${base - h + r}V${base}Z`
                : "";
              return (
                <g key={day.date}>
                  {path && (
                    <path
                      d={path}
                      className="report-trend-bar"
                      data-active={active === index || undefined}
                      data-dim={
                        active !== null && active !== index ? true : undefined
                      }
                    />
                  )}
                  {index === best && (
                    <text
                      className="report-trend-best"
                      x={x + barW / 2}
                      y={base - h - 6}
                      textAnchor="middle"
                    >
                      {tickText(day.value)}
                    </text>
                  )}
                  {index % every === 0 && (
                    <text
                      className="report-trend-x"
                      x={x + barW / 2}
                      y={height - 8}
                      textAnchor="middle"
                    >
                      {label(day.date)}
                    </text>
                  )}
                  {/* The hit area is the whole day's band, not just the bar. */}
                  <rect
                    x={pad.left + band * index}
                    y={pad.top}
                    width={band}
                    height={plotH}
                    fill="transparent"
                    tabIndex={0}
                    role="img"
                    aria-label={`${longLabel(day.date)}: ${amount(day.value)}${counting ? "" : `, ${day.orders} orders`}`}
                    onMouseEnter={() => setActive(index)}
                    onFocus={() => setActive(index)}
                    onBlur={() => setActive(null)}
                    onClick={() => setActive(active === index ? null : index)}
                  />
                </g>
              );
            })}
            <line
              className="report-trend-base"
              x1={pad.left}
              x2={width - pad.right}
              y1={y(0)}
              y2={y(0)}
            />
          </svg>
        )}
        {picked && width > 0 && (
          <div
            className="report-trend-tip"
            role="status"
            style={{
              left: Math.min(
                Math.max(pad.left + band * active + band / 2, 70),
                width - 70,
              ),
              top: Math.max(0, y(picked.value) - 8),
            }}
          >
            <strong>{longLabel(picked.date)}</strong>
            <span>{amount(picked.value)}</span>
            {!counting && (
              <small>
                {picked.orders} {picked.orders === 1 ? "order" : "orders"}
              </small>
            )}
          </div>
        )}
      </div>
    </figure>
  );
}

/**
 * One whole as a ring: categorical parts take their slot colour (from
 * shareParts), status parts a `tone` (success, progress, pending, danger).
 * The middle shows the total, or the hovered part's share; the key beside
 * it names every part with its share, so colour is never the only cue.
 */
export function Donut({ parts, label, total, totalLabel }) {
  const [active, setActive] = useState(null);
  const shown = parts.filter((part) => part.value > 0);
  if (!shown.length) return null;
  const size = 140;
  const stroke = 20;
  const radius = (size - stroke) / 2;
  const around = 2 * Math.PI * radius;
  // A 2px surface gap between segments when there is more than one.
  const gap = shown.length > 1 ? 2 : 0;
  const picked = shown.find((part) => part.key === active);
  let start = 0;
  return (
    <figure className="report-donut" aria-label={label}>
      <div className="report-donut-ring">
        <svg
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={shown
            .map((p) => `${p.label} ${Math.round(p.share * 100)}%`)
            .join(", ")}
        >
          <circle
            className="report-donut-track"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={stroke}
          />
          {shown.map((part) => {
            const length = part.share * around;
            const segment = (
              <circle
                key={part.key}
                className="report-donut-part"
                data-slot={part.tone ? undefined : part.slot}
                data-tone={part.tone}
                data-dim={(active && active !== part.key) || undefined}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                strokeWidth={stroke}
                strokeDasharray={`${Math.max(0.5, length - gap)} ${around}`}
                strokeDashoffset={-start}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                onMouseEnter={() => setActive(part.key)}
                onMouseLeave={() => setActive(null)}
              >
                <title>{`${part.label}: ${Math.round(part.share * 100)}%`}</title>
              </circle>
            );
            start += length;
            return segment;
          })}
        </svg>
        <div className="report-donut-center" aria-hidden="true">
          <strong>
            {picked ? `${Math.round(picked.share * 100)}%` : total}
          </strong>
          <small>{picked ? picked.label : totalLabel}</small>
        </div>
      </div>
      <figcaption className="report-donut-key">
        {shown.map((part) => (
          <span
            key={part.key}
            data-dim={(active && active !== part.key) || undefined}
            onMouseEnter={() => setActive(part.key)}
            onMouseLeave={() => setActive(null)}
          >
            <i
              data-slot={part.tone ? undefined : part.slot}
              data-tone={part.tone}
              aria-hidden="true"
            />
            <span>{part.label}</span>
            <b>{Math.round(part.share * 100)}%</b>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
