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
import { RiderNextDelivery } from "../components/RiderNextDelivery";
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
import "./riderSage.css";

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
    <RiderScreenSkeleton variant="dashboard" label="Loading rider dashboard" />
  );
}
export function RiderOverview({ user }) {
  const [restaurantContact, setRestaurantContact] = useState(null);
  const presence = useRiderPresence();
  const { data: recentResult } = usePollingResource(
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
  const presenceCopy = {
    online: [
      "Online",
      "Nearby offers are available while your GPS connection stays active.",
      "Review delivery offers",
    ],
    paused: [
      "GPS paused",
      "Your location needs attention. Reconnect GPS to resume nearby offers.",
      "Reconnect GPS",
    ],
    checking: [
      "Checking GPS",
      "Checking your availability and location connection.",
      "Check availability",
    ],
    disconnected: [
      "No connection",
      "Your connection is lost. Availability cannot be confirmed until you reconnect.",
      "Review connection status",
    ],
    unknown: [
      "Status unavailable",
      "We cannot verify your availability right now. Review the availability controls and try again.",
      "Review availability",
    ],
    offline: [
      "Offline",
      "Go online when you are ready to receive nearby delivery offers.",
      "Go online",
    ],
  };
  const [statusLabel, statusMessage, statusAction] =
    presenceCopy[presence.state] || presenceCopy.unknown;
  // The lightweight summary omits pickup; reuse the already requested outlet
  // address without issuing a second assignment query or changing dispatch order.
  const nextDelivery = data?.next_delivery
    ? {
        ...data.next_delivery,
        order: {
          ...data.next_delivery.order,
          pickup:
            data.next_delivery.order.pickup || restaurantContact || undefined,
        },
      }
    : null;
  const supportPhone = restaurantContact?.phone?.replace(/[^\d+]/g, "");
  const completedEvent = recentResult?.history?.find(
    (event) => event.to_status === "delivered",
  );
  const completedAt = completedEvent?.created_at
    ? new Date(completedEvent.created_at)
    : null;
  return (
    <section className="rider-home rider-sage-home">
      <PageHeader
        title="Your next stop, made clear"
        description={
          "Welcome, " +
          user.name.split(" ")[0] +
          ". Review your assignment before heading out."
        }
        actions={
          <span className="rider-dashboard-date">
            <CalendarDays size={17} aria-hidden="true" />
            {new Intl.DateTimeFormat("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            }).format(new Date())}
          </span>
        }
      />
      {error && <Feedback onRetry={load}>{error}</Feedback>}
      {data && error && (
        <p className="rider-data-freshness" role="status">
          Showing your last update
          {updatedAt
            ? " from " +
              updatedAt.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            : ""}
          . Refresh when your connection returns.
        </p>
      )}
      {!data && !error && <RiderDashboardSkeleton />}
      {data && (
        <>
          <div className="rider-dashboard-priority">
            <RiderNextDelivery
              delivery={nextDelivery}
              activeCount={data.active_count}
            />
            <aside
              className="rider-status-card"
              aria-labelledby="rider-status-heading"
            >
              <header>
                <h2 id="rider-status-heading">Availability & support</h2>
                <span className={"rider-status-badge " + presence.state}>
                  <Radio size={14} aria-hidden="true" />
                  {statusLabel}
                </span>
              </header>
              <div className={"rider-status-message " + presence.state}>
                <Radio size={20} aria-hidden="true" />
                <p>{statusMessage}</p>
              </div>
              <Link
                className="ui-button ui-button--primary rider-status-action"
                to="/rider/offers"
              >
                {statusAction}
                <ChevronRight size={18} aria-hidden="true" />
              </Link>
              <p className="rider-gps-explanation">
                Going online shares your location. Keep the rider page open;
                your browser may pause GPS while locked or in the background.
              </p>
              <div className="rider-status-details">
                <p>
                  <Radio size={17} aria-hidden="true" />
                  <span>
                    <strong>Assignment updates</strong>
                    <small>
                      {updatedAt
                        ? "Last refreshed " +
                          updatedAt.toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : "Checking for updates"}
                    </small>
                  </span>
                </p>
                <div className="rider-support-contact">
                  <Headphones size={19} aria-hidden="true" />
                  <div>
                    <strong>Restaurant support</strong>
                    {supportPhone ? (
                      <a href={"tel:" + supportPhone}>
                        <Phone size={15} aria-hidden="true" />
                        {restaurantContact.phone}
                      </a>
                    ) : restaurantContact?.contact_email ? (
                      <a href={"mailto:" + restaurantContact.contact_email}>
                        <Mail size={15} aria-hidden="true" />
                        {restaurantContact.contact_email}
                      </a>
                    ) : (
                      <p>
                        Ask the restaurant for contact details before your next
                        pickup.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </aside>
          </div>

          <section
            className="rider-dashboard-summary"
            aria-labelledby="rider-overview-heading"
          >
            <header>
              <div>
                <h2 id="rider-overview-heading">Your delivery activity</h2>
                <p>Completed work and your current workload.</p>
              </div>
              <Link className="rider-rating-link" to="/rider/reviews">
                View reviews <ChevronRight size={17} aria-hidden="true" />
              </Link>
            </header>
            <div className="rider-metrics">
              {[
                [
                  Bike,
                  "Active deliveries",
                  data.active_count,
                  "Assigned to you",
                ],
                [
                  CheckCircle2,
                  "Delivered today",
                  data.completed_today,
                  "Completed today",
                ],
                [
                  ClipboardList,
                  "Total delivered",
                  data.delivered_total,
                  "Lifetime deliveries",
                ],
              ].map(([Icon, label, value, context]) => (
                <article key={label}>
                  <Icon size={22} aria-hidden="true" />
                  <span>{label}</span>
                  <strong>
                    <CountUp value={value} />
                  </strong>
                  <small className="rider-metric-context">{context}</small>
                </article>
              ))}
              <article className="rider-rating-metric">
                <Star
                  className="rider-rating-star"
                  size={22}
                  aria-hidden="true"
                />
                <span>Customer rating</span>
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
                <small className="rider-metric-context">
                  {data.rating_count
                    ? String(data.rating_count) +
                      " verified review" +
                      (data.rating_count === 1 ? "" : "s")
                    : "After your first rated delivery"}
                </small>
              </article>
            </div>
          </section>

          <section
            className="rider-day-overview"
            aria-labelledby="rider-day-heading"
          >
            <header>
              <div>
                <h2 id="rider-day-heading">Recent activity</h2>
                <p>Your most recent completed delivery.</p>
              </div>
              <Link className="rider-day-history-link" to="/rider/history">
                Delivery history <ChevronRight size={17} aria-hidden="true" />
              </Link>
            </header>
            {recentResult ? (
              <Link
                className="rider-day-delivery-row"
                to={"/rider/deliveries/" + recentResult.id}
              >
                <span className="rider-day-delivery-time">
                  <CheckCircle2 size={20} aria-hidden="true" />
                  {completedAt && Number.isFinite(completedAt.getTime()) ? (
                    <time dateTime={completedEvent.created_at}>
                      {completedAt.toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </time>
                  ) : (
                    <span>Completed</span>
                  )}
                </span>
                <span className="rider-day-delivery-copy">
                  <strong>{recentResult.order.order_number}</strong>
                  <small>
                    {recentResult.order.destination?.address ||
                      "Delivery address not recorded"}
                  </small>
                </span>
                <StatusBadge status={recentResult.status} />
                <ChevronRight size={18} aria-hidden="true" />
              </Link>
            ) : (
              <p className="rider-recent-hint">
                Open delivery history to review your completed trips.
              </p>
            )}
          </section>

          <nav
            className="rider-dashboard-links"
            aria-labelledby="rider-links-heading"
          >
            <h2 id="rider-links-heading">Your rider workspace</h2>
            <div className="rider-shortcuts">
              <Link to="/rider/deliveries">
                <Bike size={22} aria-hidden="true" />
                <div>
                  <strong>My deliveries</strong>
                  <span>
                    {data.active_count} active assignment
                    {data.active_count === 1 ? "" : "s"}
                  </span>
                </div>
                <ChevronRight size={18} aria-hidden="true" />
              </Link>
              <Link to="/rider/offers">
                <MapPin size={22} aria-hidden="true" />
                <div>
                  <strong>Delivery offers</strong>
                  <span>Review nearby work when online</span>
                </div>
                <ChevronRight size={18} aria-hidden="true" />
              </Link>
              <Link to="/settings">
                <SlidersHorizontal size={22} aria-hidden="true" />
                <div>
                  <strong>Rider profile</strong>
                  <span>Your contact and vehicle details</span>
                </div>
                <ChevronRight size={18} aria-hidden="true" />
              </Link>
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
          <RiderScreenSkeleton
            variant="history"
            label="Loading delivery history"
          />
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
