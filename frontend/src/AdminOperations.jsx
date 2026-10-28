import { EmptyState, Feedback, Skeleton } from "./components/ui";
import { usePrompt } from "./components/ConfirmProvider";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE, api } from "./api";

const peso = (value) =>
  `₱${Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const label = (value) => String(value || "").replaceAll("_", " ");
const dateValue = (date) =>
  new Date(date).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
const localDay = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const today = () => localDay(new Date());
const startOfWeek = () => {
  const date = new Date();
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return localDay(date);
};
const startOfMonth = () => `${today().slice(0, 7)}-01`;

function useRange() {
  const [range, setRange] = useState({ from: today(), to: today() });
  function preset(name) {
    setRange({
      from:
        name === "today"
          ? today()
          : name === "week"
            ? startOfWeek()
            : startOfMonth(),
      to: today(),
    });
  }
  return [range, setRange, preset];
}

function RangePicker({ range, setRange, preset }) {
  return (
    <div className="report-range">
      <button onClick={() => preset("today")}>Today</button>
      <button onClick={() => preset("week")}>This week</button>
      <button onClick={() => preset("month")}>This month</button>
      <label>
        From
        <input
          type="date"
          value={range.from}
          onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
        />
      </label>
      <label>
        To
        <input
          type="date"
          value={range.to}
          onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
        />
      </label>
    </div>
  );
}

function Stat({ title, value, detail, to }) {
  const card = (
    <article className="ops-stat">
      <span>{title}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </article>
  );
  return to ? (
    <Link className="ops-stat-link" to={to}>
      {card}
    </Link>
  ) : (
    card
  );
}

export function OperationsDashboard({ user }) {
  const [loading, setLoading] = useState(true);

  const [range, setRange, preset] = useRange();
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  async function load() {
    setError("");
    try {
      const result = await api(`/dashboard?from=${range.from}&to=${range.to}`);
      setData(result.data);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [range.from, range.to]);
  const permissions = user?.permissions || [];
  const has = (permission) => permissions.includes(permission);
  return (
    <section className="welcome operations-dashboard">
      <span className="eyebrow">RESTAURANT OVERVIEW</span>
      <h1>Good day, {user?.name?.split(" ")[0]}</h1>
      <p>
        Live operational totals from {data?.range?.from || range.from} through{" "}
        {data?.range?.to || range.to}. Refreshes every 30 seconds.
      </p>
      {loading && <Skeleton label="Loading your content" />}
      <RangePicker range={range} setRange={setRange} preset={preset} />
      {error && <Feedback onRetry={load}>{error}</Feedback>}

      {data?.orders && (
        <>
          <h2>Orders and revenue</h2>
          <div className="ops-stats">
            <Stat title="Orders" value={data.orders.count} to="/orders" />
            <Stat
              title="Active orders"
              value={data.orders.active}
              detail={`${data.orders.pending} pending`}
              to="/orders"
            />
            <Stat
              title="Order value"
              value={peso(data.orders.revenue)}
              detail={`${data.orders.cancelled} cancelled`}
              to="/reports"
            />
          </div>
        </>
      )}
      {data?.payments && (
        <>
          <h2>Payments</h2>
          <div className="ops-stats">
            <Stat
              title="Payments received"
              value={peso(data.payments.paid)}
              to="/payments"
            />
            <Stat
              title="Refunded"
              value={peso(data.payments.refunded)}
              to="/payments"
            />
            <Stat
              title="Pending checkouts"
              value={data.payments.pending}
              to="/payments"
            />
          </div>
        </>
      )}
      {data?.reservations && (
        <>
          <h2>Reservations</h2>
          <div className="ops-stats">
            <Stat
              title="Today"
              value={data.reservations.today}
              to="/reservations"
            />
            <Stat
              title="Cancelled"
              value={data.reservations.cancelled}
              detail="In selected period"
            />
            <Stat
              title="No shows"
              value={data.reservations.no_show}
              detail="In selected period"
            />
          </div>
          <div className="ops-panel">
            <div className="ops-panel-head">
              <h3>Upcoming bookings</h3>
              <Link to="/reservations">Open reservation desk</Link>
            </div>
            {data.reservations.upcoming?.length ? (
              <div
                className="ops-table-wrap"
                tabIndex={0}
                role="region"
                aria-label="Scrollable report table"
              >
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Guest</th>
                      <th>Party</th>
                      <th>Table</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.reservations.upcoming.map((item) => (
                      <tr key={item.id}>
                        <td>{dateValue(item.starts_at)}</td>
                        <td>{item.guest_name}</td>
                        <td>{item.guest_count}</td>
                        <td>
                          {item.tables?.length
                            ? item.tables
                                .map((table) => table.table_number)
                                .join(", ")
                            : item.table?.table_number || "Unassigned"}
                        </td>
                        <td>{label(item.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>No upcoming reservations.</p>
            )}
          </div>
        </>
      )}
      {data?.tables && (
        <>
          <h2>Table occupancy</h2>
          <div className="ops-stats">
            {Object.entries(data.tables.statuses || {}).map(
              ([status, count]) => (
                <Stat
                  key={status}
                  title={label(status)}
                  value={count}
                  to="/service"
                />
              ),
            )}
            <Stat
              title="Tables"
              value={`${data.tables.active} / ${data.tables.total}`}
              detail="Active / total"
              to="/service"
            />
          </div>
        </>
      )}
      {data?.open_sessions && (
        <div className="ops-panel">
          <div className="ops-panel-head">
            <h3>Open dining sessions</h3>
            <Link to="/service">Manage tables</Link>
          </div>
          <div className="ops-inline-list">
            {data.open_sessions.map((session) => (
              <span key={session.id}>
                Table {session.table?.table_number} · {session.guest_count}{" "}
                guests · since {dateValue(session.opened_at)}
              </span>
            ))}
          </div>
        </div>
      )}
      {data?.deliveries && (
        <>
          <h2>Delivery operations</h2>
          <div className="ops-stats">
            <Stat
              title="Active deliveries"
              value={data.deliveries.active}
              to="/admin/deliveries"
            />
            <Stat
              title="Awaiting rider"
              value={data.deliveries.unassigned}
              to="/admin/deliveries"
            />
            <Stat
              title="Delivered"
              value={data.deliveries.delivered}
              detail={`${data.deliveries.failed} failed in range`}
              to="/admin/deliveries"
            />
          </div>
        </>
      )}
      {data?.popular_items && (
        <div className="ops-panel">
          <div className="ops-panel-head">
            <h3>Popular menu items</h3>
            <Link to="/reports">Full reports</Link>
          </div>
          <div className="ops-inline-list">
            {data.popular_items.length ? (
              data.popular_items.map((item, i) => (
                <span key={item.item_name_snapshot}>
                  {i + 1}. {item.item_name_snapshot} · {item.quantity} sold ·{" "}
                  {peso(item.sales)}
                </span>
              ))
            ) : (
              <span>No completed item sales in this period.</span>
            )}
          </div>
        </div>
      )}
      <div className="ops-shortcuts">
        {has("orders.manage") && <Link to="/orders">Manage orders</Link>}
        {has("reservations.manage") && (
          <Link to="/reservations">Reservations calendar</Link>
        )}
        {has("deliveries.manage") && (
          <Link to="/admin/deliveries">Dispatch deliveries</Link>
        )}
        {has("payments.manage") && (
          <Link to="/payments">Cashier and payments</Link>
        )}
        {has("reports.operations") && (
          <Link to="/reports">Operational reports</Link>
        )}
      </div>
    </section>
  );
}

export function ReportsDashboard({ user }) {
  const [loading, setLoading] = useState(true);

  const [range, setRange, preset] = useRange();
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  async function load() {
    setError("");
    try {
      const result = await api(`/reports?from=${range.from}&to=${range.to}`);
      setData(result.data);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, [range.from, range.to]);
  function download(dataset) {
    window.location.assign(
      `${API_BASE}/reports/export?dataset=${dataset}&from=${range.from}&to=${range.to}`,
    );
  }
  const permissions = user?.permissions || [];
  return (
    <section className="welcome reports-dashboard">
      <span className="eyebrow">REPORTS</span>
      <h1>Restaurant performance</h1>
      <p>
        Figures are calculated from saved order, payment, reservation, and
        delivery records.
      </p>
      {loading && <Skeleton label="Loading your content" />}
      <RangePicker range={range} setRange={setRange} preset={preset} />
      {error && <Feedback onRetry={load}>{error}</Feedback>}
      {data?.sales && (
        <>
          <div className="ops-stats">
            <Stat title="Orders" value={data.sales.orders} />
            <Stat title="Order gross" value={peso(data.sales.gross)} />
            <Stat title="Discounts" value={peso(data.sales.discounts)} />
            <Stat title="Tax" value={peso(data.sales.tax)} />
            <Stat
              title="Service charges"
              value={peso(data.sales.service_charges)}
            />
            <Stat
              title="Delivery fees"
              value={peso(data.sales.delivery_fees)}
            />
          </div>
          <div className="ops-report-grid">
            <ReportTable
              title="Orders by type"
              columns={["Type", "Orders", "Order total"]}
              rows={(data.orders_by_type || []).map((r) => [
                label(r.order_type),
                r.orders,
                peso(r.total),
              ])}
            />
            <ReportTable
              title="Orders by status"
              columns={["Status", "Orders"]}
              rows={(data.orders_by_status || []).map((r) => [
                label(r.status),
                r.total,
              ])}
            />
            <ReportTable
              title="Popular dishes"
              columns={["Menu item", "Quantity", "Sales"]}
              rows={(data.popular_items || []).map((r) => [
                r.item_name_snapshot,
                r.quantity,
                peso(r.sales),
              ])}
            />
            <ReportTable
              title="Sales by day"
              columns={["Date", "Orders", "Order gross"]}
              rows={(data.sales_by_day || []).map((r) => [
                r.date,
                r.orders,
                peso(r.gross),
              ])}
            />
          </div>
          {data.reservations && (
            <>
              <h2>Reservations and service</h2>
              <div className="ops-stats">
                <Stat title="Bookings" value={data.reservations.total} />
                <Stat title="Cancelled" value={data.reservations.cancelled} />
                <Stat title="No shows" value={data.reservations.no_show} />
                <Stat title="Completed" value={data.reservations.completed} />
              </div>
              <div className="ops-report-grid">
                <ReportTable
                  title="Table occupancy now"
                  columns={["Status", "Tables"]}
                  rows={(data.table_occupancy?.current || []).map((r) => [
                    label(r.operational_status),
                    r.total,
                  ])}
                />
                <ReportTable
                  title="Occupancy changes in period"
                  columns={["New status", "Changes"]}
                  rows={(data.table_occupancy?.changes || []).map((r) => [
                    label(r.to_status),
                    r.total,
                  ])}
                />
                <ReportTable
                  title="Delivery outcomes"
                  columns={["Status", "Deliveries"]}
                  rows={(data.deliveries || []).map((r) => [
                    label(r.status),
                    r.total,
                  ])}
                />
                <ReportTable
                  title="Delivery performance by rider"
                  columns={["Rider", "Delivered"]}
                  rows={(data.delivery_performance?.by_rider || []).map((r) => [
                    r.rider,
                    r.delivered,
                  ])}
                />
                <Stat
                  title="Average delivery time"
                  value={
                    data.delivery_performance?.average_minutes === null
                      ? "—"
                      : `${data.delivery_performance?.average_minutes || 0} min`
                  }
                  detail={`${data.delivery_performance?.completed || 0} completed deliveries`}
                />
              </div>
            </>
          )}
        </>
      )}
      {data?.payments && (
        <>
          <h2>Payments and refunds</h2>
          <div className="ops-report-grid">
            <ReportTable
              title="Payments by state"
              columns={["Status", "Count", "Amount"]}
              rows={(data.payments.by_status || []).map((r) => [
                label(r.status),
                r.count,
                peso(r.amount),
              ])}
            />
            <ReportTable
              title="Payments by method"
              columns={["Method", "Count", "Amount"]}
              rows={(data.payments.by_method || []).map((r) => [
                label(r.method),
                r.count,
                peso(r.amount),
              ])}
            />
            <Stat title="Refunded total" value={peso(data.payments.refunds)} />
          </div>
        </>
      )}
      <div className="ops-export">
        <strong>Download detail CSV</strong>
        {permissions.some((p) =>
          ["reports.operations", "orders.manage"].includes(p),
        ) && <button onClick={() => download("orders")}>Orders</button>}
        {permissions.some((p) =>
          ["reports.operations", "reservations.manage"].includes(p),
        ) && (
          <button onClick={() => download("reservations")}>Reservations</button>
        )}
        {permissions.some((p) =>
          ["reports.operations", "deliveries.manage"].includes(p),
        ) && <button onClick={() => download("deliveries")}>Deliveries</button>}
        {permissions.some((p) =>
          [
            "reports.financial",
            "reports.daily_transactions",
            "payments.manage",
          ].includes(p),
        ) && <button onClick={() => download("payments")}>Payments</button>}
      </div>
    </section>
  );
}

function ReportTable({ title, columns, rows }) {
  return (
    <div className="ops-panel">
      <h3>{title}</h3>
      {rows.length ? (
        <div
          className="ops-table-wrap"
          tabIndex={0}
          role="region"
          aria-label="Scrollable report table"
        >
          <table className="ops-table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No records in this range.</p>
      )}
    </div>
  );
}

export function CashierSummary() {
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    api("/cashier/summary")
      .then((r) => setData(r.data))
      .catch((e) => setError(e.message));
  }, []);
  return (
    <section className="welcome">
      <span className="eyebrow">CASHIER</span>
      <h1>Daily transactions</h1>
      <p>{data?.date || today()}</p>
      {!data && !error && <Skeleton label="Loading daily transactions" />}
      {error && <Feedback>{error}</Feedback>}
      {data && (
        <>
          <div className="ops-stats">
            <Stat title="Payments received" value={peso(data.paid_total)} />
            <Stat title="Refunds" value={peso(data.refund_total)} />
            <Stat title="Paid transactions" value={data.payment_count} />
          </div>
          <div className="ops-panel">
            <h3>Today’s activity</h3>
            <div
              className="ops-table-wrap"
              tabIndex={0}
              role="region"
              aria-label="Scrollable report table"
            >
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Reference</th>
                    <th>For</th>
                    <th>Method</th>
                    <th>Status</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((payment) => (
                    <tr key={payment.id}>
                      <td>{dateValue(payment.created_at)}</td>
                      <td>{payment.reference_number}</td>
                      <td>
                        {payment.order?.order_number ||
                          payment.reservation?.reference ||
                          `Dining session ${payment.dining_session_id || "—"}`}
                      </td>
                      <td>{label(payment.method)}</td>
                      <td>{label(payment.status)}</td>
                      <td>{peso(payment.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

export function ReservationCalendar({ user }) {
  const [loading, setLoading] = useState(true);
  const ask = usePrompt();
  const [mode, setMode] = useState("week"),
    [anchor, setAnchor] = useState(today()),
    [items, setItems] = useState([]),
    [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [history, setHistory] = useState({});
  const bounds = () => {
    const d = new Date(`${anchor}T12:00:00`),
      start = new Date(d);
    if (mode === "week")
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    if (mode === "month") start.setDate(1);
    const end = new Date(start);
    if (mode === "week") end.setDate(start.getDate() + 6);
    else if (mode === "month") end.setMonth(start.getMonth() + 1, 0);
    return { from: localDay(start), to: localDay(end) };
  };
  const range = bounds();
  async function load() {
    setError("");
    try {
      const result = await api(
        `/reservations?from=${range.from}&to=${range.to}&per_page=100`,
      );
      setItems(result.data || []);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, [range.from, range.to]);
  function move(step) {
    const d = new Date(`${anchor}T12:00:00`);
    if (mode === "day") d.setDate(d.getDate() + step);
    else if (mode === "week") d.setDate(d.getDate() + step * 7);
    else {
      d.setDate(1);
      d.setMonth(d.getMonth() + step);
    }
    setAnchor(localDay(d));
  }
  async function transition(item, next) {
    try {
      await api(`/reservations/${item.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }
  async function reassign(item) {
    const tableId = await ask(
      `New table ID for ${item.reference}:`,
      item.table_id || "",
    );
    if (!tableId) return;
    try {
      await api(`/reservations/${item.id}/reschedule`, {
        method: "POST",
        body: JSON.stringify({
          starts_at: new Date(item.starts_at).toISOString(),
          guest_count: item.guest_count,
          table_id: Number(tableId),
          guest_name: item.guest_name,
          guest_email: item.guest_email,
          guest_phone: item.guest_phone,
          notes: item.notes,
        }),
      });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }
  async function showHistory(item) {
    try {
      const result = await api(`/reservations/${item.id}`);
      setHistory((current) => ({
        ...current,
        [item.id]: result.data.history || [],
      }));
    } catch (e) {
      setError(e.message);
    }
  }
  const next = {
    pending: ["confirmed", "cancelled"],
    confirmed: ["checked_in", "no_show", "cancelled"],
    checked_in: ["seated"],
    seated: ["completed"],
  };
  const grouped = items.reduce((all, item) => {
    const key = localDay(new Date(item.starts_at));
    (all[key] ??= []).push(item);
    return all;
  }, {});
  return (
    <section className="welcome reservation-calendar">
      <span className="eyebrow">SERVICE DESK</span>
      <h1>Reservations calendar</h1>
      <p>
        Bookings are grouped by local service date. Availability and table
        assignment are revalidated by the reservation service.
      </p>
      {loading && <Skeleton label="Loading your content" />}
      {!loading && !error && items.length === 0 && (
        <EmptyState
          title="A little room in the calendar"
          description="No reservations match this date range. Try another date or status."
        />
      )}
      {error && <Feedback onRetry={load}>{error}</Feedback>}
      <div className="calendar-controls">
        <button onClick={() => move(-1)}>← Previous</button>
        <strong>
          {range.from} {range.from !== range.to && `— ${range.to}`}
        </strong>
        <button onClick={() => move(1)}>Next →</button>
        <select
          aria-label="Calendar view"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
        >
          <option value="day">Day</option>
          <option value="week">Week</option>
          <option value="month">Month</option>
        </select>
        <input
          aria-label="Calendar date"
          type="date"
          value={anchor}
          onChange={(e) => setAnchor(e.target.value)}
        />
      </div>
      {Object.keys(grouped).length === 0 && (
        <div className="ops-panel">
          <p>No reservations in this period.</p>
        </div>
      )}
      {Object.entries(grouped)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, bookings]) => (
          <section className="calendar-day" key={day}>
            <h2>
              {new Date(`${day}T12:00:00`).toLocaleDateString([], {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
              <small>{bookings.length} bookings</small>
            </h2>
            <div className="reservation-calendar-list">
              {bookings.map((item) => (
                <article className="calendar-booking" key={item.id}>
                  <div className="calendar-booking-info">
                    <strong>
                      {new Date(item.starts_at).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}{" "}
                      · {item.guest_name}
                    </strong>
                    <small>
                      {item.reference} · {item.guest_count} guests · Table{" "}
                      {item.tables?.length
                        ? item.tables
                            .map((table) => table.table_number)
                            .join(", ")
                        : item.table?.table_number || "unassigned"}{" "}
                      · {label(item.status)}
                    </small>
                    {item.guest_phone && <small>{item.guest_phone}</small>}
                    {history[item.id] && (
                      <div className="calendar-history">
                        {history[item.id].map((h) => (
                          <small key={h.id}>
                            {label(h.from_status || "created")} →{" "}
                            {label(h.to_status)} · {dateValue(h.created_at)}
                            {h.note ? ` · ${h.note}` : ""}
                          </small>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="calendar-booking-actions">
                    {(next[item.status] || []).map((value) => (
                      <button
                        key={value}
                        className={
                          value === "cancelled" || value === "no_show"
                            ? "secondary"
                            : ""
                        }
                        onClick={() => transition(item, value)}
                      >
                        {label(value)}
                      </button>
                    ))}
                    {["confirmed", "pending"].includes(item.status) && (
                      <button
                        className="secondary"
                        onClick={() => reassign(item)}
                      >
                        Reassign table
                      </button>
                    )}
                    <button
                      className="secondary"
                      onClick={() => showHistory(item)}
                    >
                      History
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
    </section>
  );
}

export { BusinessSettings } from "./features/BusinessSettings";
