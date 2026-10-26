import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bike,
  CheckCircle2,
  ClipboardList,
  Star,
  MapPin,
  ChevronRight,
  History,
  CalendarDays,
  Headphones,
  Radio,
  Search,
  ChevronLeft,
  SlidersHorizontal,
  Phone,
  Mail,
} from "lucide-react";
import { api } from "../api";
import { CountUp } from "../components/CountUp";
import { RiderScreenSkeleton } from "../components/RiderScreenSkeleton";
import { usePollingResource } from "../components/usePollingResource";
import { useRiderPresence } from "../components/riderPresence";
import {
  EmptyState,
  Feedback,
  PageHeader,
  Skeleton,
  Button,
  StatusBadge,
} from "../components/ui";
import "./workspaceSettings.css";
import "./riderHistory.css";
import "./riderDashboard.css";

const historyMoney = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});
const historyDate = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});
const historyTime = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

function DeliveryHistoryRow({ delivery }) {
  const lastEvent = (delivery.history || []).reduce(
    (latest, event) =>
      new Date(event.created_at).getTime() >
      new Date(latest?.created_at || 0).getTime()
        ? event
        : latest,
    null,
  );
  const finished = lastEvent?.created_at
    ? new Date(lastEvent.created_at)
    : null;
  const destination =
    delivery.order.destination?.address || "Address not recorded";
  return (
    <article className="rider-history-row">
      <div className="rider-history-order-cell">
        <span className="rider-history-order-icon">
          <ClipboardList size={20} aria-hidden="true" />
        </span>
        <Link
          className="rider-history-order"
          to={`/rider/deliveries/${delivery.id}`}
        >
          {delivery.order.order_number}
        </Link>
      </div>
      <div className="rider-history-destination">
        <MapPin size={17} aria-hidden="true" />
        <span>
          <span className="sr-only">Drop-off: </span>
          {destination}
        </span>
      </div>
      <div className="rider-history-date">
        <span className="rider-history-field-label">Finished</span>
        {finished && Number.isFinite(finished.getTime()) ? (
          <time dateTime={lastEvent.created_at}>
            <span>{historyDate.format(finished)}</span>
            <small>{historyTime.format(finished)}</small>
          </time>
        ) : (
          <span>Time not recorded</span>
        )}
      </div>
      <div className="rider-history-outcome">
        <StatusBadge status={delivery.status} />
      </div>
      <div className="rider-history-total">
        <span className="rider-history-field-label">Order total</span>
        <strong>
          {historyMoney.format(Number(delivery.order.total || 0))}
        </strong>
      </div>
      <ChevronRight
        className="rider-history-arrow"
        size={19}
        aria-hidden="true"
      />
      {delivery.status === "failed" && (
        <p className="rider-history-support">
          Contact the restaurant for delivery support.
        </p>
      )}
    </article>
  );
}

function RiderDashboardSkeleton() {
  return (
    <div
      className="rider-dashboard-skeleton"
      role="status"
      aria-label="Loading rider dashboard"
      aria-busy="true"
    >
      <div className="dashboard-skeleton-summary" aria-hidden="true">
        <div className="dashboard-skeleton-title" />
        <div className="dashboard-skeleton-copy" />
        <div className="dashboard-skeleton-metrics">
          {[0, 1, 2, 3].map((item) => (
            <div className="dashboard-skeleton-metric" key={item}>
              <i />
              <b />
              <span />
            </div>
          ))}
        </div>
      </div>
      <div className="dashboard-skeleton-main" aria-hidden="true">
        <div className="dashboard-skeleton-day">
          <div className="dashboard-skeleton-title short" />
          <div className="dashboard-skeleton-copy" />
          <div className="dashboard-skeleton-banner" />
          <div className="dashboard-skeleton-delivery" />
          <div className="dashboard-skeleton-link" />
        </div>
        <div className="dashboard-skeleton-status">
          <div className="dashboard-skeleton-title short" />
          <div className="dashboard-skeleton-banner tall" />
          <div className="dashboard-skeleton-button" />
          <div className="dashboard-skeleton-copy" />
          <div className="dashboard-skeleton-copy narrow" />
        </div>
      </div>
      <div className="dashboard-skeleton-tools" aria-hidden="true">
        <div className="dashboard-skeleton-title short" />
        <div className="dashboard-skeleton-tool-cards">
          {[0, 1, 2].map((item) => (
            <div className="dashboard-skeleton-tool" key={item}>
              <i />
              <span><b /><em /></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function RiderOverview({ user }) {
  const [restaurantContact, setRestaurantContact] = useState(null);
  const presence = useRiderPresence();
  const {
    data: recentResult,
  } = usePollingResource(
    async ({ signal }) => {
      const result = await api(
        "/rider/assignments?scope=history&status=delivered&per_page=10",
        { signal },
      );
      return result.data?.[0] || null;
    },
    { intervalMs: 60000, eventName: "rider-deliveries-updated" },
  );
  useEffect(() => {
    const controller = new AbortController();
    api("/restaurant/location", { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setRestaurantContact(result.data || {});
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const {
    data,
    error,
    updatedAt,
    refresh: load,
  } = usePollingResource(
    async ({ signal }) => (await api("/rider/summary", { signal })).data,
    { intervalMs: 15000, eventName: "rider-deliveries-updated" },
  );
  return (
    <section className="rider-home">
      <PageHeader
        title={`Welcome, ${user.name.split(" ")[0]}`}
        description="Your activity overview, next stop, and rider tools."
        actions={
          <span className="rider-dashboard-date">
            <CalendarDays size={15} aria-hidden="true" />
            {new Intl.DateTimeFormat("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            }).format(new Date())}
          </span>
        }
      />
      {error && <Feedback onRetry={load}>{error}</Feedback>}
      {data && error && (
        <p className="rider-data-freshness" role="status">
          Showing your last update
          {updatedAt
            ? ` from ${updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : ""}
          . Refresh when your connection returns.
        </p>
      )}
      {!data && !error && <RiderDashboardSkeleton />}
      {data && (
        <>
          <aside
            className="rider-dashboard-summary"
            aria-labelledby="rider-overview-heading"
          >
            <header>
              <div>
                <h2 id="rider-overview-heading">Delivery overview</h2>
                <p>Your activity at a glance.</p>
              </div>
              <Link className="rider-rating-link" to="/rider/reviews">
                View reviews <ChevronRight size={15} aria-hidden="true" />
              </Link>
            </header>
            <div className="rider-metrics">
              {[
                [Bike, "Active deliveries", data.active_count],
                [CheckCircle2, "Delivered today", data.completed_today],
                [ClipboardList, "Total delivered", data.delivered_total],
              ].map(([Icon, label, value]) => (
                <article key={label}>
                  <Icon size={22} aria-hidden="true" />
                  <span>{label}</span>
                  <strong>
                    <CountUp value={value} />
                  </strong>
                  <small className="rider-metric-context">
                    {label === "Active deliveries"
                      ? "Assigned to you"
                      : label === "Delivered today"
                        ? "Completed deliveries today"
                        : "Lifetime deliveries"}
                  </small>
                </article>
              ))}
              <article className="rider-rating-metric">
                <Star
                  className="rider-rating-star"
                  size={22}
                  aria-hidden="true"
                />
                <span>Customer rating</span>
                <div className="rider-rating-footer">
                  <strong>
                    {data.rating_count ? (
                      <>
                        <CountUp value={data.rating_average} decimals={1} />
                        <small> / 5</small>
                      </>
                    ) : (
                      <span className="rider-unrated">Not rated yet</span>
                    )}
                  </strong>
                </div>
                <small className="rider-metric-context">
                  {data.rating_count
                    ? `${data.rating_count} verified review${data.rating_count === 1 ? "" : "s"}`
                    : "After your first rated delivery"}
                </small>
              </article>
            </div>
          </aside>
          <div className="rider-dashboard-main">
            <section className="rider-day-overview" aria-labelledby="rider-day-heading">
              <header>
                <div>
                  <h2 id="rider-day-heading">Day overview</h2>
                  <p>Today’s activity</p>
                </div>
                <span className="rider-day-overview-icon" aria-hidden="true">
                  <Bike size={17} />
                </span>
              </header>
              <p className="rider-day-summary">
                <CheckCircle2 size={17} aria-hidden="true" />
                <span>
                  {data.completed_today} {data.completed_today === 1 ? "delivery" : "deliveries"} completed today. {data.active_count} active {data.active_count === 1 ? "delivery remains" : "deliveries remain"} in your queue.
                </span>
              </p>
              {(() => {
                const recent = recentResult || data.next_delivery;
                if (!recent) return null;
                const isCompleted = recent.status === "delivered";
                const completedEvent = recent.history?.find(
                  (event) => event.to_status === "delivered",
                );
                const completedDate = completedEvent?.created_at
                  ? new Date(completedEvent.created_at)
                  : null;
                return (
                  <Link
                    className="rider-day-delivery-row"
                    to={isCompleted ? `/rider/deliveries/${recent.id}` : `/rider/deliveries?delivery=${recent.id}`}
                  >
                    <span className="rider-day-delivery-time">
                      {isCompleted && completedDate && Number.isFinite(completedDate.getTime()) ? (
                        <>
                          <strong>{completedDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</strong>
                          <small>COMPLETED</small>
                        </>
                      ) : (
                        <>
                          <strong>Next up</strong>
                          <small>ASSIGNED</small>
                        </>
                      )}
                    </span>
                    <span className="rider-day-delivery-copy">
                      <strong>{recent.order.order_number}</strong>
                      <small>{recent.order.destination?.address || "Delivery address not recorded"}</small>
                    </span>
                    <span className={`rider-day-delivery-status state-${recent.status}`}>
                      {recent.status.replaceAll("_", " ")}
                    </span>
                    <ChevronRight size={16} aria-hidden="true" />
                  </Link>
                );
              })()}
              <Link className="rider-day-history-link" to="/rider/history">
                View delivery history <ChevronRight size={15} aria-hidden="true" />
              </Link>
            </section>
            <div className="rider-dashboard-side">
              <aside className="rider-status-card" aria-labelledby="rider-status-heading">
                <header>
                  <h2 id="rider-status-heading">Rider status</h2>
                  <span className={`rider-status-badge ${presence.state}`}>
                    {presence.state === "online" ? "Online" : presence.state === "paused" ? "GPS paused" : presence.state === "checking" ? "Checking" : "Offline"}
                  </span>
                </header>
                <div className={`rider-status-message ${presence.state}`}>
                  <Radio size={17} aria-hidden="true" />
                  <p>
                    {presence.state === "online"
                      ? "You’re online and ready to receive nearby delivery offers."
                      : presence.state === "paused"
                        ? "Reconnect GPS to resume nearby delivery offers."
                        : "New delivery offers are paused while you’re offline."}
                  </p>
                </div>
                <Link className="ui-button ui-button--primary rider-status-action" to="/rider/offers">
                  {presence.state === "online" ? "View offers" : presence.state === "paused" ? "Reconnect GPS" : "Go online"}
                </Link>
                <div className="rider-status-details">
                  <p><Radio size={15} aria-hidden="true" /><span><strong>Assignment data</strong><small>{updatedAt ? `Last available · refreshed ${updatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Checking for updates"}</small></span></p>
                  <p>{restaurantContact?.phone ? <Phone size={15} aria-hidden="true" /> : <Mail size={15} aria-hidden="true" />}<span><strong>Restaurant contact</strong><small>{restaurantContact?.phone || restaurantContact?.contact_email || "Contact details have not yet been added"}</small></span></p>
                </div>
              </aside>
            </div>
          </div>
          <nav className="rider-dashboard-links" aria-labelledby="rider-links-heading">
            <h2 id="rider-links-heading">Rider tools</h2>
            <div className="rider-shortcuts">
              <Link to="/rider/deliveries"><Bike size={18} aria-hidden="true" /><div><strong>My deliveries</strong><span>Manage your {data.active_count} active assignment{data.active_count === 1 ? "" : "s"}</span></div><ChevronRight size={16} aria-hidden="true" /></Link>
              <Link to="/rider/offers"><MapPin size={18} aria-hidden="true" /><div><strong>Delivery offers</strong><span>Review offers when you’re online</span></div><ChevronRight size={16} aria-hidden="true" /></Link>
              {restaurantContact?.phone ? (
                <a href={`tel:${restaurantContact.phone}`}><Headphones size={18} aria-hidden="true" /><div><strong>Rider support</strong><span>Get help with a delivery</span></div><ChevronRight size={16} aria-hidden="true" /></a>
              ) : restaurantContact?.contact_email ? (
                <a href={`mailto:${restaurantContact.contact_email}`}><Headphones size={18} aria-hidden="true" /><div><strong>Rider support</strong><span>Get help with a delivery</span></div><ChevronRight size={16} aria-hidden="true" /></a>
              ) : (
                <Link to="/settings"><Headphones size={18} aria-hidden="true" /><div><strong>Rider support</strong><span>Add restaurant contact details</span></div><ChevronRight size={16} aria-hidden="true" /></Link>
              )}
            </div>
          </nav>
        </>
      )}
    </section>
  );
}

export function RiderHistory() {
  const [result, setResult] = useState(null),
    [error, setError] = useState(""),
    [page, setPage] = useState(1),
    [status, setStatus] = useState("");
  const [retry, setRetry] = useState(0),
    [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(10);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      scope: "history",
      page: String(page),
      per_page: String(pageSize),
      ...(status ? { status } : {}),
      ...(query.trim() ? { q: query.trim() } : {}),
    });
    const timer = setTimeout(
      () =>
        api(`/rider/assignments?${params}`, { signal: controller.signal })
          .then((data) => {
            if (!controller.signal.aborted) setResult(data);
          })
          .catch((e) => {
            if (!controller.signal.aborted) setError(e.message);
          })
          .finally(() => {
            if (!controller.signal.aborted) setLoading(false);
          }),
      query.trim() ? 250 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [page, status, retry, query, pageSize]);
  const total = result?.meta?.total ?? 0;
  const lastPage = Math.max(1, result?.meta?.last_page || 1);
  return (
    <section className="rider-history-page">
      <PageHeader
        title="Delivery history"
        description="Your completed, cancelled and unsuccessful trips, all in one place."
      />
      <div className="rider-history-panel" aria-busy={loading}>
        <div className="rider-history-toolbar">
          <label className="rider-history-search">
            <span>Search deliveries</span>
            <div>
              <Search size={18} aria-hidden="true" />
              <input
                type="search"
                value={query}
                maxLength={120}
                placeholder="Order number, recipient or address"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
              />
            </div>
          </label>
          <label className="rider-history-filter">
            <span>
              <SlidersHorizontal size={14} aria-hidden="true" /> Outcome
            </span>
            <select
              aria-label="Delivery outcome"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All outcomes</option>
              <option value="delivered">Delivered</option>
              <option value="failed">Unsuccessful</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <label className="rider-history-page-size">
            <span>Per page</span>
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
            >
              <option value={10}>10 deliveries</option>
              <option value={20}>20 deliveries</option>
              <option value={50}>50 deliveries</option>
            </select>
          </label>
        </div>
        <div className="rider-history-results">
          <History size={16} aria-hidden="true" />
          <span role="status">
            {loading
              ? "Finding deliveries…"
              : error
                ? "Delivery records"
                : `${total} ${total === 1 ? "delivery" : "deliveries"}${query.trim() || status ? " found" : " in your history"}`}
          </span>
          {(query || status) && (
            <button
              className="rider-page-link"
              type="button"
              onClick={() => {
                setQuery("");
                setStatus("");
                setPage(1);
              }}
            >
              Clear filters
            </button>
          )}
        </div>
        {loading ? (
          <RiderScreenSkeleton variant="history" label="Loading delivery history" />
        ) : error ? (
          <Feedback onRetry={() => setRetry((value) => value + 1)}>
            {error}
          </Feedback>
        ) : (
          <>
            {!result?.data?.length && (
              <EmptyState
                title={
                  query.trim() || status
                    ? "No matching deliveries"
                    : "No past deliveries"
                }
                description={
                  query.trim() || status
                    ? "Try a different search or clear your filters."
                    : "Your completed trips will appear here after your first delivery."
                }
              />
            )}
            <div className="rider-history-list">
              {!!result?.data?.length && (
                <div className="rider-history-columns" aria-hidden="true">
                  <span>Order</span>
                  <span>Drop-off</span>
                  <span>Finished</span>
                  <span>Outcome</span>
                  <span className="rider-history-amount-label">
                    Order total
                  </span>
                  <span />
                </div>
              )}
              {result?.data?.map((delivery) => (
                <DeliveryHistoryRow key={delivery.id} delivery={delivery} />
              ))}
            </div>
            {result && total > 0 && (
              <nav
                className="workspace-pagination rider-history-pagination"
                aria-label="Delivery history pages"
              >
                <span className="rider-history-range">
                  {total
                    ? `${result.meta.from ?? (page - 1) * pageSize + 1}–${result.meta.to ?? Math.min(page * pageSize, total)} of ${total}`
                    : "0 deliveries"}
                </span>
                <Button
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((value) => value - 1)}
                >
                  <ChevronLeft size={16} aria-hidden="true" /> Previous
                </Button>
                <span>
                  Page {page} of {lastPage}
                </span>
                <Button
                  variant="secondary"
                  disabled={page >= lastPage}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next <ChevronRight size={16} aria-hidden="true" />
                </Button>
              </nav>
            )}
          </>
        )}
      </div>
    </section>
  );
}

export function RiderProfileSettings() {
  const [profile, setProfile] = useState(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api("/rider/profile", { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setProfile(result.data);
          setError("");
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [retry]);
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api("/rider/profile", {
        method: "PUT",
        body: JSON.stringify({
          phone: profile.phone || "",
          vehicle_type: profile.vehicle_type || "",
          vehicle_plate: profile.vehicle_plate || "",
        }),
      });
      setProfile(result.data);
      setNotice("Rider details saved.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="workspace-card"
      aria-labelledby="rider-settings-heading"
    >
      <h2 id="rider-settings-heading">Rider details</h2>
      <p>Your vehicle and contact details are used for delivery assignments.</p>
      {error && (
        <Feedback
          onRetry={!profile ? () => setRetry((value) => value + 1) : undefined}
        >
          {error}
        </Feedback>
      )}
      {notice && <Feedback tone="success">{notice}</Feedback>}
      {!profile && !error && (
        <Skeleton cards={1} label="Loading rider details" />
      )}
      {profile && (
        <form onSubmit={save} className="workspace-form">
          <label>
            Phone
            <input
              type="tel"
              autoComplete="tel"
              maxLength={32}
              value={profile.phone || ""}
              onChange={(e) =>
                setProfile({ ...profile, phone: e.target.value })
              }
            />
          </label>
          <label>
            Vehicle
            <select
              required
              value={profile.vehicle_type || ""}
              onChange={(e) =>
                setProfile({ ...profile, vehicle_type: e.target.value })
              }
            >
              <option value="">Choose your vehicle</option>
              <option value="bicycle">Bicycle</option>
              <option value="motorcycle">Motorcycle</option>
              <option value="car">Car</option>
            </select>
          </label>
          <label>
            Plate
            <input
              maxLength={24}
              value={profile.vehicle_plate || ""}
              onChange={(e) =>
                setProfile({ ...profile, vehicle_plate: e.target.value })
              }
            />
          </label>
          <div className="workspace-form-actions">
            <Button type="submit" busy={busy}>
              Save rider details
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
