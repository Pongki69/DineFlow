import {
  CalendarClock,
  Clock3,
  History,
  Phone,
  Table2,
  UsersRound,
} from "lucide-react";
import { ReservationStatusPill } from "./OrderStatusPill";
import { RowMenu } from "./RowMenu";
import { bookingTableText } from "../features/BookingsPhone";

/**
 * Admin desktop booking pages (Reservations calendar, All bookings) share
 * these, so a booking reads the same wherever staff meet it.
 */

// The day pill's icon: today now, tomorrow ahead, earlier days behind.
const NEAR_ICONS = { today: Clock3, upcoming: CalendarClock, past: History };

/** A day's heading: date badge, weekday with Today/Tomorrow, totals. */
export function BookingDayHeading({ date, when, near, count, guests }) {
  const NearIcon = NEAR_ICONS[when] || CalendarClock;
  return (
    <h2>
      <span className="cal-day-title" data-desk>
        <span className="cal-date-badge" data-when={when} aria-hidden="true">
          <small>{date.toLocaleDateString([], { month: "short" })}</small>
          <b>{date.getDate()}</b>
        </span>
        <span className="cal-day-name">
          <span>
            {date.toLocaleDateString([], { weekday: "long" })}
            {near && (
              <em className="cal-today" data-when={when}>
                <NearIcon size={12} aria-hidden="true" />
                {near}
              </em>
            )}
          </span>
          <small>
            {date.toLocaleDateString([], {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </small>
        </span>
      </span>
      <span className="cal-day-summary">
        <small>
          {count} {count === 1 ? "booking" : "bookings"} · {guests}{" "}
          {guests === 1 ? "guest" : "guests"}
        </small>
      </span>
    </h2>
  );
}

/**
 * One booking: time, guest and status, then the details line, then today's
 * step and the ⋮ menu. `tags` are short highlighted notes ({ text, late }),
 * `extra` sits under the details (history, deposit).
 */
export function BookingRow({ item, tags = [], step, menu = [], extra }) {
  const [clock, meridiem] = new Date(item.starts_at)
    .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    .split(" ");
  return (
    <article
      className="calendar-booking cal-booking"
      data-status={item.status}
      aria-label={`Reservation ${item.reference}`}
    >
      <time
        className="cal-booking-time"
        dateTime={new Date(item.starts_at).toISOString()}
      >
        <strong>{clock}</strong>
        {meridiem && <small>{meridiem}</small>}
      </time>
      <div className="calendar-booking-info">
        <strong>
          {item.guest_name || item.reference}
          <ReservationStatusPill status={item.status} />
        </strong>
        <small className="cal-booking-meta">
          {tags.filter(Boolean).map((tag) => (
            <b
              key={tag.text}
              className="cal-booking-when"
              data-late={tag.late || undefined}
            >
              {tag.text}
            </b>
          ))}
          <span>{item.reference}</span>
          <span>
            <UsersRound size={14} aria-hidden="true" />
            {item.guest_count} {item.guest_count === 1 ? "guest" : "guests"}
          </span>
          <span>
            <Table2 size={14} aria-hidden="true" />
            {bookingTableText(item)}
          </span>
          {item.guest_phone && (
            <span>
              <Phone size={14} aria-hidden="true" />
              {item.guest_phone}
            </span>
          )}
        </small>
        {extra}
      </div>
      <div className="calendar-booking-actions">
        {step}
        <RowMenu label={`More actions for ${item.reference}`} items={menu} />
      </div>
    </article>
  );
}
