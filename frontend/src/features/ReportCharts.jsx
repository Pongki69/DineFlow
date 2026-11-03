import { useCallback, useEffect, useRef, useState } from "react";
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
  if (other > 0) parts.push({ key: "other", label: "Other", value: other, slot: "other" });
  const total = parts.reduce((sum, row) => sum + row.value, 0);
  return parts.map((part) => ({ ...part, share: total ? part.value / total : 0 }));
}

/** A thin bar of one whole split into parts, with a small key underneath. */
export function ShareBar({ parts, label }) {
  if (!parts.length) return null;
  return (
    <figure className="report-share" aria-label={label}>
      <div className="report-share-bar" role="img" aria-label={parts.map((p) => `${p.label} ${Math.round(p.share * 100)}%`).join(", ")}>
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

/** A column for each day's order gross, with a tooltip per day. */
export function SalesTrend({ rows, span = null }) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState(null);
  const days = rows.map((row) => ({
    date: row.date,
    gross: Number(row.gross || 0),
    orders: Number(row.orders || 0),
  }));
  if (days.length < 2) return null;
  const height = 190;
  const pad = { top: 12, right: 8, bottom: 26, left: 44 };
  const ticks = niceTicks(Math.max(...days.map((d) => d.gross)));
  const top = ticks.at(-1) || 1;
  const plotW = Math.max(0, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;
  const band = days.length ? plotW / days.length : 0;
  const barW = Math.max(4, Math.min(24, band * 0.6));
  const y = (value) => pad.top + plotH - (value / top) * plotH;
  const label = (date) =>
    new Date(`${date}T12:00:00`).toLocaleDateString([], {
      month: "short",
      day: "numeric",
    });
  const every = Math.max(1, Math.ceil(days.length / Math.max(1, Math.floor(plotW / 48))));
  const picked = active === null ? null : days[active];
  const total = days.reduce((sum, d) => sum + d.gross, 0);
  // The highest day gets its value over the column and a note in the header.
  const best = days.reduce(
    (top, day, index) => (day.gross > (days[top]?.gross ?? 0) ? index : top),
    -1,
  );
  return (
    <figure className="report-trend">
      <figcaption>
        <h3>Sales by day</h3>
        <small>
          {span || `${days.length} days`} · {peso(total)} order gross
          {best >= 0 && (
            <>
              {" "}
              · Best {label(days[best].date)}
            </>
          )}
        </small>
      </figcaption>
      <div className="report-trend-plot" ref={ref}>
        {width > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={`Order gross per day, ${label(days[0].date)} to ${label(days.at(-1).date)}`}
            onMouseLeave={() => setActive(null)}
          >
            {ticks.map((tick) => (
              <g key={tick} className="report-trend-grid">
                <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} />
                <text x={pad.left - 8} y={y(tick)} dy="0.32em" textAnchor="end">
                  {compactPeso(tick)}
                </text>
              </g>
            ))}
            {days.map((day, index) => {
              const x = pad.left + band * index + (band - barW) / 2;
              const h = Math.max(0, y(0) - y(day.gross));
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
                      data-dim={active !== null && active !== index ? true : undefined}
                    />
                  )}
                  {index === best && (
                    <text
                      className="report-trend-best"
                      x={x + barW / 2}
                      y={base - h - 6}
                      textAnchor="middle"
                    >
                      {compactPeso(day.gross)}
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
                    aria-label={`${label(day.date)}: ${peso(day.gross)}, ${day.orders} orders`}
                    onMouseEnter={() => setActive(index)}
                    onFocus={() => setActive(index)}
                    onBlur={() => setActive(null)}
                    onClick={() => setActive(active === index ? null : index)}
                  />
                </g>
              );
            })}
            <line className="report-trend-base" x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} />
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
              top: Math.max(0, y(picked.gross) - 8),
            }}
          >
            <strong>{label(picked.date)}</strong>
            <span>{peso(picked.gross)}</span>
            <small>
              {picked.orders} {picked.orders === 1 ? "order" : "orders"}
            </small>
          </div>
        )}
      </div>
    </figure>
  );
}
