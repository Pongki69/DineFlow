import { playSound } from "./uiSound";
import { subscribeToLiveChanges } from "./liveUpdates";
import { DatePicker } from "./components/DatePicker";
import { EmptyState, Feedback, Skeleton } from "./components/ui";
import { usePrompt } from "./components/ConfirmProvider";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE, api } from "./api";
import {
  ArrowUpRight,
  BarChart3,
  Bike,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  CreditCard,
  Download,
  ShoppingBag,
  Minus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import "./features/reportsPhone.css";
import "./features/overviewPhone.css";
import "./features/reservationAdmin.css";
import { useMediaQuery } from "./components/useMediaQuery";
import { SalesTrend, ShareBar, shareParts } from "./features/ReportCharts";
import {
  BOOKING_ACTION_TEXT,
  BOOKING_STATUS_TEXT,
  BookingsPhone,
  bookingTableText,
} from "./features/BookingsPhone";

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

function RangePicker({ range, setRange, preset, trailing = null }) {
  // Which quick range was picked; choosing dates by hand clears it.
  const [picked, setPicked] = useState("today");
  const choose = (value) => {
    setPicked(value);
    preset(value);
  };
  return (
    <div className="report-range">
      {[
        ["today", "Today"],
        ["week", "This week"],
        ["month", "This month"],
      ].map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={picked === value}
          onClick={() => choose(value)}
        >
          {label}
        </button>
      ))}
      {trailing}
      <div className="report-date-filter">
        <span>From</span>
        <DatePicker
          label="From"
          max={range.to}
          value={range.from}
          onChange={(value) => {
            setPicked("");
            setRange((r) => ({ ...r, from: value }));
          }}
        />
      </div>
      <div className="report-date-filter">
        <span>To</span>
        <DatePicker
          label="To"
          min={range.from}
          value={range.to}
          onChange={(value) => {
            setPicked("");
            setRange((r) => ({ ...r, to: value }));
          }}
        />
      </div>
    </div>
  );
}

function Stat({ title, value, detail, to, className = "" }) {
  const card = (
    <article className={`ops-stat${className ? ` ${className}` : ""}`}>
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
    return subscribeToLiveChanges(load);
  }, [range.from, range.to]);
  const permissions = user?.permissions || [];
  const has = (permission) => permissions.includes(permission);
  const phone = useMediaQuery("(max-width: 850px)");
  if (phone) {
    return (
      <section className="welcome operations-dashboard operations-dashboard--phone">
        <RangePicker range={range} setRange={setRange} preset={preset} />
        {loading && !data && <Skeleton label="Loading your content" />}
        {error && <Feedback onRetry={load}>{error}</Feedback>}
        {data && <OverviewPhone data={data} has={has} />}
      </section>
    );
  }
  return (
    <section className="welcome operations-dashboard">
      <span className="eyebrow">RESTAURANT OVERVIEW</span>
      <h1>Good day, {user?.name?.split(" ")[0]}</h1>
      <p>
        Live operational totals from {data?.range?.from || range.from} through{" "}
        {data?.range?.to || range.to}. Updates when restaurant activity changes.
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

/**
 * The manager's Home on a phone, laid out like the administrator's: one
 * headline figure, tappable number tiles, then short lists instead of tables.
 */
function OverviewPhone({ data, has }) {
  // Table numbers are stored as "Table 18"; show the number once.
  const tableName = (value) => String(value ?? "").replace(/^table\s*/i, "");
  const bookingTables = (item) =>
    item.tables?.length
      ? item.tables.map((table) => tableName(table.table_number)).join(", ")
      : item.table?.table_number
        ? tableName(item.table.table_number)
        : null;
  const tiles = [
    data.orders && {
      label: "Active orders",
      value: data.orders.active,
      note: `${data.orders.pending} pending`,
      to: "/orders",
      Icon: ShoppingBag,
    },
    data.deliveries && {
      label: "Awaiting rider",
      value: data.deliveries.unassigned,
      note: `${data.deliveries.active} active deliveries`,
      to: "/admin/deliveries",
      Icon: Bike,
      alert: Number(data.deliveries.unassigned) > 0,
    },
    data.reservations && {
      label: "Bookings today",
      value: data.reservations.today,
      note: `${data.reservations.no_show} no shows`,
      to: "/reservations",
      Icon: CalendarDays,
    },
    data.payments && {
      label: "Pending checkouts",
      value: data.payments.pending,
      note: "Waiting at the counter",
      to: "/payments",
      Icon: CreditCard,
    },
  ].filter(Boolean);
  const shortcuts = [
    has("orders.manage") && ["Manage orders", "/orders", ShoppingBag],
    has("deliveries.manage") && [
      "Dispatch deliveries",
      "/admin/deliveries",
      Bike,
    ],
    has("reservations.manage") && [
      "Reservations calendar",
      "/reservations",
      CalendarDays,
    ],
    has("payments.manage") && ["Cashier and payments", "/payments", CreditCard],
    has("reports.operations") && ["Operational reports", "/reports", BarChart3],
  ].filter(Boolean);
  const occupied = Object.entries(data.tables?.statuses || {});
  return (
    <div className="overview-phone">
      {data.orders && (
        <Link className="overview-hero" to="/reports">
          <span>Order value</span>
          <strong>{peso(data.orders.revenue)}</strong>
          <small>
            {data.orders.count} orders · {data.orders.cancelled} cancelled
            {data.payments && ` · ${peso(data.payments.paid)} received`}
          </small>
        </Link>
      )}
      {tiles.length > 0 && (
        <div className="overview-tiles">
          {tiles.map(({ label: name, value, note, to, Icon, alert }) => (
            <Link
              key={name}
              className="overview-tile"
              to={to}
              data-alert={alert || undefined}
            >
              <span className="overview-tile-head">
                {name}
                <Icon size={16} aria-hidden="true" />
              </span>
              <strong>{value}</strong>
              <small>{note}</small>
            </Link>
          ))}
        </div>
      )}

      {data.reservations && (
        <section className="overview-section">
          <div className="overview-section-head">
            <h2>Upcoming bookings</h2>
            <Link to="/reservations">
              Open desk <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </div>
          {data.reservations.upcoming?.length ? (
            <ul className="overview-list">
              {data.reservations.upcoming.slice(0, 5).map((item) => (
                <li key={item.id}>
                  <span className="overview-when">
                    {new Date(item.starts_at).toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                    })}
                    <b>
                      {new Date(item.starts_at).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </b>
                  </span>
                  <span className="overview-main">
                    <strong>{item.guest_name}</strong>
                    <small>
                      {item.guest_count}{" "}
                      {Number(item.guest_count) === 1 ? "guest" : "guests"} ·{" "}
                      {bookingTables(item)
                        ? `Table ${bookingTables(item)}`
                        : "No table yet"}
                    </small>
                  </span>
                  <span className="overview-badge">
                    {capitalised(label(item.status))}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="overview-empty">No upcoming bookings.</p>
          )}
        </section>
      )}

      {(occupied.length > 0 || data.open_sessions?.length > 0) && (
        <section className="overview-section">
          <div className="overview-section-head">
            <h2>Tables</h2>
            <Link to="/service">
              Manage tables <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </div>
          {occupied.length > 0 && (
            <div className="overview-chips">
              {occupied.map(([status, count]) => (
                <span key={status}>
                  <b>{count}</b> {label(status)}
                </span>
              ))}
              {data.tables && (
                <span>
                  <b>
                    {data.tables.active}/{data.tables.total}
                  </b>{" "}
                  active
                </span>
              )}
            </div>
          )}
          {data.open_sessions?.length > 0 && (
            <ul className="overview-list">
              {data.open_sessions.slice(0, 5).map((session) => (
                <li key={session.id}>
                  <span className="overview-when">
                    Table<b>{tableName(session.table?.table_number)}</b>
                  </span>
                  <span className="overview-main">
                    <strong>
                      {session.guest_count}{" "}
                      {Number(session.guest_count) === 1 ? "guest" : "guests"}
                    </strong>
                    <small>
                      Since{" "}
                      {new Date(session.opened_at).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {data.popular_items && (
        <section className="overview-section">
          <div className="overview-section-head">
            <h2>Popular dishes</h2>
            <Link to="/reports">
              Full reports <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </div>
          {data.popular_items.length ? (
            <ol className="overview-list overview-list--ranked">
              {data.popular_items.map((item, index) => (
                <li key={item.item_name_snapshot}>
                  <span className="overview-rank">{index + 1}</span>
                  <span className="overview-main">
                    <strong>{item.item_name_snapshot}</strong>
                    <small>{Number(item.quantity)} sold</small>
                  </span>
                  <b className="overview-amount">{peso(item.sales)}</b>
                </li>
              ))}
            </ol>
          ) : (
            <p className="overview-empty">
              No completed item sales in this period.
            </p>
          )}
        </section>
      )}

      {shortcuts.length > 0 && (
        <section className="overview-section">
          <div className="overview-section-head">
            <h2>Go to</h2>
          </div>
          <ul className="overview-list overview-list--links">
            {shortcuts.map(([name, to, Icon]) => (
              <li key={to}>
                <Link to={to}>
                  <span className="overview-link-icon">
                    <Icon size={17} aria-hidden="true" />
                  </span>
                  <strong>{name}</strong>
                  <ChevronRight size={17} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
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
    return subscribeToLiveChanges(load);
  }, [range.from, range.to]);
  function download(dataset) {
    window.location.assign(
      `${API_BASE}/reports/export?dataset=${dataset}&from=${range.from}&to=${range.to}`,
    );
  }
  const phone = useMediaQuery("(max-width: 850px)");
  const [tab, setTab] = useState("sales");
  const [allSales, setAllSales] = useState(false);
  const [dayTable, setDayTable] = useState(false);
  const [allDishes, setAllDishes] = useState(false);
  const permissions = user?.permissions || [];
  const allowed = (list) => permissions.some((p) => list.includes(p));
  const exports = [
    ["orders", "Orders", ["reports.operations", "orders.manage"]],
    [
      "reservations",
      "Reservations",
      ["reports.operations", "reservations.manage"],
    ],
    ["deliveries", "Deliveries", ["reports.operations", "deliveries.manage"]],
    [
      "payments",
      "Payments",
      ["reports.financial", "reports.daily_transactions", "payments.manage"],
    ],
  ].filter(([, , needs]) => allowed(needs));

  // Phones show one section at a time; larger screens show them all.
  const sections = [
    data?.sales && ["sales", "Sales"],
    data?.sales && data?.reservations && ["service", "Service"],
    data?.payments && ["payments", "Payments"],
  ].filter(Boolean);
  const current = sections.some(([key]) => key === tab)
    ? tab
    : sections[0]?.[0];
  const show = (key) => !phone || sections.length < 2 || current === key;

  const sales = data?.sales;
  const previous = data?.previous_sales;
  const average = (gross, orders) =>
    Number(orders) ? Number(gross) / Number(orders) : 0;
  const versus = previousLabel(range);
  const moneyLines = sales
    ? [
        ["Discounts", sales.discounts],
        ["Tax", sales.tax],
        ["Service charges", sales.service_charges],
        ["Delivery fees", sales.delivery_fees],
      ]
    : [];
  // On phones, ₱0 lines wait behind "Show all".
  const shownLines = moneyLines.filter(
    ([, value]) => !phone || allSales || Number(value) !== 0,
  );
  const hiddenLines = moneyLines.length - shownLines.length;
  const trendRows = data?.sales_trend
    ? fillDays(data.sales_trend.days || [], data.sales_trend)
    : fillDays(data?.sales_by_day || [], range);
  const trendLonger = data?.sales_trend && data.sales_trend.from !== range.from;
  const dishes = data?.popular_items || [];
  const deliveryMinutes = data?.delivery_performance?.average_minutes;
  // Phones keep Export on the quick-range row; larger screens by the title.
  const exportMenu = exports.length > 0 && (
    <ExportMenu
      items={exports.map(([key, name]) => [key, name])}
      onPick={download}
    />
  );

  return (
    <section className="welcome reports-dashboard">
      <span className="eyebrow">REPORTS</span>
      <div className="reports-head">
        <h1>Restaurant performance</h1>
        {!phone && exportMenu}
      </div>
      <p className="reports-intro">
        Figures are calculated from saved order, payment, reservation, and
        delivery records.
      </p>
      <RangePicker
        range={range}
        setRange={setRange}
        preset={preset}
        trailing={phone ? exportMenu : null}
      />
      {loading && !data && <Skeleton label="Loading your content" />}
      {error && <Feedback onRetry={load}>{error}</Feedback>}
      {phone && sections.length > 1 && (
        <div
          className="reports-tabs"
          role="tablist"
          aria-label="Report sections"
        >
          {sections.map(([key, name]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={current === key}
              onClick={() => setTab(key)}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      {sales && show("sales") && (
        <>
          <div className="ops-stats ops-stats--sales">
            <Stat
              title="Orders"
              value={sales.orders}
              detail={
                previous && (
                  <Change
                    now={sales.orders}
                    before={previous.orders}
                    versus={versus}
                  />
                )
              }
            />
            <Stat
              title="Order gross"
              value={peso(sales.gross)}
              detail={
                previous && (
                  <Change
                    now={sales.gross}
                    before={previous.gross}
                    versus={versus}
                  />
                )
              }
            />
            <Stat
              title="Average order"
              value={peso(average(sales.gross, sales.orders))}
              detail={
                previous && (
                  <Change
                    now={average(sales.gross, sales.orders)}
                    before={average(previous.gross, previous.orders)}
                    versus={versus}
                  />
                )
              }
            />
            {shownLines.map(([title, value]) => (
              <Stat key={title} title={title} value={peso(value)} />
            ))}
          </div>
          {phone && (hiddenLines > 0 || allSales) && (
            <div className="reports-more">
              <button type="button" onClick={() => setAllSales((v) => !v)}>
                {allSales
                  ? "Hide ₱0.00 lines"
                  : `Show all (${hiddenLines} at ₱0.00)`}
              </button>
            </div>
          )}
          <SalesTrend
            rows={trendRows}
            span={trendLonger ? "Last 7 days" : null}
          />
          <div className="reports-more">
            <button
              type="button"
              aria-expanded={dayTable}
              onClick={() => setDayTable((v) => !v)}
            >
              {dayTable ? "Hide table" : "Show as table"}
            </button>
          </div>
          <div className="ops-report-grid">
            {dayTable && (
              <ReportTable
                title="Sales by day"
                columns={["Date", "Orders", "Order gross"]}
                rows={trendRows.map((r) => [r.date, r.orders, peso(r.gross)])}
              />
            )}
            <ReportTable
              title="Orders by type"
              chart={
                <ShareBar
                  label="Share of order total by type"
                  parts={shareParts(
                    (data.orders_by_type || []).map((r) => ({
                      key: r.order_type,
                      label: capitalised(label(r.order_type)),
                      value: Number(r.total) || 0,
                    })),
                    ["dine_in", "pickup", "delivery"],
                  )}
                />
              }
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
              rows={[...(data.orders_by_status || [])]
                .sort((a, b) => Number(b.total) - Number(a.total))
                .map((r) => [label(r.status), r.total])}
            />
            <ReportTable
              title="Popular dishes"
              unit="sold"
              columns={["Menu item", "Quantity", "Sales"]}
              rows={(allDishes ? dishes : dishes.slice(0, 5)).map((r) => [
                r.item_name_snapshot,
                r.quantity,
                peso(r.sales),
              ])}
              footer={
                dishes.length > 5 && (
                  <div className="reports-more">
                    <button
                      type="button"
                      onClick={() => setAllDishes((v) => !v)}
                    >
                      {allDishes
                        ? "Show top 5"
                        : `Show ${dishes.length - 5} more`}
                    </button>
                  </div>
                )
              }
            />
          </div>
        </>
      )}
      {sales && data.reservations && show("service") && (
        <>
          <h2>Reservations and service</h2>
          <div className="ops-stats">
            <Stat title="Bookings" value={data.reservations.total} />
            <Stat title="Cancelled" value={data.reservations.cancelled} />
            <Stat title="No shows" value={data.reservations.no_show} />
            <Stat title="Completed" value={data.reservations.completed} />
            <Stat
              title="Average delivery time"
              value={
                deliveryMinutes === null || deliveryMinutes === undefined
                  ? "—"
                  : `${deliveryMinutes} min`
              }
              detail={`${data.delivery_performance?.completed || 0} completed deliveries`}
            />
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
          </div>
        </>
      )}
      {data?.payments && show("payments") && (
        <>
          <h2>Payments and refunds</h2>
          <div className="ops-stats">
            <Stat
              title="Refunded total"
              value={peso(data.payments.refunds)}
              className="ops-stat--hero"
            />
          </div>
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
              chart={
                <ShareBar
                  label="Share of paid amount by method"
                  parts={shareParts(
                    (data.payments.by_method || []).map((r) => ({
                      key: r.method,
                      label: capitalised(label(r.method)),
                      value: Number(r.amount) || 0,
                    })),
                    ["cash", "card", "online", "gcash"],
                  )}
                />
              }
              columns={["Method", "Count", "Amount"]}
              rows={(data.payments.by_method || []).map((r) => [
                label(r.method),
                r.count,
                peso(r.amount),
              ])}
            />
          </div>
        </>
      )}
    </section>
  );
}

/** "vs yesterday", "vs previous 7 days" for the comparison line. */
function previousLabel(range) {
  const days =
    Math.round(
      (new Date(`${range.to}T12:00:00`) - new Date(`${range.from}T12:00:00`)) /
        86400000,
    ) + 1;
  if (days === 1)
    return range.to === today() ? "vs yesterday" : "vs the day before";
  return `vs the previous ${days} days`;
}

// "vs yesterday" becomes "Nothing yesterday to compare", and so on.
const nothingBefore = (versus) =>
  versus === "vs yesterday"
    ? "Nothing yesterday to compare"
    : `Nothing ${versus.replace(/^vs /, "in ")} to compare`;

/** A small up or down change against the previous period. */
function Change({ now, before, versus }) {
  const a = Number(now) || 0,
    b = Number(before) || 0;
  if (!b) {
    return (
      <span className="report-change" data-trend="flat">
        {a ? nothingBefore(versus) : `No change ${versus}`}
      </span>
    );
  }
  const change = Math.round(((a - b) / b) * 100);
  const trend = change > 0 ? "up" : change < 0 ? "down" : "flat";
  const Icon =
    trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  return (
    <span className="report-change" data-trend={trend}>
      <Icon size={13} aria-hidden="true" />
      {change > 0 ? "+" : ""}
      {change}% {versus}
    </span>
  );
}

/** One Export button; the datasets open in a small menu under it. */
function ExportMenu({ items, onPick }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (
        event.type === "keydown"
          ? event.key === "Escape"
          : !ref.current?.contains(event.target)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div className="reports-export" ref={ref}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <Download size={16} aria-hidden="true" />
        Export
      </button>
      {open && (
        <div className="reports-export-menu" role="menu">
          <small>Download CSV for this range</small>
          {items.map(([key, name]) => (
            <button
              key={key}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onPick(key);
              }}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Days without orders are missing from the API; the chart shows them as
// zero, from the range start up to the end or today, whichever is first.
function fillDays(rows, range) {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const iso = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const today = iso(new Date());
  const end = range.to < today ? range.to : today;
  const days = [];
  const cursor = new Date(`${range.from}T12:00:00`);
  while (iso(cursor) <= end && days.length < 93) {
    const date = iso(cursor);
    days.push(byDate.get(date) || { date, orders: 0, gross: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days.length ? days : rows;
}

// Counts arrive as "1.00"; show whole numbers as 1.
const reportCell = (cell) =>
  typeof cell === "string" && /^\d+(\.0+)?$/.test(cell)
    ? Number(cell).toLocaleString()
    : cell;
const capitalised = (cell) =>
  typeof cell === "string" ? cell.replace(/^./, (l) => l.toUpperCase()) : cell;

/**
 * A report table. On phones it reads as a bar list: the label, its count
 * under it, the main figure on the right, and a bar for its share.
 */
function ReportTable({
  title,
  columns,
  rows,
  unit,
  chart = null,
  footer = null,
}) {
  const phone = useMediaQuery("(max-width: 850px)");
  if (phone) {
    const counts = rows.map((row) => Number(row[1]) || 0);
    const most = Math.max(1, ...counts);
    const noun = unit || String(columns[1] || "").toLowerCase();
    return (
      <div className="ops-panel ops-panel--bars">
        <h3>{title}</h3>
        {chart}
        {rows.length ? (
          <ol className="ops-bars">
            {rows.map((row, i) => (
              <li key={i}>
                <div>
                  <span>
                    <strong>{capitalised(row[0])}</strong>
                    {row.length > 2 && (
                      <small>
                        {reportCell(row[1])} {noun}
                      </small>
                    )}
                  </span>
                  <b>{reportCell(row.at(-1))}</b>
                </div>
                <i
                  aria-hidden="true"
                  style={{ "--share": `${(counts[i] / most) * 100}%` }}
                />
              </li>
            ))}
          </ol>
        ) : (
          <p>No records in this range.</p>
        )}
        {footer}
      </div>
    );
  }
  return (
    <div className="ops-panel">
      <h3>{title}</h3>
      {chart}
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
                    <td key={j}>{reportCell(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No records in this range.</p>
      )}
      {footer}
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
  // Phones get one day of cards, ten at a time; desktop keeps the week list.
  const phone = useMediaQuery("(max-width: 850px)");
  const [page, setPage] = useState(1);
  const [mode, setMode] = useState(() =>
      typeof window !== "undefined" &&
      window.matchMedia?.("(max-width: 850px)").matches
        ? "day"
        : "week",
    ),
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
        `/reservations?from=${range.from}&to=${range.to}&per_page=100${status ? `&status=${status}` : ""}`,
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
    return subscribeToLiveChanges(load);
  }, [range.from, range.to, status]);
  useEffect(() => setPage(1), [range.from, range.to, status]);
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
      playSound(
        next === "cancelled"
          ? "remove"
          : next === "no_show"
            ? "tap"
            : "success",
      );
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
  const statuses = [
    "pending",
    "confirmed",
    "checked_in",
    "seated",
    "completed",
    "cancelled",
    "no_show",
  ];
  if (phone)
    return (
      <BookingsPhone
        {...{
          mode,
          setMode,
          anchor,
          setAnchor,
          range,
          move,
          goToday: () => setAnchor(today()),
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
        }}
      />
    );
  const grouped = items.reduce((all, item) => {
    const key = localDay(new Date(item.starts_at));
    (all[key] ??= []).push(item);
    return all;
  }, {});
  return (
    <section className="welcome reservation-calendar">
      <span className="eyebrow">SERVICE DESK</span>
      <h1>Reservations calendar</h1>
      <p>Review upcoming bookings and coordinate each service day.</p>
      {loading && <Skeleton label="Loading your content" />}
      {error && <Feedback onRetry={load}>{error}</Feedback>}
      <div className="calendar-controls">
        <button
          type="button"
          onClick={() => move(-1)}
          aria-label="Previous period"
        >
          <ChevronLeft size={17} aria-hidden="true" />
          Previous
        </button>
        <strong>
          {new Date(`${range.from}T12:00:00`).toLocaleDateString([], {
            month: "short",
            day: "numeric",
          })}{" "}
          {range.from !== range.to &&
            `— ${new Date(`${range.to}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`}
        </strong>
        <button type="button" onClick={() => move(1)} aria-label="Next period">
          Next
          <ChevronRight size={17} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => setAnchor(today())}>
          Today
        </button>
        <select
          aria-label="Calendar view"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
        >
          <option value="day">Day</option>
          <option value="week">Week</option>
          <option value="month">Month</option>
        </select>
        <DatePicker
          label="Calendar date"
          value={anchor}
          onChange={(value) => value && setAnchor(value)}
        />
        <select
          aria-label="Reservation status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          {[
            "pending",
            "confirmed",
            "checked_in",
            "seated",
            "completed",
            "cancelled",
            "no_show",
          ].map((value) => (
            <option key={value} value={value}>
              {label(value)}
            </option>
          ))}
        </select>
      </div>
      <div className="reservation-calendar-summary">
        <CalendarDays size={16} aria-hidden="true" />
        <span>{items.length} bookings in this period</span>
        <span>Grouped by local service date</span>
      </div>
      {!loading && !error && items.length === 0 && (
        <EmptyState
          title="No reservations in this period"
          description="Choose another date or status to find your bookings."
        />
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
              <small>
                {bookings.length}{" "}
                {bookings.length === 1 ? "booking" : "bookings"}
              </small>
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
                      {item.reference} · {item.guest_count} guests ·{" "}
                      {bookingTableText(item)} ·{" "}
                      {BOOKING_STATUS_TEXT[item.status] || label(item.status)}
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
                        {BOOKING_ACTION_TEXT[value] || label(value)}
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
