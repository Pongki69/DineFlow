import { useEffect, useMemo, useRef, useState } from "react";
import {
  BellRing,
  CalendarClock,
  Check,
  ChefHat,
  Minus,
  NotebookPen,
  Plus,
  Search,
  Sparkles,
  UsersRound,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { api } from "../api";
import { subscribeToLiveChanges } from "../liveUpdates";
import { playSound } from "../uiSound";
import { EmptyState, Feedback, Skeleton } from "../components/ui";
import { peso } from "./cashierQueue";
import {
  arrivingSoon,
  bookingTables,
  floorCounts,
  seatedFor,
  sessionOf,
  tableName,
  tableShort,
} from "./waiterHelpers";
import "./waiterFloor.css";

const FILTERS = [
  ["all", "All"],
  ["available", "Free"],
  ["occupied", "Seated"],
  ["cleaning", "Cleaning"],
];

const localDay = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const clock = (value) =>
  new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
const readable = (value) =>
  String(value || "")
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());

/** The waiter's floor: food to run, guests arriving, and every table at a glance. */
export function WaiterFloor() {
  const [tables, setTables] = useState([]);
  const [ready, setReady] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [openTable, setOpenTable] = useState(null);
  const [busy, setBusy] = useState({});
  const [now, setNow] = useState(Date.now);
  const request = useRef(0);
  async function load() {
    const version = ++request.current;
    try {
      const day = localDay();
      const [tableResult, readyResult, bookingResult] = await Promise.all([
        api("/service/tables"),
        api("/orders?order_type=dine_in&status=ready_to_serve&per_page=50"),
        api(`/reservations?from=${day}&to=${day}&per_page=100`),
      ]);
      if (version !== request.current) return;
      setTables(tableResult.data || []);
      setReady(readyResult.data || []);
      setBookings(bookingResult.data || []);
      setError("");
      setNow(Date.now());
    } catch (failure) {
      if (version === request.current) setError(failure.message);
    } finally {
      if (version === request.current) setLoading(false);
    }
  }
  useEffect(() => {
    load();
    const unsubscribe = subscribeToLiveChanges(load);
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, []);
  async function act(key, task, message) {
    setBusy((current) => ({ ...current, [key]: true }));
    setError("");
    try {
      await task();
      if (message) setNotice(message);
      playSound("tap");
      await load();
      return true;
    } catch (failure) {
      setError(failure.message);
      return false;
    } finally {
      setBusy((current) => ({ ...current, [key]: false }));
    }
  }
  const counts = floorCounts(tables);
  const soon = arrivingSoon(bookings, now);
  const visible = tables.filter(
    (table) =>
      table.is_active !== false &&
      (filter === "all" || table.operational_status === filter) &&
      (!query.trim() ||
        String(table.table_number)
          .toLowerCase()
          .includes(query.trim().toLowerCase())),
  );
  const selected = openTable
    ? tables.find((table) => table.id === openTable)
    : null;
  return (
    <section className="waiter-floor" aria-labelledby="waiter-floor-title">
      <h1 id="waiter-floor-title" className="sr-only">
        Floor
      </h1>
      {notice && <Feedback tone="success">{notice}</Feedback>}
      {error && <Feedback onRetry={load}>{error}</Feedback>}
      {loading && <Skeleton cards={2} label="Loading the floor" />}
      {!loading && ready.length > 0 && (
        <section
          className="waiter-panel waiter-panel--ready"
          aria-label="Ready to serve"
        >
          <h2>
            <ChefHat size={15} aria-hidden="true" />
            Ready at the pass
            <span>{ready.length}</span>
          </h2>
          <ul>
            {ready.map((order) => (
              <li key={order.id}>
                <span className="waiter-pass-table">
                  {tableShort(
                    order.table_number_snapshot || order.table?.table_number,
                  )}
                </span>
                <span className="waiter-row-main">
                  <strong>
                    {tableName(
                      order.table_number_snapshot || order.table?.table_number,
                    )}
                  </strong>
                  <small>
                    {(order.items || [])
                      .map(
                        (item) =>
                          `${item.quantity}× ${item.item_name_snapshot}`,
                      )
                      .join(" · ")}
                  </small>
                </span>
                <button
                  type="button"
                  className="waiter-button"
                  disabled={busy[`serve-${order.id}`]}
                  onClick={() =>
                    act(
                      `serve-${order.id}`,
                      () =>
                        api(`/orders/${order.id}/status`, {
                          method: "PATCH",
                          body: JSON.stringify({ status: "served" }),
                        }),
                      `${order.order_number} served.`,
                    )
                  }
                >
                  <Check size={15} aria-hidden="true" />
                  Served
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!loading && soon.length > 0 && (
        <section className="waiter-panel" aria-label="Arriving soon">
          <h2>
            <CalendarClock size={15} aria-hidden="true" />
            Arriving soon
            <span>{soon.length}</span>
          </h2>
          <ul>
            {soon.map((booking) => {
              const late = new Date(booking.starts_at).getTime() < now;
              const next =
                booking.status === "confirmed" ? "checked_in" : "seated";
              return (
                <li key={booking.id}>
                  <span className="waiter-pass-table waiter-pass-table--time">
                    {clock(booking.starts_at)}
                  </span>
                  <span className="waiter-row-main">
                    <strong>{booking.guest_name}</strong>
                    <small>
                      {booking.guest_count} guests · {bookingTables(booking)}
                      {late ? " · running late" : ""}
                    </small>
                  </span>
                  <button
                    type="button"
                    className={`waiter-button${next === "seated" ? "" : " waiter-button--quiet"}`}
                    disabled={busy[`book-${booking.id}`]}
                    onClick={() =>
                      act(
                        `book-${booking.id}`,
                        () =>
                          api(`/reservations/${booking.id}/status`, {
                            method: "PATCH",
                            body: JSON.stringify({ status: next }),
                          }),
                        next === "seated"
                          ? `${booking.guest_name}’s party is seated.`
                          : `${booking.guest_name} checked in.`,
                      )
                    }
                  >
                    {next === "seated" ? "Seat" : "Check in"}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {!loading && (
        <>
          <div className="waiter-floor-tools">
            <div className="waiter-chips" role="group" aria-label="Show tables">
              {FILTERS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                >
                  {label}
                  <span>{counts[key] || 0}</span>
                </button>
              ))}
            </div>
            <label className="waiter-search">
              <Search size={15} aria-hidden="true" />
              <span className="sr-only">Find a table</span>
              <input
                type="search"
                value={query}
                placeholder="Table"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>
          {counts.bill > 0 && (
            <p className="waiter-bill-note">
              <BellRing size={14} aria-hidden="true" />
              {counts.bill} {counts.bill === 1 ? "table is" : "tables are"}{" "}
              waiting for the cashier.
            </p>
          )}
          <div className="waiter-grid">
            {visible.map((table) => {
              const session = sessionOf(table);
              const service = session?.service;
              return (
                <button
                  key={table.id}
                  type="button"
                  className="waiter-table"
                  data-status={table.operational_status}
                  data-bill={session?.bill_requested_at ? true : undefined}
                  data-ready={service?.ready ? true : undefined}
                  onClick={() => setOpenTable(table.id)}
                  aria-label={`${tableName(table.table_number)}, ${table.operational_status}`}
                >
                  <b>{tableShort(table.table_number)}</b>
                  <small>
                    {session
                      ? `${session.guest_count} · ${seatedFor(session.opened_at, now)}`
                      : table.operational_status === "available"
                        ? `${table.capacity} seats`
                        : readable(table.operational_status)}
                  </small>
                  {service?.ready > 0 && (
                    <i className="waiter-table-flag">{service.ready} ready</i>
                  )}
                  {session?.bill_requested_at && (
                    <i className="waiter-table-flag waiter-table-flag--bill">
                      <BellRing size={11} aria-hidden="true" /> Bill
                    </i>
                  )}
                </button>
              );
            })}
          </div>
          {visible.length === 0 && (
            <EmptyState
              compact
              icon={UtensilsCrossed}
              title="No tables here"
              description="Choose another filter to see more tables."
            />
          )}
        </>
      )}
      {selected && (
        <TableSheet
          table={selected}
          now={now}
          busy={busy}
          act={act}
          onClose={() => setOpenTable(null)}
        />
      )}
    </section>
  );
}

function TableSheet({ table, now, busy, act, onClose }) {
  const session = sessionOf(table);
  const service = session?.service;
  const [orders, setOrders] = useState(null);
  const [guests, setGuests] = useState(Math.min(2, table.capacity || 2));
  const [ordering, setOrdering] = useState(false);
  async function loadOrders() {
    if (!session) return setOrders(null);
    try {
      const result = await api(`/service/dining-sessions/${session.id}/orders`);
      setOrders(result.data || []);
    } catch {
      setOrders([]);
    }
  }
  useEffect(() => {
    loadOrders();
  }, [session?.id, service?.orders, service?.ready]);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", escape);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", escape);
    };
  }, []);
  const occupancy = (status, message) =>
    act(
      `table-${table.id}`,
      () =>
        api(`/service/tables/${table.id}/occupancy`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        }),
      message,
    );
  const tableBusy = busy[`table-${table.id}`];
  const name = tableName(table.table_number);
  return (
    <div className="waiter-sheet-layer">
      <div
        className="waiter-sheet-scrim"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        className="waiter-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="waiter-sheet-title"
      >
        <header className="waiter-sheet-head">
          <div>
            <small>
              {readable(table.operational_status)} · {table.capacity} seats
            </small>
            <h2 id="waiter-sheet-title">{name}</h2>
          </div>
          <button type="button" aria-label="Close" onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div className="waiter-sheet-body">
          {ordering ? (
            <OrderPad
              table={table}
              onCancel={() => setOrdering(false)}
              onSent={async (message) => {
                setOrdering(false);
                await act(`order-${table.id}`, async () => {}, message);
                loadOrders();
              }}
            />
          ) : session ? (
            <>
              <dl className="waiter-facts">
                <div>
                  <dt>Guests</dt>
                  <dd>{session.guest_count}</dd>
                </div>
                <div>
                  <dt>Seated</dt>
                  <dd>{seatedFor(session.opened_at, now)}</dd>
                </div>
                <div>
                  <dt>Bill</dt>
                  <dd>{peso(service?.balance_due || 0)}</dd>
                </div>
              </dl>
              {session.bill_requested_at && (
                <p className="waiter-bill-note">
                  <BellRing size={14} aria-hidden="true" />
                  Bill requested {clock(session.bill_requested_at)}. The cashier
                  has been told.
                </p>
              )}
              <section
                className="waiter-orders"
                aria-label="Orders on this table"
              >
                <h3>Orders</h3>
                {orders === null && (
                  <Skeleton cards={1} label="Loading orders" />
                )}
                {orders?.length === 0 && (
                  <p className="waiter-hint">Nothing ordered yet.</p>
                )}
                <ul>
                  {orders?.map((order) => (
                    <li key={order.id} data-status={order.status}>
                      <div>
                        <strong>{order.order_number}</strong>
                        <span className="waiter-status">
                          {readable(
                            order.status === "ready_to_serve"
                              ? "ready"
                              : order.status,
                          )}
                        </span>
                      </div>
                      <small>
                        {order.items
                          .map((item) => `${item.quantity}× ${item.name}`)
                          .join(" · ")}
                      </small>
                      {order.status === "ready_to_serve" && (
                        <button
                          type="button"
                          className="waiter-button"
                          disabled={busy[`serve-${order.id}`]}
                          onClick={() =>
                            act(
                              `serve-${order.id}`,
                              () =>
                                api(`/orders/${order.id}/status`, {
                                  method: "PATCH",
                                  body: JSON.stringify({ status: "served" }),
                                }),
                              `${order.order_number} served.`,
                            )
                          }
                        >
                          <Check size={15} aria-hidden="true" />
                          Mark served
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
              <div className="waiter-actions">
                {Number(service?.balance_due) <= 0 ? (
                  <button
                    type="button"
                    className="waiter-secondary"
                    disabled={busy[`close-${session.id}`]}
                    onClick={async () => {
                      if (
                        await act(
                          `close-${session.id}`,
                          () =>
                            api(
                              `/service/dining-sessions/${session.id}/close`,
                              { method: "PATCH" },
                            ),
                          `${name} cleared. It’s marked for cleaning.`,
                        )
                      )
                        onClose();
                    }}
                  >
                    <Sparkles size={15} aria-hidden="true" />
                    Clear table
                  </button>
                ) : (
                  !session.bill_requested_at && (
                    <button
                      type="button"
                      className="waiter-secondary"
                      disabled={busy[`bill-${session.id}`]}
                      onClick={() =>
                        act(
                          `bill-${session.id}`,
                          () =>
                            api(`/dining-sessions/${session.id}/request-bill`, {
                              method: "POST",
                            }),
                          `The cashier knows ${name} wants the bill.`,
                        )
                      }
                    >
                      <BellRing size={15} aria-hidden="true" />
                      Request bill
                    </button>
                  )
                )}
                <button
                  type="button"
                  className="waiter-primary"
                  onClick={() => setOrdering(true)}
                >
                  <NotebookPen size={15} aria-hidden="true" />
                  Take order
                </button>
              </div>
            </>
          ) : table.operational_status === "available" ? (
            <section className="waiter-seat" aria-label="Seat guests">
              <p>How many guests?</p>
              <div className="waiter-stepper">
                <button
                  type="button"
                  aria-label="Fewer guests"
                  disabled={guests <= 1}
                  onClick={() => setGuests((value) => value - 1)}
                >
                  <Minus size={18} aria-hidden="true" />
                </button>
                <output aria-live="polite">{guests}</output>
                <button
                  type="button"
                  aria-label="More guests"
                  disabled={guests >= table.capacity}
                  onClick={() => setGuests((value) => value + 1)}
                >
                  <Plus size={18} aria-hidden="true" />
                </button>
              </div>
              <small className="waiter-hint">
                Up to {table.capacity} at this table.
              </small>
              <div className="waiter-actions">
                <button
                  type="button"
                  className="waiter-secondary"
                  disabled={tableBusy}
                  onClick={() =>
                    occupancy("unavailable", `${name} is out of service.`)
                  }
                >
                  Out of service
                </button>
                <button
                  type="button"
                  className="waiter-primary"
                  disabled={busy[`seat-${table.id}`]}
                  onClick={() =>
                    act(
                      `seat-${table.id}`,
                      () =>
                        api(`/service/tables/${table.id}/sessions`, {
                          method: "POST",
                          body: JSON.stringify({ guest_count: guests }),
                        }),
                      `${guests} guests seated at ${name}.`,
                    )
                  }
                >
                  <UsersRound size={15} aria-hidden="true" />
                  Seat {guests} {guests === 1 ? "guest" : "guests"}
                </button>
              </div>
            </section>
          ) : (
            <section className="waiter-seat">
              <p>
                {table.operational_status === "cleaning"
                  ? "Once it’s wiped and set, open it for the next party."
                  : "This table is out of service."}
              </p>
              <div className="waiter-actions">
                <button
                  type="button"
                  className="waiter-primary"
                  disabled={tableBusy}
                  onClick={() =>
                    occupancy("available", `${name} is ready for guests.`)
                  }
                >
                  <Check size={15} aria-hidden="true" />
                  {table.operational_status === "cleaning"
                    ? "Ready for guests"
                    : "Back in service"}
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/** Take an order at the table: pick dishes, add a note, send it to the kitchen. */
function OrderPad({ table, onCancel, onSent }) {
  const [menu, setMenu] = useState(null);
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    api("/menu/items?available_only=1&per_page=60")
      .then((result) => setMenu(result.data || []))
      .catch((failure) => setError(failure.message));
  }, []);
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (menu || []).filter(
      (item) =>
        !needle ||
        `${item.name} ${item.category?.name || ""}`
          .toLowerCase()
          .includes(needle),
    );
  }, [menu, query]);
  const chosen = Object.entries(lines).filter(([, line]) => line.quantity > 0);
  const count = chosen.reduce((sum, [, line]) => sum + line.quantity, 0);
  const total = chosen.reduce((sum, [id, line]) => {
    const item = menu?.find((row) => String(row.id) === id);
    const variant = item?.variants?.find((row) => row.id === line.variant_id);
    return (
      sum +
      (Number(item?.base_price || 0) + Number(variant?.price_adjustment || 0)) *
        line.quantity
    );
  }, 0);
  const change = (item, delta) =>
    setLines((current) => {
      const line = current[item.id] || {
        quantity: 0,
        variant_id:
          item.variants?.find((v) => v.is_active !== false)?.id || null,
      };
      return {
        ...current,
        [item.id]: {
          ...line,
          quantity: Math.max(0, Math.min(99, line.quantity + delta)),
        },
      };
    });
  async function send() {
    setBusy(true);
    setError("");
    try {
      const result = await api("/orders", {
        method: "POST",
        body: JSON.stringify({
          order_type: "dine_in",
          table_code: table.qr_code,
          customer_notes: note.trim() || null,
          items: chosen.map(([id, line]) => ({
            menu_item_id: Number(id),
            quantity: line.quantity,
            ...(line.variant_id ? { variant_id: line.variant_id } : {}),
          })),
        }),
      });
      playSound("success");
      onSent(
        `${result.data.order_number} sent to the kitchen for ${tableName(table.table_number)}.`,
      );
    } catch (failure) {
      setError(failure.message);
      setBusy(false);
    }
  }
  return (
    <section className="waiter-pad" aria-label="Take order">
      {error && <Feedback>{error}</Feedback>}
      <label className="waiter-search">
        <Search size={15} aria-hidden="true" />
        <span className="sr-only">Find a dish</span>
        <input
          type="search"
          value={query}
          placeholder="Find a dish"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {menu === null && !error && (
        <Skeleton cards={1} label="Loading the menu" />
      )}
      <ul className="waiter-dishes">
        {shown.map((item) => {
          const line = lines[item.id];
          return (
            <li
              key={item.id}
              data-chosen={line?.quantity > 0 ? true : undefined}
            >
              <span className="waiter-row-main">
                <strong>{item.name}</strong>
                <small>
                  {peso(item.base_price)}
                  {item.category?.name ? ` · ${item.category.name}` : ""}
                </small>
                {line?.quantity > 0 && item.variants?.length > 0 && (
                  <span
                    className="waiter-variants"
                    role="group"
                    aria-label={`${item.name} size`}
                  >
                    {item.variants.map((variant) => (
                      <button
                        key={variant.id}
                        type="button"
                        aria-pressed={line.variant_id === variant.id}
                        onClick={() =>
                          setLines((current) => ({
                            ...current,
                            [item.id]: {
                              ...current[item.id],
                              variant_id: variant.id,
                            },
                          }))
                        }
                      >
                        {variant.name}
                      </button>
                    ))}
                  </span>
                )}
              </span>
              <span className="waiter-qty">
                {line?.quantity > 0 && (
                  <>
                    <button
                      type="button"
                      aria-label={`One less ${item.name}`}
                      onClick={() => change(item, -1)}
                    >
                      <Minus size={14} aria-hidden="true" />
                    </button>
                    <output>{line.quantity}</output>
                  </>
                )}
                <button
                  type="button"
                  aria-label={`Add ${item.name}`}
                  onClick={() => change(item, 1)}
                >
                  <Plus size={14} aria-hidden="true" />
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      <label className="waiter-note">
        Note for the kitchen
        <input
          value={note}
          maxLength={500}
          placeholder="e.g. No onions on one plate"
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <div className="waiter-actions waiter-actions--sticky">
        <button
          type="button"
          className="waiter-secondary"
          onClick={onCancel}
          disabled={busy}
        >
          Back
        </button>
        <button
          type="button"
          className="waiter-primary"
          disabled={!count || busy}
          onClick={send}
        >
          <ChefHat size={15} aria-hidden="true" />
          {busy
            ? "Sending…"
            : count
              ? `Send ${count} · ${peso(total)}`
              : "Choose dishes"}
        </button>
      </div>
    </section>
  );
}
