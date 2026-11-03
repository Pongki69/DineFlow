import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  History,
  MessageSquareText,
  Phone,
  Repeat2,
  Users,
} from "lucide-react";
import { DatePicker } from "../components/DatePicker";
import { EmptyState, Feedback } from "../components/ui";
import { Pagination } from "../components/Pagination";
import { CustomerScreenSkeleton } from "../components/CustomerScreenSkeleton";
import { tableName } from "./waiterHelpers";
import "./bookingsPhone.css";

export const BOOKING_STATUS_TEXT = {
  pending: "Pending",
  confirmed: "Confirmed",
  checked_in: "Checked in",
  seated: "Seated",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No show",
};

export const BOOKING_ACTION_TEXT = {
  confirmed: "Confirm",
  checked_in: "Check in",
  seated: "Seat",
  completed: "Complete",
  cancelled: "Cancel",
  no_show: "No show",
};

export const BOOKINGS_PER_PAGE = 10;

const time = (value) =>
  new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

export function bookingTableText(item) {
  const tables = item.tables?.length
    ? item.tables.map((table) => table.table_number)
    : [item.table?.table_number].filter(Boolean);
  return tables.length ? tables.map(tableName).join(", ") : "No table yet";
}

/** The service desk calendar laid out for a phone: one booking per card. */
export function BookingsPhone({
  mode,
  setMode,
  anchor,
  setAnchor,
  range,
  move,
  goToday,
  status,
  setStatus,
  statuses,
  loading,
  error,
  load,
  items,
  page,
  setPage,
  next,
  transition,
  reassign,
  showHistory,
  history,
  dateValue,
}) {
  const sorted = [...items].sort(
    (a, b) => new Date(a.starts_at) - new Date(b.starts_at),
  );
  const lastPage = Math.max(1, Math.ceil(sorted.length / BOOKINGS_PER_PAGE));
  const current = Math.min(page, lastPage);
  const start = (current - 1) * BOOKINGS_PER_PAGE;
  const visible = sorted.slice(start, start + BOOKINGS_PER_PAGE);
  const days = [];
  for (const item of visible) {
    const key = new Date(item.starts_at).toDateString();
    if (days.at(-1)?.key !== key)
      days.push({ key, at: item.starts_at, items: [] });
    days.at(-1).items.push(item);
  }
  const day = (value, options) =>
    new Date(`${value}T12:00:00`).toLocaleDateString([], options);
  const period =
    range.from === range.to
      ? day(range.from, { weekday: "short", month: "short", day: "numeric" })
      : `${day(range.from, { month: "short", day: "numeric" })} – ${day(range.to, { month: "short", day: "numeric" })}`;

  return (
    <section className="bookings-phone" aria-label="Bookings">
      <div className="bookings-phone-tools">
        <div className="bookings-phone-period">
          <button
            type="button"
            onClick={() => move(-1)}
            aria-label="Previous period"
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <strong>{period}</strong>
          <button
            type="button"
            onClick={() => move(1)}
            aria-label="Next period"
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="bookings-phone-row">
          <div
            className="bookings-phone-modes"
            role="group"
            aria-label="Calendar view"
          >
            {["day", "week", "month"].map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
              >
                {value[0].toUpperCase() + value.slice(1)}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="bookings-phone-today"
            onClick={goToday}
          >
            Today
          </button>
        </div>
        <div className="bookings-phone-row bookings-phone-filters">
          <DatePicker
            label="Calendar date"
            value={anchor}
            onChange={(value) => value && setAnchor(value)}
          />
          <select
            aria-label="Reservation status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">All statuses</option>
            {statuses.map((value) => (
              <option key={value} value={value}>
                {BOOKING_STATUS_TEXT[value]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <Feedback onRetry={load}>{error}</Feedback>}
      {loading ? (
        <CustomerScreenSkeleton variant="orderList" label="Loading bookings" />
      ) : (
        !error && (
          <p className="bookings-phone-count">
            <CalendarDays size={15} aria-hidden="true" />
            {items.length} {items.length === 1 ? "booking" : "bookings"}
          </p>
        )
      )}
      {!loading && !error && items.length === 0 && (
        <EmptyState
          title="No bookings here"
          description="Choose another day or status to find bookings."
        />
      )}

      {!loading &&
        days.map((group) => {
          const count = sorted.filter(
            (item) => new Date(item.starts_at).toDateString() === group.key,
          ).length;
          return (
            <section className="bookings-phone-day" key={group.key}>
              <h2>
                {new Date(group.at).toLocaleDateString([], {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                })}
                <span>
                  {count} {count === 1 ? "booking" : "bookings"}
                </span>
              </h2>
              <ul>
                {group.items.map((item) => {
                  const actions = next[item.status] || [];
                  const [clock, meridiem] = time(item.starts_at).split(" ");
                  return (
                    <li
                      key={item.id}
                      className="bookings-phone-card"
                      data-status={item.status}
                    >
                      <div className="bookings-phone-main">
                        <time dateTime={item.starts_at}>
                          <b>{clock}</b>
                          {meridiem && <small>{meridiem}</small>}
                        </time>
                        <div className="bookings-phone-info">
                          <div className="bookings-phone-title">
                            <strong>{item.guest_name}</strong>
                            <span className="bookings-phone-status">
                              {BOOKING_STATUS_TEXT[item.status] || item.status}
                            </span>
                          </div>
                          <p>
                            <Users size={14} aria-hidden="true" />
                            {item.guest_count}{" "}
                            {item.guest_count === 1 ? "guest" : "guests"}
                            <span aria-hidden="true">·</span>
                            {bookingTableText(item)}
                          </p>
                          <small>
                            {item.reference}
                            {item.guest_phone && (
                              <>
                                <span aria-hidden="true"> · </span>
                                <Phone size={12} aria-hidden="true" />
                                {item.guest_phone}
                              </>
                            )}
                          </small>
                          {item.notes && (
                            <p className="bookings-phone-note">
                              <MessageSquareText size={14} aria-hidden="true" />
                              {item.notes}
                            </p>
                          )}
                          {history[item.id] && (
                            <ol className="bookings-phone-history">
                              {history[item.id].map((entry) => (
                                <li key={entry.id}>
                                  {BOOKING_STATUS_TEXT[entry.to_status] ||
                                    entry.to_status}
                                  <small>{dateValue(entry.created_at)}</small>
                                </li>
                              ))}
                            </ol>
                          )}
                        </div>
                      </div>
                      <div
                        className="bookings-phone-actions"
                        data-compact={
                          actions.length === 0 &&
                          !["confirmed", "pending"].includes(item.status)
                            ? ""
                            : undefined
                        }
                      >
                        <button
                          type="button"
                          className="bookings-phone-icon"
                          onClick={() => showHistory(item)}
                          aria-label={`History for ${item.reference}`}
                          title="History"
                        >
                          <History size={16} aria-hidden="true" />
                        </button>
                        {["confirmed", "pending"].includes(item.status) && (
                          <button
                            type="button"
                            className="bookings-phone-icon"
                            onClick={() => reassign(item)}
                            aria-label={`Reassign table for ${item.reference}`}
                            title="Reassign table"
                          >
                            <Repeat2 size={16} aria-hidden="true" />
                          </button>
                        )}
                        {actions.map((value, index) => (
                          <button
                            type="button"
                            key={value}
                            className={
                              index === 0
                                ? "bookings-phone-primary"
                                : // Red is kept for undoing a booking;
                                  // a no-show is a neutral record.
                                  value === "cancelled"
                                  ? "bookings-phone-quiet"
                                  : "bookings-phone-secondary"
                            }
                            onClick={() => transition(item, value)}
                          >
                            {BOOKING_ACTION_TEXT[value] || value}
                          </button>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

      {!loading && sorted.length > BOOKINGS_PER_PAGE && (
        <Pagination
          page={current}
          lastPage={lastPage}
          total={sorted.length}
          from={start + 1}
          to={Math.min(sorted.length, start + BOOKINGS_PER_PAGE)}
          onChange={(value) => {
            setPage(value);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}
    </section>
  );
}
