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
  Search,
  ChevronLeft,
  SlidersHorizontal,
  Settings2,
  ArrowUpRight,
  Phone,
  Mail,
} from "lucide-react";
import { api } from "../api";
import { CountUp } from "../components/CountUp";
import { usePollingResource } from "../components/usePollingResource";
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

export function RiderOverview({ user }) {
  const [restaurantContact, setRestaurantContact] = useState(null);
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
        eyebrow="RIDER DASHBOARD"
        title={`Welcome, ${user.name.split(" ")[0]}`}
        description="Your activity overview, next stop, and rider tools."
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
      {!data && !error && <Skeleton label="Loading rider dashboard" />}
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
            <RiderNextDelivery
              delivery={data.next_delivery}
              activeCount={data.active_count}
            />
            <div className="rider-dashboard-side">
              <aside
                className="rider-dashboard-checklist"
                aria-labelledby="rider-tools-heading"
              >
                <header>
                  <h2 id="rider-tools-heading">
                    {data.next_delivery
                      ? ["picked_up", "in_transit"].includes(
                          data.next_delivery.status,
                        )
                        ? "Before completing delivery"
                        : "Before pickup"
                      : "Ready for your next shift"}
                  </h2>
                </header>
                <ol>
                  {(data.next_delivery
                    ? ["picked_up", "in_transit"].includes(
                        data.next_delivery.status,
                      )
                      ? [
                          "Check the recipient and drop-off instructions.",
                          "Keep delivery location sharing connected.",
                          "Save a delivery photo before marking delivered.",
                        ]
                      : [
                          "Check the restaurant address and order number.",
                          "Wait for the kitchen to mark the order ready.",
                          "Confirm pickup before starting the drop-off.",
                        ]
                    : [
                        "Check your vehicle and contact details.",
                        "Go online when you are ready for offers.",
                        "Accept a suitable offer before heading to pickup.",
                      ]
                  ).map((item, index) => (
                    <li key={item}>
                      <span className="rider-check-number" aria-hidden="true">
                        {index + 1}
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ol>
              </aside>
              <aside
                className="rider-dashboard-support"
                aria-labelledby="rider-support-heading"
              >
                <h2 id="rider-support-heading">Need rider support?</h2>
                <p>Contact the restaurant for pickup or delivery assistance.</p>
                {restaurantContact?.phone ? (
                  <a
                    className="ui-button ui-button--secondary"
                    href={`tel:${restaurantContact.phone}`}
                  >
                    <Phone size={16} aria-hidden="true" />
                    Contact restaurant
                  </a>
                ) : restaurantContact?.contact_email ? (
                  <a
                    className="ui-button ui-button--secondary"
                    href={`mailto:${restaurantContact.contact_email}`}
                  >
                    <Mail size={16} aria-hidden="true" />
                    Email restaurant
                  </a>
                ) : (
                  <p className="rider-support-unavailable">
                    Restaurant contact details have not been added yet.
                  </p>
                )}
              </aside>
            </div>
          </div>
          <aside
            className="rider-dashboard-links"
            aria-labelledby="rider-quick-links-heading"
          >
            <h2 id="rider-quick-links-heading">Quick links</h2>
            <div className="rider-shortcuts">
              <Link to="/rider/offers">
                <MapPin size={20} aria-hidden="true" />
                <div>
                  <strong>Delivery offers</strong>
                  <span>Review available pickups</span>
                </div>
                <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
              <Link to="/rider/history">
                <ClipboardList size={20} aria-hidden="true" />
                <div>
                  <strong>Delivery history</strong>
                  <span>{data.completed_today} delivered today</span>
                </div>
                <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
              <Link to="/settings">
                <Settings2 size={20} aria-hidden="true" />
                <div>
                  <strong>Rider settings</strong>
                  <span>Vehicle and contact details</span>
                </div>
                <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </aside>
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
        eyebrow="YOUR DELIVERY RECORD"
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
          <Skeleton label="Loading delivery history" />
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
            {result && (
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
