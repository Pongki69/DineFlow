import { playSound } from "./uiSound";
import { subscribeToLiveChanges } from "./liveUpdates";
import { DatePicker } from "./components/DatePicker";
import {
  ReservationStatusPill,
  reservationStatusTone,
} from "./components/OrderStatusPill";
import { RowMenu } from "./components/RowMenu";
import { BookingDayHeading, BookingRow } from "./components/BookingRow";
import { CountUp } from "./components/CountUp";
import { useDragScroll } from "./components/useDragScroll";
import { EmptyState, Feedback, Skeleton, StatusBadge } from "./components/ui";
import { CardHeading, StatIcon, useAdminDesktop } from "./components/adminDesk";
import { usePrompt } from "./components/ConfirmProvider";
import { Fragment, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE, api } from "./api";
import {
  ArrowLeftRight,
  ArrowUpDown,
  ArrowUpRight,
  Ban,
  Banknote,
  BarChart3,
  Bike,
  CalendarCheck,
  CalendarClock,
  ChevronLeft,
  UtensilsCrossed,
  LogIn,
  UsersRound,
  Table2,
  Phone,
  CircleX,
  ChevronRight,
  CalendarDays,
  CalendarX2,
  ChefHat,
  CircleCheck,
  Clock3,
  CreditCard,
  Download,
  HandCoins,
  History,
  LayoutGrid,
  ListChecks,
  PackageCheck,
  Percent,
  Receipt,
  ReceiptText,
  Repeat2,
  ShoppingBag,
  Minus,
  Sparkles,
  Tag,
  TrendingDown,
  TrendingUp,
  Truck,
  Undo2,
  Users,
  UserX,
  Utensils,
  Wallet,
  Search,
  X,
} from "lucide-react";
import "./features/reportsPhone.css";
import "./features/overviewPhone.css";
import "./features/reservationAdmin.css";
import { useMediaQuery } from "./components/useMediaQuery";
import {
  Donut,
  SalesTrend,
  ShareBar,
  compactPeso,
  shareParts,
} from "./features/ReportCharts";
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

const daysAgo = (count) => {
  const date = new Date();
  date.setDate(date.getDate() - count);
  return localDay(date);
};
const presetRange = (name) => ({
  from:
    name === "today"
      ? today()
      : name === "last7"
        ? daysAgo(6)
        : name === "week"
          ? startOfWeek()
          : startOfMonth(),
  to: today(),
});

function useRange(initial = "today") {
  const [range, setRange] = useState(() => presetRange(initial));
  // Which quick range is showing; choosing dates by hand clears it.
  const [picked, setPicked] = useState(initial);
  function preset(name) {
    setPicked(name);
    setRange(presetRange(name));
  }
  return [range, setRange, preset, picked, setPicked];
}

const RANGE_PRESETS = [
  ["today", "Today"],
  ["week", "This week"],
  ["month", "This month"],
];

function RangePicker({
  range,
  setRange,
  preset,
  trailing = null,
  presets = RANGE_PRESETS,
  picked: pickedFromParent,
  setPicked: setPickedFromParent,
}) {
  // Which quick range was picked; choosing dates by hand clears it. A page
  // can own this (to jump to a preset from elsewhere) or leave it here.
  const [ownPicked, setOwnPicked] = useState("today");
  const picked = setPickedFromParent ? pickedFromParent : ownPicked;
  const setPicked = setPickedFromParent || setOwnPicked;
  const choose = (value) => {
    setPicked(value);
    preset(value);
  };
  const desk = useAdminDesktop();
  const spanDays =
    range.from && range.to
      ? Math.round(
          (new Date(`${range.to}T12:00:00`) -
            new Date(`${range.from}T12:00:00`)) /
            86400000,
        ) + 1
      : 0;
  return (
    <div className="report-range" data-desk={desk || undefined}>
      {presets.map(([value, label]) => (
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
      {desk && spanDays > 0 && (
        <span className="report-range-span">
          {spanDays} {spanDays === 1 ? "day" : "days"}
        </span>
      )}
    </div>
  );
}

// A tile's figure on the admin desktop: whole numbers and peso amounts
// count up into place; anything else ("14 min") shows as it is.
function StatFigure({ value }) {
  const desk = useAdminDesktop();
  if (!desk) return value;
  if (typeof value === "number" && Number.isFinite(value))
    return <CountUp value={value} />;
  const money =
    typeof value === "string" && /^₱[\d,]+(\.\d+)?$/.test(value.trim());
  if (money)
    return (
      <CountUp
        value={Number(value.replace(/[₱,]/g, ""))}
        decimals={2}
        format={peso}
      />
    );
  return value;
}

function Stat({ title, value, detail, to, icon, className = "" }) {
  const card = (
    <article className={`ops-stat${className ? ` ${className}` : ""}`}>
      <span>{title}</span>
      <strong>
        <StatFigure value={value} />
      </strong>
      {detail && <small>{detail}</small>}
      <StatIcon icon={icon} />
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

// The next step of a booking, as a button or a menu option.
const STEP_ICONS = {
  confirmed: CalendarCheck,
  checked_in: LogIn,
  seated: UtensilsCrossed,
  completed: CircleCheck,
};

// Table statuses on the overview and reports share one icon each.
const TABLE_STATUS_ICONS = {
  available: CircleCheck,
  reserved: CalendarClock,
  occupied: Users,
  cleaning: Sparkles,
  unavailable: Ban,
};

/** "Nov 6, 2026" or "Nov 1 – Nov 6, 2026" from two YYYY-MM-DD days. */
function rangeText(from, to) {
  const day = (value) => {
    const [year, month, date] = String(value).split("-").map(Number);
    return new Date(year, month - 1, date);
  };
  const long = { month: "short", day: "numeric", year: "numeric" };
  if (!from || !to || from === to)
    return day(from || to).toLocaleDateString([], long);
  const start = day(from).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
  return `${start} – ${day(to).toLocaleDateString([], long)}`;
}

/** Overview panel header: the shared header on desktop, plain below it. */
function PanelHead({ icon, title, description, to, link }) {
  const desk = useAdminDesktop();
  if (!desk)
    return (
      <div className="ops-panel-head">
        <h3>{title}</h3>
        {to && <Link to={to}>{link}</Link>}
      </div>
    );
  return (
    <CardHeading
      as="h3"
      icon={icon}
      title={title}
      description={description}
      actions={
        to && (
          <Link className="admin-text-link" to={to}>
            {link}
            <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        )
      }
    />
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
  const desk = useAdminDesktop();
  if (phone) {
    return (
      <section className="welcome operations-dashboard operations-dashboard--phone">
        <RangePicker range={range} setRange={setRange} preset={preset} />
        {loading && !data && (
          <Skeleton
            label="Loading your content"
            layout={{ stats: 4, body: "charts" }}
          />
        )}
        {error && <Feedback onRetry={load}>{error}</Feedback>}
        {data && <OverviewPhone data={data} has={has} />}
      </section>
    );
  }
  return (
    <section className="welcome operations-dashboard">
      <span className="eyebrow">RESTAURANT OVERVIEW</span>
      <h1>Good day, {user?.name?.split(" ")[0]}</h1>
      {desk ? (
        <p>
          Live totals for{" "}
          {rangeText(
            data?.range?.from || range.from,
            data?.range?.to || range.to,
          )}
          . Updates when restaurant activity changes.
        </p>
      ) : (
        <p>
          Live operational totals from {data?.range?.from || range.from} through{" "}
          {data?.range?.to || range.to}. Updates when restaurant activity
          changes.
        </p>
      )}
      {loading && (
        <Skeleton
          label="Loading your content"
          layout={{ stats: 4, body: "charts" }}
        />
      )}
      <RangePicker range={range} setRange={setRange} preset={preset} />
      {error && <Feedback onRetry={load}>{error}</Feedback>}

      {data?.orders && (
        <>
          <h2>Orders and revenue</h2>
          <div className="ops-stats">
            <Stat
              title="Orders"
              value={data.orders.count}
              to="/orders"
              icon={ShoppingBag}
            />
            <Stat
              title="Active orders"
              value={data.orders.active}
              detail={`${data.orders.pending} pending`}
              to="/orders"
              icon={Clock3}
            />
            <Stat
              title="Order value"
              value={peso(data.orders.revenue)}
              detail={`${data.orders.cancelled} cancelled`}
              to="/reports"
              icon={Banknote}
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
              icon={Wallet}
            />
            <Stat
              title="Refunded"
              value={peso(data.payments.refunded)}
              to="/payments"
              icon={Undo2}
            />
            <Stat
              title="Pending checkouts"
              value={data.payments.pending}
              to="/payments"
              icon={CreditCard}
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
              icon={CalendarDays}
            />
            <Stat
              title="Cancelled"
              value={data.reservations.cancelled}
              detail="In selected period"
              icon={CalendarX2}
            />
            <Stat
              title="No shows"
              value={data.reservations.no_show}
              detail="In selected period"
              icon={UserX}
            />
          </div>
          <div className="ops-panel">
            <PanelHead
              icon={CalendarDays}
              title="Upcoming bookings"
              description="The next reservations on the calendar."
              to="/reservations"
              link="Open reservation desk"
            />
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
                        <td>
                          {desk ? (
                            <StatusBadge status={item.status} />
                          ) : (
                            label(item.status)
                          )}
                        </td>
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
                  icon={TABLE_STATUS_ICONS[status] || LayoutGrid}
                />
              ),
            )}
            <Stat
              title="Tables"
              value={`${data.tables.active} / ${data.tables.total}`}
              detail="Active / total"
              to="/service"
              icon={LayoutGrid}
            />
          </div>
        </>
      )}
      {data?.open_sessions && (
        <div className="ops-panel">
          <PanelHead
            icon={Utensils}
            title="Open dining sessions"
            description="Tables with guests seated right now."
            to="/service"
            link="Manage tables"
          />
          {desk ? (
            data.open_sessions.length ? (
              <div className="ops-table-wrap">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>Table</th>
                      <th>Guests</th>
                      <th>Seated since</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.open_sessions.map((session) => (
                      <tr key={session.id}>
                        <td>{session.table?.table_number}</td>
                        <td>{session.guest_count}</td>
                        <td>{dateValue(session.opened_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>No tables are seated right now.</p>
            )
          ) : (
            <div className="ops-inline-list">
              {data.open_sessions.map((session) => (
                <span key={session.id}>
                  Table {session.table?.table_number} · {session.guest_count}{" "}
                  guests · since {dateValue(session.opened_at)}
                </span>
              ))}
            </div>
          )}
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
              icon={Truck}
            />
            <Stat
              title="Awaiting rider"
              value={data.deliveries.unassigned}
              to="/admin/deliveries"
              icon={Bike}
            />
            <Stat
              title="Delivered"
              value={data.deliveries.delivered}
              detail={`${data.deliveries.failed} failed in range`}
              to="/admin/deliveries"
              icon={PackageCheck}
            />
          </div>
        </>
      )}
      {data?.popular_items && (
        <div className="ops-panel">
          <PanelHead
            icon={ChefHat}
            title="Popular menu items"
            description="Best sellers in the selected period."
            to="/reports"
            link="Full reports"
          />
          {desk && data.popular_items.length > 0 ? (
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Menu item</th>
                    <th>Sold</th>
                    <th>Sales</th>
                  </tr>
                </thead>
                <tbody>
                  {data.popular_items.map((item) => (
                    <tr key={item.item_name_snapshot}>
                      <td>{item.item_name_snapshot}</td>
                      <td>{item.quantity}</td>
                      <td>{peso(item.sales)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
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
          )}
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
  // Admin desktop: a week of context by default, a chart that follows the
  // range, one card when a range has no orders, and quiet empty sections.
  const desk = useAdminDesktop();
  const [range, setRange, preset, picked, setPicked] = useRange(
    desk ? "last7" : "today",
  );
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
  const exportUrl = (dataset) =>
    `${API_BASE}/reports/export?dataset=${dataset}&from=${range.from}&to=${range.to}`;
  // Admin desktop: a preview of the file first; elsewhere it downloads.
  const [exportPreview, setExportPreview] = useState(null);
  function download(dataset) {
    if (!desk) {
      window.location.assign(exportUrl(dataset));
      return;
    }
    setExportPreview({ dataset, loading: true, rows: [], total: 0 });
    fetch(exportUrl(dataset), { credentials: "include" })
      .then((response) => {
        if (!response.ok) throw new Error("The export could not be loaded.");
        return response.text();
      })
      .then((text) => {
        const rows = parseCsv(text.replace(/^\uFEFF/, ""));
        setExportPreview({
          dataset,
          loading: false,
          header: rows[0] || [],
          rows: rows.slice(1),
          total: Math.max(0, rows.length - 1),
        });
      })
      .catch((failure) =>
        setExportPreview({
          dataset,
          loading: false,
          error: failure.message,
          rows: [],
          total: 0,
        }),
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
        ["Discounts", sales.discounts, Tag],
        ["Tax", sales.tax, Percent],
        ["Service charges", sales.service_charges, HandCoins],
        ["Delivery fees", sales.delivery_fees, Bike],
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
  // Desktop: the chart covers exactly the chosen range, by hour for one day.
  const hourRows =
    desk && data?.sales_by_hour ? fillHours(data.sales_by_hour) : null;
  // Past about two months, a bar per day is too thin to read: weeks.
  const rangeDays =
    Math.round(
      (new Date(`${range.to}T12:00:00`) - new Date(`${range.from}T12:00:00`)) /
        86400000,
    ) + 1;
  const weekly = desk && !hourRows && rangeDays > 62;
  const chartRows = !desk
    ? trendRows
    : hourRows ||
      (weekly
        ? weekRows(fillDays(data?.sales_by_day || [], range, 400))
        : fillDays(data?.sales_by_day || [], range));
  const chartBucket = hourRows ? "hour" : weekly ? "week" : "day";
  const noOrders = desk && Boolean(sales) && Number(sales.orders) === 0;
  const paidTotal = (data?.payments?.by_method || []).reduce(
    (sum, row) => sum + (Number(row.amount) || 0),
    0,
  );
  const refunded = Number(data?.payments?.refunds) || 0;
  // Desktop: a table with nothing in the range is named in one quiet line
  // under the section instead of taking a card of its own.
  const quiet = (tables) =>
    desk
      ? [
          tables.filter(([, rows]) => rows.length).map(([, , node]) => node),
          tables.filter(([, rows]) => !rows.length).map(([title]) => title),
        ]
      : [tables.map(([, , node]) => node), []];
  const dishes = data?.popular_items || [];
  const deliveryMinutes = data?.delivery_performance?.average_minutes;
  const tableToggle = (
    <button
      type="button"
      className="reports-table-toggle"
      aria-expanded={dayTable}
      onClick={() => setDayTable((v) => !v)}
    >
      {dayTable ? "Hide table" : "Show as table"}
    </button>
  );
  const deliveryTime = data?.delivery_performance && (
    <Stat
      title="Average delivery time"
      icon={Clock3}
      value={
        deliveryMinutes === null || deliveryMinutes === undefined
          ? "—"
          : `${deliveryMinutes} min`
      }
      detail={`${data.delivery_performance?.completed || 0} completed deliveries`}
    />
  );
  const statusRecords = [...(data?.orders_by_status || [])].sort(
    (a, b) => Number(b.total) - Number(a.total),
  );
  const paymentRecords = desk
    ? [...(data?.payments?.by_status || [])].sort(
        (a, b) => Number(b.amount) - Number(a.amount),
      )
    : data?.payments?.by_status || [];
  const byCount = (rows) =>
    desk ? [...rows].sort((a, b) => Number(b[1]) - Number(a[1])) : rows;
  const deliveryRecords = desk
    ? [...(data?.deliveries || [])].sort(
        (a, b) => Number(b.total) - Number(a.total),
      )
    : data?.deliveries || [];
  const deliveryOutcomes = [
    "Delivery outcomes",
    Truck,
    ["Status", "Deliveries"],
    deliveryRecords.map((r) => [label(r.status), r.total]),
    null,
    {
      bars: desk,
      tones: deliveryRecords.map((r) => DELIVERY_TONES[r.status] || "neutral"),
    },
  ];
  const deliveryRiders = [
    "Delivery performance by rider",
    Bike,
    ["Rider", "Delivered"],
    byCount(
      (data?.delivery_performance?.by_rider || []).map((r) => [
        r.rider,
        r.delivered,
      ]),
    ),
    null,
    // Many riders: the top five, then "Show N more".
    { bars: desk, limit: 5 },
  ];
  // Phones keep Export on the quick-range row; larger screens by the title.
  const exportMenu = exports.length > 0 && (
    <>
      <ExportMenu
        items={exports.map(([key, name]) => [key, name])}
        onPick={download}
      />
      <ExportPreview
        preview={exportPreview}
        name={
          exports.find(([key]) => key === exportPreview?.dataset)?.[1] ||
          "Export"
        }
        range={range}
        href={exportPreview ? exportUrl(exportPreview.dataset) : undefined}
        onClose={() => setExportPreview(null)}
      />
    </>
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
        picked={picked}
        setPicked={setPicked}
        presets={
          desk
            ? [
                ["today", "Today"],
                ["last7", "Last 7 days"],
                ...RANGE_PRESETS.slice(1),
              ]
            : RANGE_PRESETS
        }
        trailing={phone ? exportMenu : null}
      />
      {loading && !data && (
        <Skeleton
          label="Loading your content"
          layout={{ stats: 4, body: "charts" }}
        />
      )}
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
      {noOrders && show("sales") && (
        <div className="reports-empty" role="status">
          <StatIcon icon={ShoppingBag} />
          <div>
            <h2>{noOrdersTitle(range)}</h2>
            <p>
              {data.last_order_at
                ? `The last order was on ${new Date(data.last_order_at).toLocaleString([], { month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}.`
                : "No orders have been placed yet."}
            </p>
          </div>
          <div className="reports-empty-actions">
            {picked !== "last7" && (
              <button
                type="button"
                className="ui-button ui-button--secondary"
                onClick={() => preset("last7")}
              >
                Last 7 days
              </button>
            )}
            {picked !== "month" && (
              <button
                type="button"
                className="ui-button ui-button--secondary"
                onClick={() => preset("month")}
              >
                This month
              </button>
            )}
          </div>
        </div>
      )}
      {sales && show("sales") && !noOrders && (
        <>
          <div
            className={`ops-stats ops-stats--sales${desk ? " ops-stats--headline" : ""}`}
          >
            <Stat
              title="Orders"
              value={sales.orders}
              icon={ShoppingBag}
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
              icon={Banknote}
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
              icon={Receipt}
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
            {desk && data.payments && (
              <Stat
                title="Collected"
                value={peso(paidTotal - refunded)}
                icon={HandCoins}
                detail={
                  refunded
                    ? `${peso(paidTotal)} paid · ${peso(refunded)} refunded`
                    : "Paid in this period"
                }
              />
            )}
            {!desk &&
              shownLines.map(([title, value, icon]) => (
                <Stat
                  key={title}
                  title={title}
                  value={peso(value)}
                  icon={icon}
                />
              ))}
          </div>
          {desk && (
            <dl className="reports-breakdown">
              <dt className="reports-breakdown-title">From these orders</dt>
              {moneyLines.map(([title, value]) => (
                <div key={title}>
                  <dt>{title}</dt>
                  <dd>{peso(value)}</dd>
                </div>
              ))}
            </dl>
          )}
          {phone && (hiddenLines > 0 || allSales) && (
            <div className="reports-more">
              <button type="button" onClick={() => setAllSales((v) => !v)}>
                {allSales
                  ? "Hide ₱0.00 lines"
                  : `Show all (${hiddenLines} at ₱0.00)`}
              </button>
            </div>
          )}
          {desk ? (
            <div className="reports-trend-pair">
              <SalesTrend
                rows={chartRows}
                bucket={chartBucket}
                action={tableToggle}
              />
              <SalesTrend
                rows={chartRows}
                bucket={chartBucket}
                measure="orders"
              />
            </div>
          ) : (
            <SalesTrend
              rows={chartRows}
              bucket={chartBucket}
              span={trendLonger ? "Last 7 days" : null}
            />
          )}
          {!desk && <div className="reports-more">{tableToggle}</div>}
          <div className="ops-report-grid">
            {dayTable && (
              <ReportTable
                title={
                  hourRows
                    ? "Sales by hour"
                    : weekly
                      ? "Sales by week"
                      : "Sales by day"
                }
                icon={BarChart3}
                columns={[
                  hourRows ? "Hour" : weekly ? "Week of" : "Date",
                  "Orders",
                  "Order gross",
                ]}
                rows={chartRows.map((r) => [
                  hourRows ? hourName(r.hour) : r.date,
                  r.orders,
                  peso(r.gross),
                ])}
              />
            )}
            <ReportTable
              title="Orders by type"
              icon={ShoppingBag}
              chart={(() => {
                const parts = shareParts(
                  (data.orders_by_type || []).map((r) => ({
                    key: r.order_type,
                    label: capitalised(label(r.order_type)),
                    value: Number(r.total) || 0,
                  })),
                  ["dine_in", "pickup", "delivery"],
                );
                return desk ? (
                  <Donut
                    label="Share of order total by type"
                    parts={parts}
                    total={compactPeso(
                      parts.reduce((sum, part) => sum + part.value, 0),
                    )}
                    totalLabel="order total"
                  />
                ) : (
                  <ShareBar
                    label="Share of order total by type"
                    parts={parts}
                  />
                );
              })()}
              columns={["Type", "Orders", "Order total"]}
              rows={(data.orders_by_type || []).map((r) => [
                label(r.order_type),
                r.orders,
                peso(r.total),
              ])}
            />
            <ReportTable
              title="Orders by status"
              bars={desk}
              icon={ListChecks}
              columns={["Status", "Orders"]}
              rows={statusRecords.map((r) => [label(r.status), r.total])}
              tones={statusRecords.map(
                (r) => ORDER_TONES[r.status] || "neutral",
              )}
            />
            <ReportTable
              title="Popular dishes"
              bars={desk}
              thumbs={
                desk
                  ? (allDishes ? dishes : dishes.slice(0, 5)).map(
                      (r) => r.image_url || null,
                    )
                  : null
              }
              icon={ChefHat}
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
          <h2>{desk ? "Reservations" : "Reservations and service"}</h2>
          <div className="ops-stats">
            <Stat
              title="Bookings"
              value={data.reservations.total}
              icon={CalendarDays}
            />
            <Stat
              title="Cancelled"
              value={data.reservations.cancelled}
              icon={CalendarX2}
              className="ops-stat--danger"
            />
            <Stat
              title="No shows"
              value={data.reservations.no_show}
              icon={UserX}
              className="ops-stat--pending"
            />
            <Stat
              title="Completed"
              value={data.reservations.completed}
              icon={CalendarCheck}
              className="ops-stat--success"
            />
            {!desk && deliveryTime}
          </div>
          {desk && Number(data.reservations.total) > 0 && (
            <section className="ops-report-card reports-outcomes">
              <CardHeading
                icon={CalendarDays}
                title="Booking outcomes"
                description="How this period's bookings turned out so far."
              />
              {(() => {
                const r = data.reservations;
                const total = Number(r.total) || 0;
                const closed =
                  (Number(r.completed) || 0) +
                  (Number(r.cancelled) || 0) +
                  (Number(r.no_show) || 0);
                const rows = [
                  ["completed", "Completed", r.completed, "success"],
                  [
                    "open",
                    "Upcoming or open",
                    Math.max(0, total - closed),
                    "progress",
                  ],
                  ["no_show", "No shows", r.no_show, "pending"],
                  ["cancelled", "Cancelled", r.cancelled, "danger"],
                ].map(([key, text, value, tone]) => ({
                  key,
                  label: text,
                  value: Number(value) || 0,
                  tone,
                  share: total ? (Number(value) || 0) / total : 0,
                }));
                return (
                  <Donut
                    label="Bookings by outcome"
                    parts={rows}
                    total={total}
                    totalLabel={total === 1 ? "booking" : "bookings"}
                  />
                );
              })()}
            </section>
          )}
          <QuietTables
            quiet={quiet}
            tables={[
              // The desk leaves live occupancy to the Dashboard.
              !desk && [
                "Table occupancy now",
                LayoutGrid,
                ["Status", "Tables"],
                (data.table_occupancy?.current || []).map((r) => [
                  label(r.operational_status),
                  r.total,
                ]),
              ],
              [
                "Occupancy changes in period",
                ArrowLeftRight,
                ["New status", "Changes"],
                (data.table_occupancy?.changes || []).map((r) => [
                  label(r.to_status),
                  r.total,
                ]),
                null,
                { bars: desk },
              ],
              !desk && deliveryOutcomes,
              !desk && deliveryRiders,
            ].filter(Boolean)}
          />
          {desk && (
            <>
              <h2>Delivery</h2>
              <div className="ops-stats ops-stats--pair">
                {deliveryTime}
                <Stat
                  title="Delivered"
                  value={data.delivery_performance?.completed || 0}
                  icon={Truck}
                  className="ops-stat--success"
                  detail={`${(data.delivery_performance?.by_rider || []).length} ${(data.delivery_performance?.by_rider || []).length === 1 ? "rider" : "riders"} in this period`}
                />
              </div>
              <QuietTables
                quiet={quiet}
                tables={[deliveryOutcomes, deliveryRiders]}
              />
            </>
          )}
        </>
      )}
      {data?.payments && show("payments") && (
        <>
          <h2>{desk ? "Payments" : "Payments and refunds"}</h2>
          {!desk && (
            <div className="ops-stats">
              <Stat
                title="Refunded total"
                value={peso(data.payments.refunds)}
                className="ops-stat--hero"
                icon={Undo2}
              />
            </div>
          )}
          <QuietTables
            quiet={quiet}
            tables={[
              [
                "Payments by state",
                ReceiptText,
                ["Status", "Count", "Amount"],
                paymentRecords.map((r) => [
                  label(r.status),
                  r.count,
                  peso(r.amount),
                ]),
                null,
                {
                  bars: desk,
                  unit: "payments",
                  shares: paymentRecords.map((r) => r.amount),
                  tones: paymentRecords.map(
                    (r) => PAYMENT_TONES[r.status] || "neutral",
                  ),
                },
              ],
              [
                "Payments by method",
                CreditCard,
                ["Method", "Count", "Amount"],
                (data.payments.by_method || []).map((r) => [
                  label(r.method),
                  r.count,
                  peso(r.amount),
                ]),
                (() => {
                  const parts = shareParts(
                    (data.payments.by_method || []).map((r) => ({
                      key: r.method,
                      label: capitalised(label(r.method)),
                      value: Number(r.amount) || 0,
                    })),
                    ["cash", "card", "online", "gcash"],
                  );
                  return desk ? (
                    <Donut
                      key="chart"
                      label="Share of paid amount by method"
                      parts={parts}
                      total={compactPeso(
                        parts.reduce((sum, part) => sum + part.value, 0),
                      )}
                      totalLabel="paid"
                    />
                  ) : (
                    <ShareBar
                      key="chart"
                      label="Share of paid amount by method"
                      parts={parts}
                    />
                  );
                })(),
              ],
            ]}
          />
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

/** Rows of a CSV file (quoted fields, commas and line breaks inside). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/**
 * Export preview: the dataset's first rows and how many there are, with
 * Download CSV to save the whole file.
 */
const EXPORT_PREVIEW_PER_PAGE = 10;
const exportDay = (value) =>
  new Date(`${value}T12:00:00`).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
const isMoneyColumn = (heading) => /php|amount/i.test(heading);

/** A file value as the Excel sheet shows it: pesos, dates, plain words. */
function exportCell(heading, value) {
  if (value === "" || value === null || value === undefined) return "—";
  if (isMoneyColumn(heading) && Number.isFinite(Number(value)))
    return peso(value);
  if (/(^|\s)at$/i.test(heading)) {
    const at = new Date(value);
    if (Number.isFinite(at.getTime()))
      return at.toLocaleString([], {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
  }
  if (/type|status|method|purpose/i.test(heading)) {
    const words = String(value).replaceAll("_", " ");
    return words.charAt(0).toUpperCase() + words.slice(1);
  }
  return value;
}

function ExportPreview({ preview, name, range, href, onClose }) {
  const [page, setPage] = useState(1);
  const dataset = preview?.dataset;
  // Each export opens on its first page.
  useEffect(() => setPage(1), [dataset]);
  const pages = Math.max(
    1,
    Math.ceil((preview?.total || 0) / EXPORT_PREVIEW_PER_PAGE),
  );
  const at = Math.min(page, pages);
  const firstRow = (at - 1) * EXPORT_PREVIEW_PER_PAGE;
  const shownRows = (preview?.rows || []).slice(
    firstRow,
    firstRow + EXPORT_PREVIEW_PER_PAGE,
  );
  const dialog = useRef(null);
  useEffect(() => {
    if (preview && dialog.current && !dialog.current.open)
      dialog.current.showModal();
    if (!preview && dialog.current?.open) dialog.current.close();
  }, [preview]);
  return (
    <dialog
      ref={dialog}
      className="export-preview"
      aria-labelledby="export-preview-title"
      onClose={onClose}
    >
      {preview && (
        <>
          <header>
            <span className="export-preview-mark" aria-hidden="true">
              <UtensilsCrossed size={22} />
            </span>
            <div>
              <span className="eyebrow">EXPORT PREVIEW</span>
              <h2 id="export-preview-title">{name}</h2>
              <p>
                {range.from === range.to
                  ? exportDay(range.from)
                  : `${exportDay(range.from)} to ${exportDay(range.to)}`}
                {!preview.loading &&
                  !preview.error &&
                  ` · ${preview.total} ${preview.total === 1 ? "row" : "rows"}`}
              </p>
            </div>
            <button
              type="button"
              className="export-preview-close"
              aria-label="Close"
              onClick={onClose}
            >
              <X size={20} aria-hidden="true" />
            </button>
          </header>
          <div className="export-preview-body">
            {preview.loading ? (
              <Skeleton label="Loading the export" />
            ) : preview.error ? (
              <Feedback>{preview.error}</Feedback>
            ) : preview.total === 0 ? (
              <p className="export-preview-empty">
                Nothing in this range - the file would only have its headings.
              </p>
            ) : (
              <>
                <div className="export-preview-table">
                  <table>
                    <thead>
                      <tr>
                        {preview.header.map((cell, index) => (
                          <th
                            key={index}
                            scope="col"
                            data-money={isMoneyColumn(cell) || undefined}
                          >
                            {cell}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {shownRows.map((row, index) => (
                        <tr key={firstRow + index}>
                          {preview.header.map((heading, column) => (
                            <td
                              key={column}
                              data-money={isMoneyColumn(heading) || undefined}
                            >
                              {exportCell(heading, row[column])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <nav
                  className="export-preview-pages"
                  aria-label="Preview pages"
                >
                  <span>
                    Showing {firstRow + 1}–{firstRow + shownRows.length} of{" "}
                    {preview.total} · Page {at} of {pages}
                  </span>
                  <span>
                    <button
                      type="button"
                      className="sage-button sage-button--secondary"
                      disabled={at <= 1}
                      onClick={() => setPage(at - 1)}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      className="sage-button sage-button--secondary"
                      disabled={at >= pages}
                      onClick={() => setPage(at + 1)}
                    >
                      Next
                    </button>
                  </span>
                </nav>
              </>
            )}
          </div>
          <footer>
            <button
              type="button"
              className="sage-button sage-button--secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <span className="export-preview-actions">
              {/* A styled Excel sheet: title, totals, pesos and real dates. */}
              <a
                className="sage-button export-preview-download"
                href={href && `${href}&format=xlsx`}
                onClick={() => setTimeout(onClose, 300)}
              >
                <Download size={16} aria-hidden="true" />
                Download Excel
              </a>
            </span>
          </footer>
        </>
      )}
    </dialog>
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
/** Business hours (10 AM to 9 PM, wider if orders fall outside), filled. */
function fillHours(rows) {
  const byHour = new Map(rows.map((row) => [Number(row.hour), row]));
  const hours = rows.map((row) => Number(row.hour));
  const first = Math.min(10, ...hours);
  const last = Math.max(21, ...hours);
  return Array.from({ length: last - first + 1 }, (_, index) => {
    const hour = first + index;
    return byHour.get(hour) || { hour, orders: 0, gross: 0 };
  });
}

// 13 -> "1:00 PM".
const hourName = (hour) =>
  `${((hour + 11) % 12) + 1}:00 ${hour < 12 ? "AM" : "PM"}`;

/** "No orders today", "No orders on Nov 5", "No orders in this period". */
function noOrdersTitle(range) {
  if (range.from !== range.to) return "No orders in this period";
  if (range.to === today()) return "No orders today";
  return `No orders on ${new Date(`${range.to}T12:00:00`).toLocaleDateString([], { month: "long", day: "numeric" })}`;
}

/**
 * Report tables in a grid. With a `quiet` splitter (admin desktop), tables
 * with no rows leave the grid and are named in one line under it.
 */
function QuietTables({ quiet, tables }) {
  const [shown, empty] = quiet(
    tables.map(([title, icon, columns, rows, chart = null, options = {}]) => [
      title,
      rows,
      <ReportTable
        key={title}
        title={title}
        icon={icon}
        columns={columns}
        rows={rows}
        chart={chart}
        {...options}
      />,
    ]),
  );
  return (
    <>
      <div className="ops-report-grid">{shown}</div>
      {empty.length > 0 && (
        <p className="reports-nothing">
          Nothing in this period: {empty.join(" · ")}
        </p>
      )}
    </>
  );
}

/** Days rolled up into Monday-start weeks, keyed by the Monday. */
function weekRows(days) {
  const weeks = new Map();
  for (const day of days) {
    const monday = new Date(`${day.date}T12:00:00`);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const key = localDay(monday);
    const week = weeks.get(key) || { date: key, orders: 0, gross: 0 };
    week.orders += Number(day.orders) || 0;
    week.gross += Number(day.gross) || 0;
    weeks.set(key, week);
  }
  return [...weeks.values()];
}

// Statuses coloured by what they mean in a report: done, in progress,
// waiting, a problem, or closed.
const ORDER_TONES = {
  pending: "pending",
  confirmed: "pending",
  preparing: "progress",
  ready_to_serve: "progress",
  served: "success",
  completed: "success",
  cancelled: "danger",
};
const DELIVERY_TONES = {
  pending_assignment: "pending",
  assigned: "pending",
  accepted: "progress",
  arrived_at_restaurant: "progress",
  picked_up: "progress",
  in_transit: "progress",
  delivered: "success",
  failed: "danger",
  cancelled: "danger",
};
const PAYMENT_TONES = {
  pending: "pending",
  refund_pending: "pending",
  paid: "success",
  failed: "danger",
  refunded: "neutral",
  expired: "neutral",
  cancelled: "neutral",
};

function fillDays(rows, range, max = 93) {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const iso = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const today = iso(new Date());
  const end = range.to < today ? range.to : today;
  const days = [];
  const cursor = new Date(`${range.from}T12:00:00`);
  while (iso(cursor) <= end && days.length < max) {
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
  icon,
  columns,
  rows,
  unit,
  chart = null,
  footer = null,
  bars = false,
  tones = null,
  shares = null,
  limit = 0,
  // Optional picture per row (bar view): an image URL, or null for an icon.
  thumbs = null,
}) {
  const phone = useMediaQuery("(max-width: 850px)");
  const desk = useAdminDesktop();
  const [more, setMore] = useState(false);
  // Phones always, and the desk for long lists: a bar per row, longest first.
  if (phone || (desk && bars)) {
    // The desk can size bars by another figure (an amount) and colour them
    // by status; a long list shows its top rows first.
    const counts = (desk && shares ? shares : rows.map((row) => row[1])).map(
      (value) => Number(value) || 0,
    );
    const most = Math.max(1, ...counts);
    const capped = desk && limit > 0 && !more;
    const listed = capped ? rows.slice(0, limit) : rows;
    const noun = unit || String(columns[1] || "").toLowerCase();
    return (
      <div className="ops-panel ops-panel--bars">
        {desk ? (
          <CardHeading as="h3" icon={icon} title={title} />
        ) : (
          <h3>{title}</h3>
        )}
        {chart}
        {rows.length ? (
          <ol className="ops-bars">
            {listed.map((row, i) => (
              <li key={i} data-tone={(desk && tones?.[i]) || undefined}>
                <div>
                  {thumbs && (
                    <span className="ops-bar-thumb" aria-hidden="true">
                      {thumbs[i] ? (
                        <img
                          src={thumbs[i]}
                          alt=""
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <UtensilsCrossed size={16} />
                      )}
                    </span>
                  )}
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
        {desk && limit > 0 && rows.length > limit && (
          <div className="reports-more">
            <button type="button" onClick={() => setMore((v) => !v)}>
              {more ? `Show top ${limit}` : `Show ${rows.length - limit} more`}
            </button>
          </div>
        )}
        {footer}
      </div>
    );
  }
  return (
    <div className="ops-panel">
      {desk ? (
        <CardHeading as="h3" icon={icon} title={title} />
      ) : (
        <h3>{title}</h3>
      )}
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
      {!data && !error && (
        <Skeleton
          label="Loading daily transactions"
          layout={{ stats: 3, body: "list", rows: 8 }}
        />
      )}
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

// Desktop calendar sort orders. Days follow the time order; the others
// sort the bookings inside each day.
const CALENDAR_SORT_KEY = "dineflow.reservationCalendarSort";
const CALENDAR_VIEW_KEY = "dineflow.reservationCalendarView";
// List view: every booking from three months back to a year ahead.
const LIST_PAST_DAYS = 90;
const LIST_AHEAD_DAYS = 365;
// Days follow the time direction; inside each day, bookings follow the sort.
const CALENDAR_SORTS = [
  ["time", "Earliest first"],
  ["time-desc", "Latest first"],
  ["attention", "Needs attention first"],
  ["status", "Status"],
  ["guests", "Largest party first"],
  ["name", "Guest name A–Z"],
];

export function ReservationCalendar({ user }) {
  const [loading, setLoading] = useState(true);
  const ask = usePrompt();
  // Phones get one day of cards, ten at a time; desktop keeps the week list.
  const phone = useMediaQuery("(max-width: 850px)");
  // Admin desktop: day headings carry a date badge, and the row pills alone
  // say each booking's status.
  const desk = useAdminDesktop();
  const [page, setPage] = useState(1);
  const [mode, setMode] = useState(() => {
      if (typeof window === "undefined") return "week";
      if (window.matchMedia?.("(max-width: 850px)").matches) return "day";
      if (new URLSearchParams(window.location.search).get("view") === "list")
        return "list";
      try {
        const saved = localStorage.getItem(CALENDAR_VIEW_KEY);
        if (["day", "week", "month", "list"].includes(saved)) return saved;
      } catch {
        // No storage: the week view.
      }
      return "week";
    }),
    [query, setQuery] = useState(""),
    // All bookings: the day last picked in "Jump to date", outlined.
    [picked, setPicked] = useState(null),
    [anchor, setAnchor] = useState(today()),
    [items, setItems] = useState([]),
    [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [history, setHistory] = useState({});
  // Admin desktop: the status chips scroll sideways; a mouse can drag them.
  const chipsRef = useDragScroll();
  const [sort, setSort] = useState(() => {
    try {
      return localStorage.getItem(CALENDAR_SORT_KEY) || "time";
    } catch {
      return "time";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(CALENDAR_VIEW_KEY, mode);
    } catch {
      // The view still applies for this visit.
    }
  }, [mode]);
  useEffect(() => {
    try {
      localStorage.setItem(CALENDAR_SORT_KEY, sort);
    } catch {
      // Private windows may block storage; the sort still works this visit.
    }
  }, [sort]);
  const bounds = () => {
    if (mode === "list") {
      const from = new Date();
      from.setDate(from.getDate() - LIST_PAST_DAYS);
      const to = new Date();
      to.setDate(to.getDate() + LIST_AHEAD_DAYS);
      return { from: localDay(from), to: localDay(to) };
    }
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
  // Desktop loads every booking in the period so the status chips can show
  // their counts; phones filter on the server as before.
  const serverStatus = phone ? status : "";
  async function load() {
    setError("");
    try {
      const result = await api(
        `/reservations?from=${range.from}&to=${range.to}&per_page=100${serverStatus ? `&status=${serverStatus}` : ""}`,
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
  }, [range.from, range.to, serverStatus]);
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
  function toggleHistory(item) {
    if (!history[item.id]) return showHistory(item);
    setHistory((current) => {
      const rest = { ...current };
      delete rest[item.id];
      return rest;
    });
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
  // Desktop: chips filter the loaded period; counts come from the same list.
  const list = mode === "list";
  const term = query.trim().toLowerCase();
  const shown = items.filter(
    (item) =>
      (!status || item.status === status) &&
      (!term ||
        [
          item.guest_name,
          item.guest_phone,
          item.reference,
          bookingTableText(item),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(term)),
  );
  const grouped = shown.reduce((all, item) => {
    const key = localDay(new Date(item.starts_at));
    (all[key] ??= []).push(item);
    return all;
  }, {});
  const at = (day) => new Date(`${day}T12:00:00`);
  // "Nov 2 – 8, 2026", "Oct 26 – Nov 1, 2026", "Dec 28, 2026 – Jan 3, 2027".
  const weekTitle = () => {
    const start = at(range.from);
    const end = at(range.to);
    const month = (date) => date.toLocaleDateString([], { month: "short" });
    if (start.getFullYear() !== end.getFullYear())
      return `${month(start)} ${start.getDate()}, ${start.getFullYear()} – ${month(end)} ${end.getDate()}, ${end.getFullYear()}`;
    if (start.getMonth() !== end.getMonth())
      return `${month(start)} ${start.getDate()} – ${month(end)} ${end.getDate()}, ${end.getFullYear()}`;
    return `${month(start)} ${start.getDate()} – ${end.getDate()}, ${end.getFullYear()}`;
  };
  const periodTitle =
    mode === "day"
      ? at(range.from).toLocaleDateString([], {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : mode === "month"
        ? at(range.from).toLocaleDateString([], {
            month: "long",
            year: "numeric",
          })
        : list
          ? "All bookings"
          : weekTitle();
  const todayKey = today();
  const dayFromToday = (offset) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return localDay(date);
  };
  const tomorrowKey = dayFromToday(1);
  const yesterdayKey = dayFromToday(-1);
  // Today's open bookings: "In 45 min", "In 2 h 10 min", or "20 min late".
  const startsIn = (item) => {
    if (!["pending", "confirmed"].includes(item.status)) return null;
    if (localDay(new Date(item.starts_at)) !== todayKey) return null;
    const minutes = Math.round(
      (new Date(item.starts_at).getTime() - Date.now()) / 60000,
    );
    const span = (value) =>
      value >= 60
        ? `${Math.floor(value / 60)} h${value % 60 ? ` ${value % 60} min` : ""}`
        : `${value} min`;
    if (minutes >= 1) return { text: `In ${span(minutes)}`, late: false };
    if (minutes > -1) return { text: "Now", late: false };
    return { text: `${span(-minutes)} late`, late: true };
  };
  // All bookings: scroll to the picked day, or the nearest day with bookings.
  const jumpTo = (value) => {
    setPicked(value);
    requestAnimationFrame(() => {
      const sections = [
        ...document.querySelectorAll(".reservation-calendar [data-day]"),
      ];
      if (!sections.length) return;
      const target =
        sections.find((section) => section.dataset.day === value) ||
        sections.reduce((best, section) =>
          Math.abs(at(section.dataset.day) - at(value)) <
          Math.abs(at(best.dataset.day) - at(value))
            ? section
            : best,
        );
      target.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  };
  const statusCount = (value) =>
    items.filter((item) => item.status === value).length;
  const order = desk ? sort : "time";
  const byTime = (a, b) => new Date(a.starts_at) - new Date(b.starts_at);
  // Needs attention: past bookings left open, late arrivals, then pending
  // requests, guests in the room, other open bookings, finished ones last.
  const attention = (item) => {
    const open = ["pending", "confirmed"].includes(item.status);
    if (open && localDay(new Date(item.starts_at)) < todayKey) return 0;
    if (startsIn(item)?.late) return 1;
    if (item.status === "pending") return 2;
    if (["checked_in", "seated"].includes(item.status)) return 3;
    return open ? 4 : 5;
  };
  const compareBookings =
    {
      "time-desc": (a, b) => byTime(b, a),
      attention: (a, b) => attention(a) - attention(b) || byTime(a, b),
      status: (a, b) =>
        statuses.indexOf(a.status) - statuses.indexOf(b.status) || byTime(a, b),
      guests: (a, b) =>
        (Number(b.guest_count) || 0) - (Number(a.guest_count) || 0) ||
        byTime(a, b),
      name: (a, b) =>
        String(a.guest_name || "").localeCompare(String(b.guest_name || "")) ||
        byTime(a, b),
    }[order] || byTime;
  const statusChips = (
    <div
      ref={chipsRef}
      className="sage-filter-chips cal-status-chips"
      role="group"
      aria-label="Reservation status"
    >
      {[["", "All"], ...statuses.map((value) => [value])].map(
        ([value, text]) => (
          <button
            key={value || "all"}
            type="button"
            aria-pressed={status === value}
            data-empty={
              (value ? statusCount(value) : items.length) === 0 || undefined
            }
            onClick={() => setStatus(value)}
          >
            {text || BOOKING_STATUS_TEXT[value] || label(value)}
            <span className="admin-count">
              {value ? statusCount(value) : items.length}
            </span>
          </button>
        ),
      )}
    </div>
  );
  const time = (value) =>
    new Date(value).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  return (
    <section className="welcome reservation-calendar">
      <span className="eyebrow">SERVICE DESK</span>
      <h1>Reservations calendar</h1>
      <p>Review upcoming bookings and coordinate each service day.</p>
      {error && <Feedback onRetry={load}>{error}</Feedback>}
      <div className="cal-toolbar">
        <div className="cal-toolbar-row">
          <div className="cal-period">
            <h2>{periodTitle}</h2>
            <p>
              {loading
                ? "Loading bookings…"
                : list
                  ? `Every booking, past and upcoming · ${shown.length} of ${items.length} shown`
                  : `${shown.length} ${shown.length === 1 ? "booking" : "bookings"}${status ? ` · ${BOOKING_STATUS_TEXT[status] || label(status)}` : ""}`}
            </p>
            {!loading && (
              <small className="cal-list-span">
                {at(range.from).toLocaleDateString([], {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}{" "}
                –{" "}
                {at(range.to).toLocaleDateString([], {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </small>
            )}
          </div>
          <div className="cal-controls">
            {/* Same controls in every view; All bookings has no period to
                step through, so the arrows rest and Today jumps to today. */}
            <div
              className="cal-nav"
              role="group"
              aria-label="Move through the calendar"
            >
              <button
                type="button"
                onClick={() => move(-1)}
                disabled={list}
                aria-label="Previous period"
                title="Previous"
              >
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setAnchor(today());
                  if (list) jumpTo(today());
                }}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => move(1)}
                disabled={list}
                aria-label="Next period"
                title="Next"
              >
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="cal-views" role="group" aria-label="Calendar view">
              {[
                ["day", "Day"],
                ["week", "Week"],
                ["month", "Month"],
                ...(desk ? [["list", "All bookings"]] : []),
              ].map(([value, text]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={mode === value}
                  onClick={() => setMode(value)}
                >
                  {text}
                </button>
              ))}
            </div>
            {/* All bookings: the calendar jumps to that day in the list. */}
            <DatePicker
              label={list ? "Jump to date" : "Calendar date"}
              value={anchor}
              onChange={(value) => {
                if (!value) return;
                setAnchor(value);
                if (list) jumpTo(value);
              }}
            />
          </div>
        </div>
        {desk ? (
          <div className="cal-filter-row" data-list>
            <label className="cal-search">
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Guest, phone, reference or table"
                aria-label="Search bookings"
              />
            </label>
            {statusChips}
            <label className="cal-sort">
              <ArrowUpDown size={15} aria-hidden="true" />
              <span>Sort</span>
              <select
                aria-label="Sort bookings"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                {CALENDAR_SORTS.map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          statusChips
        )}
      </div>
      {loading && (
        <Skeleton
          label="Loading your content"
          layout={{ body: "list", rows: 6 }}
        />
      )}
      {!loading && !error && shown.length === 0 && (
        <EmptyState
          title="No reservations in this period"
          description="Choose another date or status to find your bookings."
        />
      )}
      {Object.entries(grouped)
        .sort(([a], [b]) =>
          list
            ? // Upcoming band first. Earliest first: soonest upcoming day
              // and most recent past day lead; Latest first turns both.
              (a < todayKey) - (b < todayKey) ||
              (order === "time-desc" ? -1 : 1) *
                (a < todayKey ? b.localeCompare(a) : a.localeCompare(b))
            : order === "time-desc"
              ? b.localeCompare(a)
              : a.localeCompare(b),
        )
        .map(([day, bookings], index, days) => {
          const band =
            list &&
            (index === 0 || days[index - 1][0] < todayKey !== day < todayKey)
              ? day < todayKey
                ? "Past"
                : "Upcoming"
              : null;
          const bandCount = !band
            ? 0
            : days
                .filter(([key]) => key < todayKey === day < todayKey)
                .reduce((sum, [, group]) => sum + group.length, 0);
          const when =
            day === todayKey ? "today" : day < todayKey ? "past" : "upcoming";
          const near =
            day === todayKey
              ? "Today"
              : day === tomorrowKey
                ? "Tomorrow"
                : day === yesterdayKey
                  ? "Yesterday"
                  : when === "past"
                    ? "Past"
                    : null;
          const guests = bookings.reduce(
            (sum, item) => sum + (Number(item.guest_count) || 0),
            0,
          );
          const tally = statuses
            .map((value) => [
              value,
              bookings.filter((item) => item.status === value).length,
            ])
            .filter(([, total]) => total > 0);
          return (
            <Fragment key={day}>
              {band && (
                <h2
                  className="my-reservation-group"
                  data-group={band.toLowerCase()}
                >
                  {band}
                  <span>{bandCount}</span>
                </h2>
              )}
              <section
                className="calendar-day"
                data-when={when}
                data-day={day}
                data-picked={(list && day === picked) || undefined}
              >
                {desk ? (
                  <BookingDayHeading
                    date={at(day)}
                    when={when}
                    near={near}
                    count={bookings.length}
                    guests={guests}
                  />
                ) : (
                  <h2>
                    <span className="cal-day-title">
                      {at(day).toLocaleDateString([], {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                      })}
                      {near && (
                        <em className="cal-today" data-when={when}>
                          {near}
                        </em>
                      )}
                    </span>
                    <span className="cal-day-summary">
                      {!desk && (
                        <span className="cal-day-tally">
                          {tally.map(([value, total]) => (
                            <span
                              key={value}
                              data-tone={reservationStatusTone(value)}
                            >
                              <i aria-hidden="true" />
                              {total}{" "}
                              {(
                                BOOKING_STATUS_TEXT[value] || label(value)
                              ).toLowerCase()}
                            </span>
                          ))}
                        </span>
                      )}
                      <small>
                        {bookings.length}{" "}
                        {bookings.length === 1 ? "booking" : "bookings"} ·{" "}
                        {guests} {guests === 1 ? "guest" : "guests"}
                      </small>
                    </span>
                  </h2>
                )}
                <div className="reservation-calendar-list">
                  {[...bookings].sort(compareBookings).map((item) => {
                    const steps = next[item.status] || [];
                    const forward = steps.filter(
                      (value) => !["cancelled", "no_show"].includes(value),
                    );
                    // The next step shows as a button only when it is useful:
                    // confirm a booking still ahead; check in, seat and
                    // complete on the day. Otherwise it waits in the menu.
                    // The row's one button is for live service: on the admin
                    // desktop only today's Check in and Seat; Confirm leads the
                    // menu instead.
                    const shownStep = forward.find((value) =>
                      desk
                        ? value !== "confirmed" && day === todayKey
                        : value === "confirmed"
                          ? day >= todayKey
                          : day === todayKey,
                    );
                    // Admin desktop: a booking from an earlier day that is still
                    // pending or confirmed needs closing. The row says so; the
                    // way to close it (no show, or cancel for a booking never
                    // confirmed) is in the menu, so live service steps keep the
                    // row's one button.
                    const stale =
                      desk &&
                      day < todayKey &&
                      ["pending", "confirmed"].includes(item.status);
                    const closeStep = !stale
                      ? null
                      : steps.includes("no_show")
                        ? "no_show"
                        : steps.includes("cancelled")
                          ? "cancelled"
                          : null;
                    const [clock, meridiem] = time(item.starts_at).split(" ");
                    const options = [
                      ...forward
                        .filter((value) => value !== shownStep)
                        .map((value) => ({
                          key: value,
                          label: BOOKING_ACTION_TEXT[value] || label(value),
                          icon: STEP_ICONS[value] || CircleCheck,
                          onSelect: () => transition(item, value),
                        })),
                      steps.includes("no_show") && {
                        key: "no_show",
                        label: "Mark no show",
                        icon: UserX,
                        onSelect: () => transition(item, "no_show"),
                      },
                      ["confirmed", "pending"].includes(item.status) && {
                        key: "reassign",
                        label: "Reassign table",
                        icon: Repeat2,
                        onSelect: () => reassign(item),
                      },
                      {
                        key: "history",
                        label: history[item.id]
                          ? "Hide history"
                          : "Show history",
                        icon: History,
                        onSelect: () => toggleHistory(item),
                      },
                      steps.includes("cancelled") && {
                        key: "cancel",
                        label: "Cancel booking",
                        icon: CircleX,
                        tone: "danger",
                        onSelect: () => transition(item, "cancelled"),
                      },
                    ]
                      .filter(Boolean)
                      // A past confirmed booking: "Mark no show" leads the menu.
                      .sort(
                        (a, b) =>
                          (closeStep === "no_show" && b.key === "no_show") -
                          (closeStep === "no_show" && a.key === "no_show"),
                      );
                    const StepIcon = shownStep
                      ? STEP_ICONS[shownStep] || CircleCheck
                      : null;
                    return (
                      <BookingRow
                        key={item.id}
                        item={item}
                        tags={[
                          closeStep && { text: "Needs closing", late: true },
                          startsIn(item),
                        ]}
                        step={
                          shownStep && (
                            <button
                              type="button"
                              className="ui-button ui-button--secondary cal-step"
                              onClick={() => transition(item, shownStep)}
                            >
                              <StepIcon size={16} aria-hidden="true" />
                              {BOOKING_ACTION_TEXT[shownStep] ||
                                label(shownStep)}
                            </button>
                          )
                        }
                        menu={options}
                        extra={
                          history[item.id] && (
                            <div className="calendar-history">
                              {history[item.id].map((h) => (
                                <small key={h.id}>
                                  {label(h.from_status || "created")} →{" "}
                                  {label(h.to_status)} ·{" "}
                                  {dateValue(h.created_at)}
                                  {h.note ? ` · ${h.note}` : ""}
                                </small>
                              ))}
                            </div>
                          )
                        }
                      />
                    );
                  })}
                </div>
              </section>
            </Fragment>
          );
        })}
    </section>
  );
}

export { BusinessSettings } from "./features/BusinessSettings";
