import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Bike,
  Check,
  Clock3,
  MapPin,
  Radio,
  RefreshCw,
  Search,
  Settings2,
  ShoppingBag,
  Store,
  TriangleAlert,
  Truck,
  UsersRound,
} from "lucide-react";
import { api } from "../api";
import { OutletAddressSearch } from "../components/OutletAddressSearch";
import { usePollingResource } from "../components/usePollingResource";
import { useMediaQuery } from "../components/useMediaQuery";
import {
  useLiveMapSnapshot,
  mergeFleetLocations,
} from "../components/useLiveMapSnapshot";
import { useSaveDock } from "../components/useSaveDock";
import { Button, EmptyState, Feedback, Skeleton } from "../components/ui";
import {
  hasOutletCoordinates,
  isOutletConfigured,
} from "./outletConfiguration";
import {
  OperatingHoursEditor,
  outletDays as days,
} from "./OperatingHoursEditor";
const DeliveryMap = lazy(() => import("../components/AdminDeliveryMap"));
const statusLabel = (value) => String(value || "pending").replaceAll("_", " ");
const currency = (value) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
const time = (value) =>
  value
    ? new Date(value).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

function useOverview() {
  const resource = usePollingResource(
    ({ signal }) =>
      api("/admin/operations-overview", { signal }).then(
        (result) => result.data,
      ),
    {
      resourceKey: "admin-overview",
      topics: ["orders", "deliveries", "locations", "settings", "accounts"],
    },
  );
  return resource;
}
export function AdminBadge({ status, children }) {
  return (
    <span className={`admin-badge admin-badge--${status || "neutral"}`}>
      <i aria-hidden="true" />
      {children || statusLabel(status)}
    </span>
  );
}
function AdminHeading({
  eyebrow = "YOUR RESTAURANT, AT A GLANCE",
  title,
  description,
  children,
}) {
  return (
    <header className="admin-page-heading">
      <div>
        <span className="admin-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="admin-heading-actions">{children}</div>
    </header>
  );
}
function RefreshButton({ resource }) {
  return (
    <Button
      variant="secondary"
      className="admin-button admin-button--secondary"
      busy={resource.refreshing}
      onClick={resource.refresh}
    >
      <RefreshCw size={16} aria-hidden="true" />
      <span className="admin-refresh-label">Refresh</span>
    </Button>
  );
}
function Freshness({ resource }) {
  return (
    <span
      className={`admin-freshness${resource.error ? " admin-freshness--stale" : ""}`}
    >
      <Radio size={13} aria-hidden="true" />
      {resource.error
        ? "Updates interrupted · showing last loaded data"
        : resource.updatedAt
          ? `Updated ${time(resource.updatedAt)}`
          : "Connecting to operations…"}
    </span>
  );
}
function Metrics({ data, loading, user }) {
  const values = data?.metrics;
  const has = (permission) => user?.permissions?.includes(permission);
  const cards = [
    [
      "Active orders",
      values?.active_orders,
      ShoppingBag,
      "Orders currently in progress",
      "green",
      has("orders.manage") ? "/admin/orders" : null,
    ],
    [
      "Available riders",
      values?.available_riders,
      Bike,
      "Online with a fresh GPS location",
      "blue",
      has("deliveries.manage") ? "/admin/tracking?view=riders" : null,
    ],
    [
      "Avg. delivery time",
      values?.average_minutes == null ? "—" : `${values.average_minutes} min`,
      Clock3,
      "Pickup to doorstep · today",
      "violet",
      has("reports.operations") ? "/reports" : null,
    ],
    [
      "Delayed deliveries",
      values?.delayed_deliveries,
      TriangleAlert,
      "Past the estimated arrival time",
      "orange",
      has("deliveries.manage") ? "/admin/deliveries" : null,
    ],
  ];
  return (
    <div className="admin-metrics" aria-label="Global delivery metrics">
      {cards.map(([label, value, Icon, detail, color, path]) => {
        const content = (
          <>
            <div className="admin-metric-top">
              <span>{label}</span>
              <span className="admin-metric-icon">
                <Icon size={19} strokeWidth={1.7} aria-hidden="true" />
              </span>
            </div>
            <strong aria-busy={loading}>
              {loading ? (
                <span className="admin-value-skeleton" />
              ) : (
                (value ?? "—")
              )}
            </strong>
            <small>{detail}</small>
          </>
        );
        const className = `admin-metric admin-metric--${color}${path ? " admin-metric--link" : ""}`;
        return path ? (
          <Link
            className={className}
            to={path}
            key={label}
            aria-label={`${label}: ${value ?? "unavailable"}. Open ${label.toLowerCase() === "available riders" ? "rider fleet" : label.toLowerCase() === "avg. delivery time" ? "reports" : label.toLowerCase() === "delayed deliveries" ? "dispatch" : "order management"}`}
            data-attention={label === "Delayed deliveries" && Number(value) > 0}
          >
            <span className="admin-metric-navigation">
              <ArrowUpRight size={14} aria-hidden="true" />
            </span>
            {content}
          </Link>
        ) : (
          <article className={className} key={label}>
            {content}
          </article>
        );
      })}
    </div>
  );
}

function FleetMapPanel({ resource, large = false }) {
  const { pathname, search } = useLocation();
  const viewingFleet = new URLSearchParams(search).get("view") === "riders";
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [focusVersion, setFocusVersion] = useState(0);
  const [follow, setFollow] = useState(false);
  const liveMap = useLiveMapSnapshot("/admin/operations-overview", [
    "locations",
    "settings",
  ]);
  const fleet = mergeFleetLocations(resource.data?.fleet || [], liveMap?.fleet);
  const visible = fleet.filter(
    (rider) => filter === "all" || rider.status === filter,
  );
  const mapped = visible.filter(
    (rider) => rider.latitude != null && rider.longitude != null,
  );
  const store = liveMap?.location || resource.data?.location;
  const selected = visible.find((rider) => rider.id === selectedId);
  function selectRider(id) {
    setSelectedId(id);
    setFocusVersion((version) => version + 1);
    setFollow(true);
  }
  return (
    <article
      className={`admin-panel admin-fleet-panel${large ? " admin-fleet-panel--large" : ""}`}
    >
      <div className="admin-panel-heading">
        <div>
          <h2>
            Live fleet overview{" "}
            <span className="admin-live-tag">
              <span className="admin-status-dot" />
              {resource.error
                ? "STALE"
                : resource.loading
                  ? "CONNECTING"
                  : "LIVE"}
            </span>
          </h2>
          <p>
            {large
              ? "Select a rider to focus their latest location."
              : "Recent rider locations and outlet coverage."}
          </p>
        </div>
        {!viewingFleet && (
          <Link to="/admin/tracking?view=riders" className="admin-text-link">
            View fleet <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        )}
      </div>
      <div className="admin-map-toolbar">
        <div className="admin-segmented" aria-label="Map rider filters">
          {[
            ["all", "All riders"],
            ["available", "Available"],
            ["on_delivery", "On delivery"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => {
                setFilter(value);
                setSelectedId(null);
                setFollow(false);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="admin-map-count">
          <span className="admin-status-dot" />
          {mapped.length} located
        </span>
      </div>
      <div className="admin-map-content">
        <Suspense
          fallback={
            <div className="admin-map-loading" role="status">
              Loading fleet map…
            </div>
          }
        >
          <DeliveryMap
            location={store}
            radius={resource.data?.radius_km}
            fleet={visible}
            selected={selected}
            focusVersion={focusVersion}
            follow={follow}
            onBrowse={() => setFollow(false)}
            onSelect={selectRider}
            onFollow={(value) => setFollow(value)}
            showRiderList={large || pathname === "/admin/riders"}
          />
        </Suspense>
      </div>
      <div className="admin-map-legend">
        <span>
          <i className="admin-legend-dot admin-legend-dot--store" />
          Restaurant outlet
        </span>
        <span>
          <i className="admin-legend-dot" />
          Available rider
        </span>
        <span>
          <i className="admin-legend-dot admin-legend-dot--busy" />
          On delivery
        </span>
        <span>
          <i className="admin-legend-dot admin-legend-dot--selected" />
          Selected rider
        </span>
        <span className="admin-coverage-label">
          Restaurant delivery radius · {resource.data?.radius_km ?? "—"} km
        </span>
      </div>
      <div className="admin-map-rider-strip">
        {mapped.length ? (
          mapped.slice(0, 4).map((rider) => (
            <button
              key={rider.id}
              className={selected?.id === rider.id ? "is-selected" : ""}
              onClick={() => selectRider(rider.id)}
              aria-pressed={selected?.id === rider.id}
            >
              <span className="admin-small-avatar">
                {rider.name.slice(0, 1)}
              </span>
              <span>
                <strong>{rider.name}</strong>
                <small>{statusLabel(rider.status)}</small>
              </span>
              <MapPin size={14} aria-hidden="true" />
            </button>
          ))
        ) : (
          <p>
            {resource.loading
              ? "Fetching rider locations…"
              : "No fresh rider locations in this view. Riders appear when they go online and share GPS."}
          </p>
        )}
      </div>
    </article>
  );
}

function DeliveryTable({ deliveries, total, loading, unavailable }) {
  const [query, setQuery] = useState("");
  const filtered = deliveries.filter((delivery) =>
    `${delivery.order?.order_number} ${delivery.rider?.name || ""} ${delivery.order?.customer_name_snapshot || ""}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <article className="admin-panel admin-orders-panel">
      <div className="admin-panel-heading">
        <div>
          <h2>
            Active deliveries{" "}
            <span className="admin-count">{total ?? deliveries.length}</span>
          </h2>
          <p>Keep every order moving in the right direction.</p>
        </div>
        <Link className="admin-text-link" to="/admin/deliveries">
          Manage dispatch <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
      </div>
      <div className="admin-table-toolbar">
        <label className="admin-search">
          <Search size={17} aria-hidden="true" />
          <input
            aria-label="Search active deliveries"
            placeholder="Search order, customer or rider…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            type="search"
          />
        </label>
        <span>
          Showing {Math.min(filtered.length, 8)} of {total ?? deliveries.length}
        </span>
      </div>
      <div
        className="admin-table-scroll"
        role="region"
        aria-label="Active deliveries table"
        tabIndex={0}
      >
        <table className="admin-table admin-table--pinned">
          <thead>
            <tr>
              <th scope="col">Order</th>
              <th scope="col">Customer</th>
              <th scope="col">Rider</th>
              <th scope="col">Status</th>
              <th scope="col">ETA</th>
              <th scope="col">Amount</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 8).map((delivery) => (
              <tr key={delivery.id}>
                <td>
                  <strong>{delivery.order?.order_number}</strong>
                </td>
                <td>{delivery.order?.customer_name_snapshot || "Guest"}</td>
                <td>
                  <span className="admin-rider-cell">
                    {delivery.rider && (
                      <span className="admin-small-avatar">
                        {delivery.rider.name.slice(0, 1)}
                      </span>
                    )}
                    {delivery.rider?.name || (
                      <span className="admin-unassigned">Awaiting rider</span>
                    )}
                  </span>
                </td>
                <td>
                  <AdminBadge status={delivery.status} />
                </td>
                <td
                  className={
                    delivery.estimated_arrival_at &&
                    new Date(delivery.estimated_arrival_at) < new Date()
                      ? "admin-late"
                      : ""
                  }
                >
                  {time(delivery.estimated_arrival_at)}
                </td>
                <td>{currency(delivery.order?.total)}</td>
                <td>
                  <Link
                    className="admin-icon-button"
                    to="/admin/deliveries"
                    aria-label={`Manage ${delivery.order?.order_number}`}
                  >
                    <ArrowUpRight size={17} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {loading && <Skeleton cards={1} label="Loading active deliveries" />}
      {!loading && !unavailable && !filtered.length && (
        <EmptyState
          compact
          title={
            query ? "No matching deliveries" : "A clear queue. A fresh start."
          }
          description={
            query
              ? "Try another order number, customer or rider."
              : "Active deliveries will appear here as orders come in."
          }
        />
      )}
      {Number(total) > 8 && (
        <Link className="admin-table-footer" to="/admin/deliveries">
          View all {total} active deliveries <ArrowRight size={15} />
        </Link>
      )}
    </article>
  );
}

function DashboardPriorities({ resource, user }) {
  const metrics = resource.data?.metrics;
  const actions = [
    {
      title: "Manage orders",
      description: "Review incoming orders and keep preparation moving.",
      value: metrics?.active_orders,
      label: "active orders",
      icon: ShoppingBag,
      to: "/admin/orders",
      permission: "orders.manage",
    },
    {
      title: "Assign riders",
      description: "Match waiting deliveries with an available rider.",
      value: metrics?.awaiting_rider,
      label: "awaiting a rider",
      icon: Bike,
      to: "/admin/deliveries#dispatch-queue",
      permission: "deliveries.manage",
    },
    {
      title: "Review delays",
      description: "Follow up on deliveries past their estimated arrival.",
      value: metrics?.delayed_deliveries,
      label: "delayed deliveries",
      icon: TriangleAlert,
      to: "/admin/tracking",
      permission: "deliveries.manage",
    },
  ].filter((action) => user?.permissions?.includes(action.permission));
  return (
    <article className="admin-panel admin-priorities-panel">
      <div className="admin-panel-heading">
        <div>
          <h2>Today’s priorities</h2>
          <p>A clear next step for your restaurant team.</p>
        </div>
        <ShoppingBag size={19} aria-hidden="true" />
      </div>
      <div className="admin-priority-actions">
        {actions.map(({ title, description, value, label, icon: Icon, to }) => (
          <Link className="admin-priority-action" to={to} key={title}>
            <span className="admin-outlet-icon">
              <Icon size={21} aria-hidden="true" />
            </span>
            <span className="admin-priority-copy">
              <strong>{title}</strong>
              <span>{description}</span>
              <small>
                {resource.loading ? "Loading…" : `${value ?? "—"} ${label}`}
              </small>
            </span>
            <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
        ))}
      </div>
      {user?.permissions?.includes("deliveries.manage") && (
        <div className="admin-tracking-shortcut">
          <div>
            <strong>Live delivery tracking</strong>
            <p>
              Open the map for rider locations, coverage, and delivery details.
            </p>
          </div>
          <Link
            to="/admin/tracking"
            className="admin-button admin-button--secondary"
          >
            Open tracking <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      )}
    </article>
  );
}

export function AdminDashboard({ user, tracking = false }) {
  const { search } = useLocation();
  const viewingFleet = new URLSearchParams(search).get("view") === "riders";
  const resource = useOverview();
  const data = resource.data;
  const metrics = data?.metrics;
  const fleet = data?.fleet || [];
  const active = metrics?.active_deliveries || 0;
  const assigned = Math.max(0, active - (metrics?.awaiting_rider || 0));
  // Phones: Open dispatch sits on the date row instead of a row of its own.
  const phone = useMediaQuery("(max-width: 850px)");
  const openDispatch = (
    <Link
      to="/admin/deliveries"
      className={`admin-button${phone ? " admin-open-dispatch" : ""}`}
    >
      <Truck size={17} aria-hidden="true" />
      Open dispatch <ArrowUpRight size={15} aria-hidden="true" />
    </Link>
  );
  return (
    <section
      className={`admin-page${tracking ? " admin-page--tracking" : " admin-page--overview"}`}
    >
      <AdminHeading
        title={
          tracking
            ? "Live delivery tracking"
            : user?.roles?.includes("manager") &&
                !user?.roles?.includes("administrator")
              ? "Service overview"
              : "Operations overview"
        }
        description={
          tracking
            ? "Monitor rider locations, delivery coverage, and orders that need attention."
            : `Welcome back, ${user?.name?.split(" ")[0] || "there"}. Review today’s workload and keep your restaurant running smoothly.`
        }
      >
        <RefreshButton resource={resource} />
        {!phone && openDispatch}
      </AdminHeading>
      <div className="admin-overview-bar" data-with-action={phone || undefined}>
        {phone ? (
          <span className="admin-overview-when">
            <span className="admin-section-context">
              <Clock3 size={14} aria-hidden="true" />
              Today ·{" "}
              {new Date(data?.server_time || Date.now()).toLocaleDateString(
                "en-PH",
                { weekday: "short", month: "short", day: "numeric" },
              )}
            </span>
            <Freshness resource={resource} />
          </span>
        ) : (
          <>
            <span className="admin-section-context">
              <Clock3 size={14} aria-hidden="true" />
              Today ·{" "}
              {new Date(data?.server_time || Date.now()).toLocaleDateString(
                "en-PH",
                { weekday: "short", month: "short", day: "numeric" },
              )}
            </span>
            <Freshness resource={resource} />
          </>
        )}
        {phone && openDispatch}
      </div>
      {resource.error && (
        <Feedback onRetry={resource.refresh}>{resource.error}</Feedback>
      )}
      {metrics &&
        (metrics.delayed_deliveries > 0 || metrics.awaiting_rider > 0) && (
          <div className="admin-priority-strip" role="status">
            <TriangleAlert size={21} aria-hidden="true" />
            <div>
              <strong>
                {metrics.delayed_deliveries > 0
                  ? `${metrics.delayed_deliveries} ${metrics.delayed_deliveries === 1 ? "delivery is" : "deliveries are"} past the estimated arrival`
                  : `${metrics.awaiting_rider} ${metrics.awaiting_rider === 1 ? "delivery needs" : "deliveries need"} a rider`}
              </strong>
              <p>
                {metrics.delayed_deliveries > 0 && metrics.awaiting_rider > 0
                  ? `${metrics.awaiting_rider} ${metrics.awaiting_rider === 1 ? "delivery is also waiting" : "deliveries are also waiting"} for a rider.`
                  : "Review the queue and coordinate the next step with your riders."}
              </p>
            </div>
            <Link
              to="/admin/deliveries"
              className="admin-button admin-button--secondary"
            >
              Review dispatch <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        )}
      {!tracking && (
        <Metrics data={data} loading={resource.loading} user={user} />
      )}
      <div className="admin-overview-grid">
        {tracking ? (
          <FleetMapPanel resource={resource} large />
        ) : (
          <DashboardPriorities resource={resource} user={user} />
        )}
        {!tracking && (
          <div className="admin-insight-column">
            <article className="admin-panel admin-dispatch-summary">
              <div className="admin-panel-heading">
                <div>
                  <h2>Dispatch at a glance</h2>
                  <p>Assignment progress and completed trips.</p>
                </div>
                <Truck size={19} aria-hidden="true" />
              </div>
              <div className="admin-summary-number">
                <strong>{metrics ? active : "—"}</strong>
                <span>deliveries in progress</span>
              </div>
              <div
                className="admin-progress-track"
                role="progressbar"
                aria-label="Active deliveries assigned to riders"
                aria-valuenow={
                  active ? Math.round((assigned / active) * 100) : 0
                }
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span
                  style={{
                    width: `${active ? (assigned / active) * 100 : 0}%`,
                  }}
                />
              </div>
              <div className="admin-summary-legend">
                <span>
                  <i className="admin-legend-dot" />
                  Assigned <strong>{metrics ? assigned : "—"}</strong>
                </span>
                <span>
                  <i className="admin-legend-dot admin-legend-dot--waiting" />
                  Awaiting rider{" "}
                  <strong>{metrics ? metrics.awaiting_rider : "—"}</strong>
                </span>
              </div>
              <div className="admin-summary-row">
                <span>
                  <Check size={16} aria-hidden="true" /> Delivered today
                </span>
                <strong>{metrics ? metrics.delivered_today : "—"}</strong>
              </div>
              <Link
                className="admin-text-link"
                to="/admin/deliveries#dispatch-queue"
              >
                Go to dispatch queue <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </article>
            <article className="admin-panel admin-outlet-summary">
              <div className="admin-outlet-icon">
                <Store size={23} strokeWidth={1.6} aria-hidden="true" />
              </div>
              <div>
                <span className="admin-eyebrow">YOUR RESTAURANT</span>
                <h2>{data?.location?.name || "Your primary outlet"}</h2>
                <p>
                  {data?.location?.address ||
                    "Set your location to get deliveries flowing."}
                </p>
              </div>
              <div className="admin-outlet-summary-footer">
                <AdminBadge
                  status={
                    !data
                      ? "neutral"
                      : !isOutletConfigured(data.location)
                        ? "pending"
                        : data.location?.is_active === false
                          ? "offline"
                          : "active"
                  }
                >
                  {!data
                    ? resource.error
                      ? "Outlet unavailable"
                      : "Loading outlet"
                    : !isOutletConfigured(data.location)
                      ? "Setup needed"
                      : data.location?.is_active === false
                        ? "Offline"
                        : "Accepting deliveries"}
                </AdminBadge>
                {user?.permissions?.includes("settings.manage") && (
                  <Link
                    to="/admin/outlets"
                    className="admin-button admin-button--secondary"
                    aria-label="Configure restaurant outlet"
                  >
                    <Settings2 size={17} />
                    {isOutletConfigured(data?.location)
                      ? "Manage outlet"
                      : "Set up outlet"}
                  </Link>
                )}
              </div>
            </article>
          </div>
        )}
      </div>
      {tracking && (
        <Metrics data={data} loading={resource.loading} user={user} />
      )}
      {tracking && (
        <nav
          className="admin-tracking-views"
          aria-label="Delivery workspace views"
        >
          <Link
            to="/admin/tracking"
            aria-current={!viewingFleet ? "page" : undefined}
          >
            <Truck size={17} aria-hidden="true" /> Active deliveries
          </Link>
          <Link
            to="/admin/tracking?view=riders"
            aria-current={viewingFleet ? "page" : undefined}
          >
            <UsersRound size={17} aria-hidden="true" /> Rider fleet
          </Link>
        </nav>
      )}
      {tracking &&
        (viewingFleet ? (
          <RiderTeamPanel user={user} resource={resource} />
        ) : (
          <DeliveryTable
            deliveries={data?.deliveries || []}
            total={metrics?.active_deliveries}
            loading={resource.loading}
            unavailable={!data && !!resource.error}
          />
        ))}
      <div className="admin-bottom-note">
        {tracking && (
          <span>
            <UsersRound size={15} aria-hidden="true" />{" "}
            {
              fleet.filter((rider) =>
                ["available", "on_delivery"].includes(rider.status),
              ).length
            }{" "}
            riders with fresh locations
          </span>
        )}
        {user?.permissions?.includes("dashboard.view") && (
          <Link to="/dashboard" className="admin-text-link">
            Restaurant overview <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        )}
        <span>Delivery averages use today’s completed trips.</span>
      </div>
    </section>
  );
}

function RiderTeamPanel({ user, resource }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [pending, setPending] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const lock = useRef(false);
  // Phones: one card per rider, the account button on the right.
  const phone = useMediaQuery("(max-width: 850px)");
  const canManage = user?.permissions?.includes("users.manage");
  const fleet = resource.data?.fleet || [];
  const visible = fleet.filter(
    (rider) =>
      rider.name.toLowerCase().includes(query.toLowerCase()) &&
      (filter === "all" || rider.status === filter),
  );
  async function toggle(rider) {
    if (lock.current) return;
    lock.current = true;
    setPending(rider.id);
    setFeedback(null);
    try {
      await api(`/admin/users/${rider.id}/active`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !rider.is_active }),
      });
      setFeedback({
        message: `${rider.name}’s account ${rider.is_active ? "deactivated" : "activated"}.`,
        tone: "success",
      });
      await resource.refresh();
    } catch (error) {
      setFeedback({ message: error.message, tone: "error" });
    } finally {
      lock.current = false;
      setPending(null);
    }
  }
  return (
    <>
      {feedback && <Feedback tone={feedback.tone}>{feedback.message}</Feedback>}
      <article className="admin-panel">
        <div className="admin-panel-heading">
          <div>
            <h2>Rider fleet</h2>
            <p>Online status is controlled by each rider’s GPS session.</p>
          </div>
          {canManage && (
            <Link
              className={
                phone
                  ? "admin-text-link"
                  : "admin-button admin-button--secondary"
              }
              to="/admin/users"
            >
              {!phone && <UsersRound size={17} aria-hidden="true" />}
              Manage team <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          )}
        </div>
        <div className="admin-table-toolbar admin-fleet-toolbar">
          <label className="admin-search">
            <Search size={17} />
            <input
              type="search"
              aria-label="Search riders"
              placeholder={phone ? "Search riders…" : "Search riders by name…"}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label className="admin-filter-label">
            <span className="admin-filter-text">Status</span>
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              <option value="all">All statuses</option>
              {["available", "on_delivery", "offline", "location_stale"].map(
                (value) => (
                  <option value={value} key={value}>
                    {statusLabel(value)}
                  </option>
                ),
              )}
            </select>
          </label>
        </div>
        {phone ? (
          <ul className="admin-fleet-list" aria-label="Rider fleet">
            {visible.map((rider) => (
              <li key={rider.id} className="admin-fleet-card">
                <span className="admin-small-avatar" aria-hidden="true">
                  {rider.name.slice(0, 1)}
                </span>
                <div className="admin-fleet-main">
                  <strong>{rider.name}</strong>
                  <span className="admin-fleet-meta">
                    <span className="admin-capitalize">
                      {rider.vehicle_type || "No vehicle"}
                    </span>
                    {" · "}
                    {rider.active_deliveries}{" "}
                    {Number(rider.active_deliveries) === 1
                      ? "delivery"
                      : "deliveries"}
                  </span>
                  <span className="admin-fleet-badges">
                    <AdminBadge status={rider.status} />
                    {!rider.is_active && (
                      <AdminBadge status="offline">Deactivated</AdminBadge>
                    )}
                  </span>
                  <small>
                    {rider.located_at
                      ? `GPS ${new Date(rider.located_at).toLocaleString([], {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}`
                      : "No location yet"}
                  </small>
                </div>
                {canManage && (
                  <Button
                    className="admin-fleet-toggle"
                    variant="secondary"
                    data-tone={rider.is_active ? "danger" : undefined}
                    busy={pending === rider.id}
                    disabled={
                      pending != null ||
                      (rider.is_active && rider.active_deliveries > 0)
                    }
                    title={
                      rider.is_active && rider.active_deliveries > 0
                        ? "Finish or reassign this rider’s deliveries first"
                        : undefined
                    }
                    onClick={() => toggle(rider)}
                  >
                    {rider.is_active ? "Deactivate" : "Activate"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
        <div
          className="admin-table-scroll"
          role="region"
          aria-label="Rider fleet table"
          tabIndex={0}
        >
          <table className="admin-table">
            <thead>
              <tr>
                {[
                  "Rider",
                  "Vehicle",
                  "Status",
                  "Active deliveries",
                  "Last GPS update",
                  "Account",
                ].map((label) => (
                  <th scope="col" key={label}>
                    {label}
                  </th>
                ))}
                {user.permissions.includes("users.manage") && (
                  <th scope="col">Action</th>
                )}
              </tr>
            </thead>
            <tbody>
              {visible.map((rider) => (
                <tr key={rider.id}>
                  <td>
                    <span className="admin-rider-cell">
                      <span className="admin-small-avatar">
                        {rider.name.slice(0, 1)}
                      </span>
                      <strong>{rider.name}</strong>
                    </span>
                  </td>
                  <td className="admin-capitalize">
                    {rider.vehicle_type || "Not configured"}
                  </td>
                  <td>
                    <AdminBadge status={rider.status} />
                  </td>
                  <td>{rider.active_deliveries}</td>
                  <td>
                    {rider.located_at
                      ? new Date(rider.located_at).toLocaleString([], {
                          dateStyle: "short",
                          timeStyle: "short",
                        })
                      : "No location yet"}
                  </td>
                  <td>
                    <AdminBadge status={rider.is_active ? "active" : "offline"}>
                      {rider.is_active ? "Active" : "Deactivated"}
                    </AdminBadge>
                  </td>
                  {user.permissions.includes("users.manage") && (
                    <td>
                      <Button
                        className="admin-button admin-button--secondary"
                        variant="secondary"
                        busy={pending === rider.id}
                        disabled={
                          pending != null ||
                          (rider.is_active && rider.active_deliveries > 0)
                        }
                        onClick={() => toggle(rider)}
                      >
                        {rider.is_active ? "Deactivate" : "Activate"}
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
        {resource.loading ? (
          <Skeleton cards={1} label="Loading rider fleet" />
        ) : (
          !visible.length && (
            <EmptyState
              compact
              title="No riders in this view"
              description="Try another search or add a rider through team management."
            />
          )
        )}
      </article>
    </>
  );
}

function normalizedLocation(value) {
  value = value || {};
  return {
    name: value.name || "",
    address: value.address || "",
    latitude: value.latitude ?? "",
    longitude: value.longitude ?? "",
    phone: value.phone || "",
    contact_email: value.contact_email || "",
    is_active: value.is_active !== false,
    opening_hours: Object.fromEntries(
      days.map((day) => [
        day,
        {
          open: value.opening_hours?.[day]?.open || "",
          close: value.opening_hours?.[day]?.close || "",
          closed: !!value.opening_hours?.[day]?.closed,
        },
      ]),
    ),
  };
}

export function OutletManager() {
  const [draft, setDraft] = useState(null);
  const [saved, setSaved] = useState(null);
  const [radius, setRadius] = useState(8);
  const [preview, setPreview] = useState(0);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [resolvingAddress, setResolvingAddress] = useState(false);
  const [addressStatus, setAddressStatus] = useState("");
  const addressRequest = useRef(null);
  const saveLock = useRef(false);
  const resource = usePollingResource(
    async ({ signal }) => {
      const result = await api("/admin/delivery-policy", { signal });
      return {
        location: normalizedLocation(result.data.location),
        radius: result.data.policy?.radius_km ?? 8,
      };
    },
    { resourceKey: "outlet-config", topics: ["settings"] },
  );
  const location = draft || resource.data?.location;
  const savedLocation = (saved || resource.data)?.location;
  const setupNeeded = !!location && !isOutletConfigured(savedLocation);
  const hasPin = hasOutletCoordinates(location);
  const detailsReady = !!location?.name.trim() && !!location?.address.trim();
  const radiusValue = draft ? radius : (resource.data?.radius ?? 8);
  const changed =
    !!draft &&
    JSON.stringify({ location: draft, radius: Number(radius) }) !==
      JSON.stringify(saved || resource.data);
  const saveState = saving
    ? "saving"
    : feedback?.tone === "error"
      ? "error"
      : changed
        ? "dirty"
        : feedback?.kind === "discarded"
          ? "discarded"
          : feedback?.tone === "success"
            ? "saved"
            : setupNeeded
              ? "setup"
              : "clean";
  const saveStatus = {
    saving: [
      "Saving outlet settings…",
      "Your changes are being saved together.",
    ],
    error: [
      "Your changes haven’t been saved",
      "Your edits are kept. Review the message above and try again.",
    ],
    dirty: [
      "You have unsaved changes",
      "Save to update your outlet, coverage and opening hours.",
    ],
    discarded: [
      "Changes discarded",
      setupNeeded
        ? "No pickup location is saved yet. Complete the setup when you’re ready."
        : "Your saved outlet settings have been restored.",
    ],
    saved: [
      "Outlet settings saved",
      "Your pickup location and delivery settings are up to date.",
    ],
    clean: ["All changes saved", "Make an edit to enable saving."],
    setup: [
      "Your outlet needs setup",
      "Add the outlet details, place its pickup pin, then save your settings.",
    ],
  }[saveState];
  const dockPinned = useSaveDock(saveState);
  useEffect(() => () => addressRequest.current?.abort(), []);
  function update(key, value) {
    if (["address", "latitude", "longitude"].includes(key)) {
      addressRequest.current?.abort();
      setResolvingAddress(false);
      setAddressStatus("");
    }
    setFeedback(null);
    if (!draft) {
      setSaved(resource.data);
      setRadius(resource.data?.radius ?? 8);
    }
    setDraft((current) => ({
      ...(current || resource.data.location),
      [key]: value,
    }));
  }
  async function moveOutlet(point) {
    const latitude = Number(point.lat.toFixed(6));
    const longitude = Number(point.lng.toFixed(6));
    update("latitude", latitude);
    setDraft((current) => ({ ...current, longitude, address: "" }));
    const controller = new AbortController();
    addressRequest.current = controller;
    setResolvingAddress(true);
    setAddressStatus("Finding the street address for this pin…");
    try {
      const response = await api(
        `/maps/reverse?latitude=${latitude}&longitude=${longitude}`,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      const address = response.data?.label;
      setDraft((current) =>
        Number(current.latitude) === latitude &&
        Number(current.longitude) === longitude &&
        !current.address
          ? { ...current, address: address || "" }
          : current,
      );
      setAddressStatus(
        address
          ? "Address filled from the pin. Review it and add entrance details if needed."
          : "No street address found. Enter the store address manually; your pin is kept.",
      );
    } catch {
      if (!controller.signal.aborted)
        setAddressStatus(
          "Address lookup is unavailable. Enter the store address manually; your pin is kept.",
        );
    } finally {
      if (!controller.signal.aborted) setResolvingAddress(false);
    }
  }
  async function save(event) {
    event.preventDefault();
    if (saveLock.current || resolvingAddress) return;
    if (!isOutletConfigured(location)) {
      setFeedback({
        tone: "error",
        message:
          "Enter an outlet name and address, then place a valid pickup pin before saving.",
      });
      return;
    }
    saveLock.current = true;
    setSaving(true);
    setFeedback(null);
    try {
      const payload = {
        location: {
          ...location,
          latitude: Number(location.latitude),
          longitude: Number(location.longitude),
          opening_hours: Object.fromEntries(
            days.map((day) => [
              day,
              {
                ...location.opening_hours[day],
                open: location.opening_hours[day].open || null,
                close: location.opening_hours[day].close || null,
              },
            ]),
          ),
        },
        radius_km: Number(radiusValue),
      };
      const response = await api("/admin/outlet-config", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      const next = {
        location: normalizedLocation(response.data.location),
        radius: response.data.radius_km,
      };
      setDraft(next.location);
      setSaved(next);
      setRadius(next.radius);
      setFeedback({
        tone: "success",
        message:
          "Outlet settings saved. Your location, coverage and availability are up to date.",
      });
    } catch (error) {
      setFeedback({ tone: "error", message: error.message });
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }
  return (
    <section className="admin-page">
      <AdminHeading
        eyebrow="GREAT DELIVERY STARTS HERE"
        title="Restaurant outlets"
        description="Manage your pickup location, delivery area, and weekly availability."
      >
        {location && (
          <span className="admin-form-status" data-state={saveState}>
            {saving ? (
              <RefreshCw size={15} className="spin" aria-hidden="true" />
            ) : changed ? (
              <TriangleAlert size={15} aria-hidden="true" />
            ) : setupNeeded ? (
              <MapPin size={15} aria-hidden="true" />
            ) : (
              <Check size={15} aria-hidden="true" />
            )}
            {saving
              ? "Saving…"
              : changed
                ? "Unsaved changes"
                : setupNeeded
                  ? "Setup needed"
                  : "Saved"}
          </span>
        )}
        {location && (
          <AdminBadge
            status={
              setupNeeded
                ? "pending"
                : savedLocation?.is_active
                  ? "active"
                  : "offline"
            }
          >
            {setupNeeded
              ? "Pickup location not configured"
              : savedLocation?.is_active
                ? "Accepting deliveries"
                : "Outlet offline"}
          </AdminBadge>
        )}
      </AdminHeading>
      {resource.error && (
        <Feedback onRetry={resource.refresh}>{resource.error}</Feedback>
      )}
      {feedback && feedback.tone !== "success" && (
        <Feedback tone={feedback.tone}>{feedback.message}</Feedback>
      )}
      {resource.loading ? (
        <Skeleton label="Loading outlet configuration" />
      ) : (
        location && (
          <>
            {setupNeeded && (
              <article
                className="admin-outlet-setup"
                aria-labelledby="outlet-setup-title"
              >
                <div>
                  <span className="admin-eyebrow">FIRST-TIME SETUP</span>
                  <h2 id="outlet-setup-title">Set up your restaurant outlet</h2>
                  <p>
                    Save your restaurant’s pickup location to show it on the
                    administrator map and use it for new delivery orders.
                  </p>
                </div>
                <ol>
                  <li data-complete={detailsReady}>
                    <span aria-hidden="true">
                      {detailsReady ? <Check size={17} /> : "1"}
                    </span>
                    <div>
                      <strong>Add outlet details</strong>
                      <small>
                        Enter the restaurant name and full street address.
                      </small>
                    </div>
                  </li>
                  <li data-complete={hasPin}>
                    <span aria-hidden="true">
                      {hasPin ? <Check size={17} /> : "2"}
                    </span>
                    <div>
                      <strong>Place the pickup pin</strong>
                      <small>
                        Search for the address, click the map, or enter
                        coordinates.
                      </small>
                    </div>
                  </li>
                  <li data-complete={false}>
                    <span aria-hidden="true">3</span>
                    <div>
                      <strong>Review and save</strong>
                      <small>
                        Set the delivery radius, hours and availability, then
                        save.
                      </small>
                    </div>
                  </li>
                </ol>
              </article>
            )}
            <div className="admin-outlet-strip">
              <span className="admin-outlet-icon">
                <Store size={23} />
              </span>
              <div>
                <strong>
                  {location.name || "Configure your primary outlet"}
                </strong>
                <small>
                  {setupNeeded
                    ? "Primary outlet · setup has not been saved yet"
                    : "Primary outlet · your restaurant’s pickup location"}
                </small>
              </div>
              <span className="admin-outlet-strip-radius">
                <MapPin size={16} /> {radiusValue} km delivery radius
              </span>
            </div>
            <div className="admin-outlet-grid">
              <div className="admin-outlet-map-column">
                <article className="admin-panel">
                  <div className="admin-panel-heading">
                    <div>
                      <h2>Location & delivery coverage</h2>
                      <p>
                        {hasPin
                          ? "Drag the pin to the entrance where riders collect orders."
                          : "Search your address or click the map to place your first pickup pin."}
                      </p>
                    </div>
                    <MapPin size={19} />
                  </div>
                  <OutletAddressSearch
                    disabled={saving}
                    onSelect={(place) => {
                      update("address", place.label);
                      setDraft((current) => ({
                        ...current,
                        latitude: Number(place.latitude),
                        longitude: Number(place.longitude),
                      }));
                      setPreview((value) => value + 1);
                    }}
                  />
                  <Suspense
                    fallback={
                      <div className="admin-map-loading" role="status">
                        Loading outlet map…
                      </div>
                    }
                  >
                    <DeliveryMap
                      location={location}
                      radius={radiusValue}
                      editable={!saving}
                      onMove={moveOutlet}
                      previewKey={preview}
                    />
                  </Suspense>
                  <div className="admin-map-legend">
                    <span>
                      <i className="admin-legend-dot admin-legend-dot--store" />
                      Outlet location
                    </span>
                    <span>
                      <i className="admin-legend-dot" />
                      Delivery coverage
                    </span>
                  </div>
                  <div className="admin-coordinate-note">
                    <MapPin size={15} aria-hidden="true" />
                    {hasPin
                      ? `${Number(location.latitude).toFixed(6)}, ${Number(location.longitude).toFixed(6)}`
                      : "No pickup coordinates set"}
                    <span>
                      {hasPin
                        ? "Moving the pin looks up its address automatically. Review the address before saving."
                        : "No store marker appears until you place a pin. You can also enter latitude and longitude in Outlet details."}
                    </span>
                  </div>
                </article>
                <article className="admin-coverage-note">
                  <span className="admin-outlet-icon">
                    <Truck size={23} />
                  </span>
                  <div>
                    <h3>How delivery coverage works</h3>
                    <p>
                      Coverage is measured as a straight-line radius from your
                      outlet. Delivery fees use road distance. New delivery
                      orders are paused when this outlet is offline.
                    </p>
                    <Link className="admin-text-link" to="/admin/delivery">
                      Delivery fees & detailed rules <ArrowUpRight size={14} />
                    </Link>
                  </div>
                </article>
              </div>
              <form
                id="admin-outlet-form"
                className="admin-outlet-form"
                onSubmit={save}
              >
                <fieldset disabled={saving}>
                  <article className="admin-panel">
                    <div className="admin-panel-heading">
                      <div>
                        <h2>Outlet details</h2>
                        <p>Pickup information and delivery availability.</p>
                      </div>
                      <Store size={18} />
                    </div>
                    <div className="admin-form-body">
                      <label>
                        Outlet name
                        <input
                          required
                          maxLength={120}
                          value={location.name}
                          onChange={(event) =>
                            update("name", event.target.value)
                          }
                          placeholder="e.g. DineFlow · Main branch"
                          autoComplete="organization"
                        />
                      </label>
                      <div className="admin-form-field">
                        <label htmlFor="admin-outlet-address">
                          Store address
                        </label>
                        <textarea
                          id="admin-outlet-address"
                          aria-describedby="admin-outlet-address-status"
                          aria-busy={resolvingAddress}
                          required
                          maxLength={500}
                          rows={2}
                          value={location.address}
                          onChange={(event) =>
                            update("address", event.target.value)
                          }
                          placeholder="Building, street, barangay, city"
                          autoComplete="street-address"
                        />
                        <small
                          id="admin-outlet-address-status"
                          role="status"
                          aria-live="polite"
                        >
                          {addressStatus ||
                            "The address fills automatically when you click the map or drop the store pin."}
                        </small>
                      </div>
                      <div className="admin-field-pair">
                        {[
                          ["latitude", "Latitude", -90, 90],
                          ["longitude", "Longitude", -180, 180],
                        ].map(([key, label, min, max]) => (
                          <label key={key}>
                            {label}
                            <input
                              type="number"
                              required
                              min={min}
                              max={max}
                              step="any"
                              value={location[key]}
                              onChange={(event) =>
                                update(key, event.target.value)
                              }
                            />
                          </label>
                        ))}
                      </div>
                      <div className="admin-field-pair">
                        <label>
                          Phone
                          <input
                            type="tel"
                            maxLength={32}
                            value={location.phone}
                            autoComplete="tel"
                            onChange={(event) =>
                              update("phone", event.target.value)
                            }
                          />
                        </label>
                        <label>
                          Contact email
                          <input
                            type="email"
                            maxLength={254}
                            value={location.contact_email}
                            autoComplete="email"
                            onChange={(event) =>
                              update("contact_email", event.target.value)
                            }
                          />
                        </label>
                      </div>
                      <div className="admin-radius-row">
                        <label>
                          Delivery radius <span>(km)</span>
                          <input
                            type="number"
                            required
                            min="0.1"
                            max="100"
                            step="0.1"
                            value={radiusValue}
                            onChange={(event) => {
                              if (!draft) {
                                setDraft(resource.data.location);
                                setSaved(resource.data);
                              }
                              setRadius(event.target.value);
                              setFeedback(null);
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          className="admin-button admin-button--secondary"
                          onClick={() => setPreview((value) => value + 1)}
                        >
                          <MapPin size={16} />
                          Preview coverage
                        </button>
                      </div>
                      <label className="admin-switch-row">
                        <span>
                          <strong>Accept delivery orders</strong>
                          <small>
                            {setupNeeded
                              ? "Choose whether to accept new deliveries once setup is saved."
                              : location.is_active
                                ? "Your outlet is active and accepting deliveries."
                                : "New delivery orders are paused."}
                          </small>
                        </span>
                        <input
                          type="checkbox"
                          role="switch"
                          checked={location.is_active}
                          onChange={(event) =>
                            update("is_active", event.target.checked)
                          }
                        />
                      </label>
                    </div>
                  </article>
                  <article className="admin-panel admin-hours-panel">
                    <div className="admin-panel-heading">
                      <div>
                        <h2>Operating hours</h2>
                        <p>
                          {
                            days.filter(
                              (day) => !location.opening_hours[day].closed,
                            ).length
                          }{" "}
                          days open each week · Times use your restaurant’s
                          timezone.
                        </p>
                      </div>
                      <Clock3 size={19} />
                    </div>
                    <OperatingHoursEditor
                      value={location.opening_hours}
                      onApplyAll={(hours) =>
                        update(
                          "opening_hours",
                          Object.fromEntries(
                            days.map((day) => [day, { ...hours }]),
                          ),
                        )
                      }
                      onChange={(day, hours) =>
                        update("opening_hours", {
                          ...location.opening_hours,
                          [day]: hours,
                        })
                      }
                    />
                    <div className="admin-hours-help">
                      <p>
                        “Open all day” has no outlet-hour restriction. Delivery
                        operating hours still apply.
                      </p>
                      <Link
                        to="/admin/system-settings"
                        className="admin-text-link"
                      >
                        Manage restaurant timezone{" "}
                        <ArrowUpRight size={14} aria-hidden="true" />
                      </Link>
                    </div>
                  </article>
                </fieldset>
              </form>
            </div>
            <div
              className="admin-save-bar"
              data-state={saveState}
              data-pinned={dockPinned}
              aria-busy={saving}
            >
              <div
                className="admin-save-status"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                {saving ? (
                  <RefreshCw size={19} className="spin" aria-hidden="true" />
                ) : saveState === "dirty" || saveState === "error" ? (
                  <TriangleAlert size={19} aria-hidden="true" />
                ) : setupNeeded ? (
                  <MapPin size={19} aria-hidden="true" />
                ) : (
                  <Check size={19} aria-hidden="true" />
                )}
                <div>
                  <strong>{saveStatus[0]}</strong>
                  <small>{saveStatus[1]}</small>
                </div>
              </div>
              <div className="admin-save-actions">
                <button
                  type="button"
                  className="admin-button admin-button--secondary"
                  disabled={!changed || saving}
                  onClick={() => {
                    addressRequest.current?.abort();
                    setResolvingAddress(false);
                    setAddressStatus("");
                    const baseline = saved || resource.data;
                    setDraft(baseline.location);
                    setRadius(baseline.radius);
                    setFeedback({
                      tone: "success",
                      kind: "discarded",
                      message:
                        "Unsaved changes discarded. Your saved outlet settings have been restored.",
                    });
                  }}
                >
                  Discard changes
                </button>
                <Button
                  type="submit"
                  form="admin-outlet-form"
                  className="admin-button"
                  busy={saving}
                  disabled={!changed || resolvingAddress}
                >
                  <Check size={17} />
                  Save changes
                </Button>
              </div>
            </div>
          </>
        )
      )}
    </section>
  );
}
