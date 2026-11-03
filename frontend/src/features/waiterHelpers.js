// Pure helpers for the waiter's floor view.

/** "Table 6" -> "6" for a tile; anything else is kept as it is. */
export function tableShort(table) {
  return String(table || "").replace(/^table\s+/i, "") || "?";
}

/** "Table 6" stays; "6" becomes "Table 6". */
export function tableName(table) {
  const value = String(table || "");
  return /^table\s/i.test(value) ? value : `Table ${value}`;
}

/** How long a party has been seated: 42 min, 1 h 12 min, 11 days. */
export function seatedFor(openedAt, now = Date.now()) {
  const opened = openedAt ? new Date(openedAt).getTime() : NaN;
  if (!Number.isFinite(opened)) return "";
  const minutes = Math.max(0, Math.floor((now - opened) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)
    return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/** Counts for the floor filter chips. */
export function floorCounts(tables = []) {
  const counts = {
    all: 0,
    available: 0,
    occupied: 0,
    cleaning: 0,
    unavailable: 0,
    bill: 0,
  };
  for (const table of tables) {
    if (table.is_active === false) continue;
    counts.all += 1;
    counts[table.operational_status] =
      (counts[table.operational_status] || 0) + 1;
    if (sessionOf(table)?.bill_requested_at) counts.bill += 1;
  }
  return counts;
}

export function sessionOf(table) {
  return table?.current_session || table?.currentSession || null;
}

/**
 * Bookings the floor should prepare for: confirmed or checked in, from 30
 * minutes ago (running late) to 3 hours ahead, soonest first.
 */
export function arrivingSoon(reservations = [], now = Date.now()) {
  return reservations
    .filter((booking) => ["confirmed", "checked_in"].includes(booking.status))
    .filter((booking) => {
      const starts = new Date(booking.starts_at).getTime();
      return (
        Number.isFinite(starts) &&
        starts >= now - 30 * 60000 &&
        starts <= now + 3 * 3600000
      );
    })
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
}

/** The tables a booking is for, as one label. */
export function bookingTables(booking) {
  const tables = booking.tables?.length
    ? booking.tables.map((table) => table.table_number)
    : [booking.table?.table_number].filter(Boolean);
  return tables.length ? tables.map(tableName).join(", ") : "No table yet";
}
