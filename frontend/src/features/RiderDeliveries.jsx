import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import {
  EmptyState,
  Feedback,
  Skeleton,
  PageHeader,
  Button,
} from "../components/ui";
import { usePrompt } from "../components/ConfirmProvider";
import "../components/riderDeliveryCards.css";
import "../components/deliveryWorkbench.css";
const terminal = ["delivered", "failed", "cancelled"];
const DELIVERY_QUEUE_PAGE_SIZE = 8;
const title = (value) => String(value || "").replaceAll("_", " ");
import { Link, useSearchParams } from "react-router-dom";
import {
  RefreshCw,
  Radio,
  TriangleAlert,
  CheckCircle2,
  Phone,
  Mail,
} from "lucide-react";
import {
  RiderDeliveryDetails,
  RiderDeliveryNavigation,
} from "../components/RiderDeliveryDetails";
import { RiderRoutePlanner } from "../components/RiderRoutePlanner";
import { orderedRouteDeliveries } from "../components/riderRoutePlanning";
import { DeliveryProofUpload } from "../components/DeliveryProof";
import { subscribeRiderLocation } from "../components/riderLocationSession";
import { useRiderPresence } from "../components/riderPresence";
import { usePollingResource } from "../components/usePollingResource";

export function RiderDeliveries() {
  const [params] = useSearchParams();
  const [selectedId, setSelectedId] = useState(
    Number(params.get("delivery")) || null,
  );
  const [mobileWorkspaceView, setMobileWorkspaceView] = useState("map");
  const [openDeliveryRequest, setOpenDeliveryRequest] = useState(0);
  const [deliveryQueuePage, setDeliveryQueuePage] = useState(0);
  const [pending, setPending] = useState({});
  const [actionFeedback, setActionFeedback] = useState({});
  const actionLocks = useRef(new Set());
  const orderDirty = useRef(false);
  const routeRevision = useRef(0);
  const routeSaveLock = useRef(false);
  const [dirtyOrder, setDirtyOrder] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [routeOrder, setRouteOrder] = useState([]);
  const ask = usePrompt();
  const presence = useRiderPresence();
  const [restaurantContact, setRestaurantContact] = useState(null);
  const [deliveries, setDeliveries] = useState([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [trackingId, setTrackingId] = useState(null),
    [geoError, setGeoError] = useState("");
  const sendAt = useRef(0);
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
    data: assignmentResult,
    error: refreshError,
    loading,
    refreshing,
    updatedAt,
    refresh: load,
  } = usePollingResource(
    ({ signal }) => api("/rider/assignments?scope=active", { signal }),
    { intervalMs: 12000, eventName: "rider-deliveries-updated" },
  );
  useEffect(() => {
    const r = assignmentResult;
    if (!r) return;
    if (!orderDirty.current && r.delivery_order)
      setRouteOrder(r.delivery_order);
    setSelectedId((current) => {
      const currentDelivery = (r.data || []).find(
        (delivery) => current != null && String(delivery.id) === String(current),
      );
      const nextDelivery = (r.data || []).find(
        (delivery) => String(delivery.id) === String(r.next_delivery_id),
      );
      return currentDelivery?.id ?? nextDelivery?.id ?? r.data?.[0]?.id ?? null;
    });
    setDeliveries(
      (r.data || []).filter((delivery) => !terminal.includes(delivery.status)),
    );
  }, [assignmentResult]);
  const tracked = deliveries.find((d) => d.id === trackingId);
  const queueDeliveries = orderedRouteDeliveries(deliveries, routeOrder);
  const deliveryQueuePageCount = Math.ceil(
    queueDeliveries.length / DELIVERY_QUEUE_PAGE_SIZE,
  );
  useEffect(() => {
    setDeliveryQueuePage((page) =>
      Math.min(page, Math.max(0, deliveryQueuePageCount - 1)),
    );
  }, [deliveryQueuePageCount]);
  const currentDeliveryQueuePage = Math.min(
    deliveryQueuePage,
    Math.max(0, deliveryQueuePageCount - 1),
  );
  const visibleQueueDeliveries = queueDeliveries.slice(
    currentDeliveryQueuePage * DELIVERY_QUEUE_PAGE_SIZE,
    (currentDeliveryQueuePage + 1) * DELIVERY_QUEUE_PAGE_SIZE,
  );
  const trackedStatus = tracked?.status;
  const sharingIds = JSON.stringify(
    deliveries
      .filter(
        (delivery) =>
          (delivery.id === trackingId ||
            (tracked?.batch_key && delivery.batch_key === tracked.batch_key)) &&
          ["picked_up", "in_transit"].includes(delivery.status),
      )
      .map((delivery) => delivery.id),
  );
  useEffect(() => {
    if (!trackingId) return;
    if (presence.state === "online") {
      setTrackingId(null);
      return;
    }
    if (!["picked_up", "in_transit"].includes(trackedStatus)) {
      setTrackingId(null);
      return;
    }
    if (!navigator.geolocation) {
      setGeoError("This browser does not support location sharing.");
      return;
    }
    let sending = false;
    let active = true;
    const controller = new AbortController();
    sendAt.current = 0;
    const unsubscribe = subscribeRiderLocation(
      navigator.geolocation,
      async (position) => {
        if (sending || Date.now() - sendAt.current < 9500) return;
        if (
          !Number.isFinite(position.coords.accuracy) ||
          position.coords.accuracy > 500
        ) {
          setGeoError(
            "Location accuracy is too low. Move to an open area and try again.",
          );
          return;
        }
        sending = true;
        sendAt.current = Date.now();
        const c = position.coords;
        try {
          for (const deliveryId of JSON.parse(sharingIds)) {
            if (!active) return;
            await api(`/rider/deliveries/${deliveryId}/locations`, {
              method: "POST",
              signal: controller.signal,
              body: JSON.stringify({
                latitude: c.latitude,
                longitude: c.longitude,
                accuracy_meters: c.accuracy,
                speed_mps: c.speed,
              }),
            });
          }
          if (active) setGeoError("");
        } catch (e) {
          if (active) setGeoError(`Location update not sent: ${e.message}`);
        } finally {
          sending = false;
        }
      },
      (e) =>
        setGeoError(
          e.code === 1
            ? "Location permission denied. Enable location access to share your delivery progress."
            : "GPS is unavailable. Check location services and try again.",
        ),
    );
    return () => {
      active = false;
      controller.abort();
      unsubscribe();
    };
  }, [trackingId, trackedStatus, sharingIds, presence.state]);
  async function act(d, path, body = {}) {
    if (actionLocks.current.has(d.id)) return;
    actionLocks.current.add(d.id);
    setPending((current) => ({ ...current, [d.id]: true }));
    setActionFeedback((current) => ({ ...current, [d.id]: null }));
    try {
      await api(path, {
        method: path.includes("/status") ? "PATCH" : "POST",
        body: JSON.stringify(body),
      });
      setActionFeedback((current) => ({
        ...current,
        [d.id]: {
          message: `${body.status ? title(body.status) : "Assignment updated"} · saved at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`,
        },
      }));
      if (terminal.includes(body.status))
        setNotice(`Delivery ${d.order.order_number}: ${title(body.status)}.`);
      window.dispatchEvent(new Event("rider-deliveries-updated"));
      if (terminal.includes(body.status)) setTrackingId(null);
      await load();
    } catch (e) {
      setActionFeedback((current) => ({
        ...current,
        [d.id]: { error: true, message: e.message },
      }));
      if (e.uncertain) await load();
    } finally {
      actionLocks.current.delete(d.id);
      setPending((current) => ({ ...current, [d.id]: false }));
    }
  }
  async function applyOrder() {
    if (routeSaveLock.current) return;
    routeSaveLock.current = true;
    const submittedRevision = routeRevision.current;
    setSavingOrder(true);
    setError("");
    try {
      const ids = orderedRouteDeliveries(deliveries, routeOrder).map(
        (d) => d.id,
      );
      await api("/rider/route-order", {
        method: "PUT",
        body: JSON.stringify({ delivery_ids: ids }),
      });
      if (submittedRevision === routeRevision.current) {
        orderDirty.current = false;
        setDirtyOrder(false);
      }
      setNotice(
        "Route order saved. Your dashboard now uses this order, with remaining pickups first.",
      );
      window.dispatchEvent(new Event("rider-deliveries-updated"));
    } catch (e) {
      setError(e.message);
    } finally {
      routeSaveLock.current = false;
      setSavingOrder(false);
    }
  }
  const selectedDeliveryPanel = (
    <div className="rider-delivery-list">
      {queueDeliveries.map((d, index) => {
        if (selectedId == null || String(d.id) !== String(selectedId)) return null;
        const o = d.order;
        const next =
          d.status === "accepted"
            ? "arrived_at_restaurant"
            : d.status === "arrived_at_restaurant"
              ? "picked_up"
              : d.status === "picked_up"
                ? "in_transit"
                : d.status === "in_transit"
                  ? "delivered"
                  : null;
        const canPick = next !== "picked_up" || o.status === "ready_to_serve";
        const waitingForKitchen = next === "picked_up" && !canPick;
        const progressAction =
          next &&
          !waitingForKitchen &&
          (next !== "delivered" || d.proof_uploaded) ? (
            <Button
              busy={!!pending[d.id]}
              disabled={!!pending[d.id] || !canPick}
              onClick={() =>
                act(d, `/rider/deliveries/${d.id}/status`, { status: next })
              }
            >
              {next === "delivered" && (
                <CheckCircle2 size={16} aria-hidden="true" />
              )}
              {next === "arrived_at_restaurant"
                ? "Arrived at restaurant"
                : next === "picked_up"
                  ? "Pick up order"
                  : next === "in_transit"
                    ? "Start delivery"
                    : "Mark delivered"}
            </Button>
          ) : null;
        const primaryAction =
          waitingForKitchen ? (
            <p className="rider-action-status" role="status">
              Waiting for the kitchen to mark this order ready
            </p>
          ) : d.status === "assigned" ? (
            <Button
              busy={!!pending[d.id]}
              disabled={!!pending[d.id]}
              onClick={() => act(d, `/rider/deliveries/${d.id}/accept`)}
            >
              Accept assignment
            </Button>
          ) : d.status !== "in_transit" ? (
            progressAction
          ) : null;
        return (
          <article
            className="rider-delivery-card"
            key={d.id}
            aria-busy={pending[d.id] || undefined}
          >
            {pending[d.id] && <p role="status">Saving delivery update…</p>}
            {actionFeedback[d.id] && (
              <Feedback
                tone={actionFeedback[d.id].error ? undefined : "success"}
              >
                {actionFeedback[d.id].message}
              </Feedback>
            )}
            <div className="rider-delivery-head">
              <div>
                <span
                  className="rider-card-sequence"
                  aria-label={`Delivery ${index + 1}`}
                >
                  {index + 1}
                </span>
                <strong className="rider-card-order-title">
                  Order {o.order_number}
                </strong>
                <span className={`delivery-state state-${d.status}`}>
                  {title(d.status)}
                </span>
              </div>
              <span
                className={`rider-card-priority-label ${["in_transit", "arrived_at_restaurant"].includes(d.status) ? "is-current" : "is-next"}`}
              >
                {d.status === "in_transit"
                  ? "Current stop · customer"
                  : d.status === "picked_up"
                    ? "Next stop · customer"
                    : d.status === "arrived_at_restaurant"
                      ? "Current stop · restaurant"
                      : d.status === "accepted"
                        ? "Next stop · restaurant"
                        : "Assignment awaiting acceptance"}
              </span>
            </div>
            <div className="rider-selected-route-progress">
              <div>
                <strong>Route position</strong>
                <span>Delivery {index + 1} of {deliveries.length} active</span>
              </div>
              <progress
                max={Math.max(deliveries.length, 1)}
                value={index + 1}
                aria-label={`Selected delivery ${index + 1} of ${deliveries.length} active deliveries`}
              />
            </div>
            {primaryAction && (
              <div className="rider-selected-primary-action">
                {primaryAction}
              </div>
            )}
            <div
              className={`rider-card-body${d.status === "in_transit" ? " has-proof" : ""}`}
            >
              {d.status === "in_transit" && (
                <aside
                  className="rider-card-completion"
                  aria-label="Complete delivery"
                >
                  <DeliveryProofUpload
                    deliveryId={d.id}
                    uploaded={d.proof_uploaded}
                    onUploaded={() =>
                      setDeliveries((current) =>
                        current.map((delivery) =>
                          delivery.id === d.id
                            ? { ...delivery, proof_uploaded: true }
                            : delivery,
                        ),
                      )
                    }
                  />
                  {progressAction}
                </aside>
              )}
              <RiderDeliveryDetails
                order={o}
                status={d.status}
                batchSequence={d.batch_key ? d.batch_sequence : null}
              />
            </div>
            <fieldset className="rider-actions" disabled={!!pending[d.id]}>
              <div
                className="rider-primary-actions"
                role="group"
                aria-label="Next step"
              >
                <RiderDeliveryNavigation order={o} status={d.status} />
              </div>
              <details className="rider-secondary-actions">
                <summary>More actions and details</summary>
                <div className="rider-secondary-actions-content">
                  {d.status === "assigned" && (
                    <Button
                      variant="secondary"
                      className="danger-button"
                      onClick={async () => {
                        const reason = await ask(
                          "Why are you rejecting this assignment?",
                        );
                        if (reason)
                          act(d, `/rider/deliveries/${d.id}/reject`, {
                            reason,
                          });
                      }}
                    >
                      Reject assignment
                    </Button>
                  )}
                  {["picked_up", "in_transit"].includes(d.status) &&
                    presence.state !== "online" && (
                      <Button
                        variant="secondary"
                        className={trackingId === d.id ? "tracking-on" : ""}
                        onClick={async () => {
                          setGeoError("");
                          setTrackingId(trackingId === d.id ? null : d.id);
                        }}
                      >
                        <Radio size={16} aria-hidden="true" />
                        {trackingId === d.id
                          ? "Stop location sharing"
                          : "Share delivery location"}
                      </Button>
                    )}
                  {["picked_up", "in_transit"].includes(d.status) &&
                    presence.state === "online" && (
                      <span className="rider-sharing-status">
                        <Radio size={16} aria-hidden="true" /> Customer tracking
                        uses your online GPS
                      </span>
                    )}
                  {restaurantContact?.phone ? (
                    <a
                      className="rider-page-link"
                      href={`tel:${restaurantContact.phone}`}
                    >
                      <Phone size={16} aria-hidden="true" /> Contact restaurant
                    </a>
                  ) : restaurantContact?.contact_email ? (
                    <a
                      className="rider-page-link"
                      href={`mailto:${restaurantContact.contact_email}`}
                    >
                      <Mail size={16} aria-hidden="true" /> Contact restaurant
                    </a>
                  ) : null}
                  {[
                    "accepted",
                    "arrived_at_restaurant",
                    "picked_up",
                    "in_transit",
                  ].includes(d.status) && (
                    <Button
                      variant="secondary"
                      className="danger-button"
                      onClick={async () => {
                        const reason = await ask(
                          "Mark delivery unsuccessful?",
                          "",
                          {
                            description: `This removes ${o.order_number} from your active deliveries and records the unsuccessful result for the restaurant. For a delay or address question, contact the restaurant instead. Only a manager can restore this delivery after checking the order and rider.`,
                            label: "Reason the delivery cannot be completed",
                            confirmLabel: "Mark unsuccessful",
                            destructive: true,
                            required: true,
                            minLength: 3,
                            maxLength: 1000,
                            multiline: true,
                          },
                        );
                        if (reason?.trim().length >= 3)
                          act(d, `/rider/deliveries/${d.id}/status`, {
                            status: "failed",
                            reason: reason.trim(),
                          });
                      }}
                    >
                      <TriangleAlert size={16} aria-hidden="true" />
                      Mark delivery unsuccessful
                    </Button>
                  )}
                  {!!d.history?.length && (
                    <details className="rider-card-activity">
                      <summary>Delivery activity</summary>
                      <small>
                        {d.history
                          ?.map(
                            (h) =>
                              `${title(h.to_status)} · ${new Date(h.created_at).toLocaleString()}`,
                          )
                          .join("  /  ")}
                      </small>
                    </details>
                  )}
                  <strong className="rider-secondary-total">
                    Order total ·{" "}
                    {new Intl.NumberFormat("en-PH", {
                      style: "currency",
                      currency: "PHP",
                    }).format(Number(o.total || 0))}
                  </strong>
                </div>
              </details>
            </fieldset>
          </article>
        );
      })}
      {!queueDeliveries.some(
        (delivery) => selectedId != null && String(delivery.id) === String(selectedId),
      ) && (
        <div className="rider-selected-delivery-empty" role="status">
          <strong>Choose an active delivery</strong>
          <p>Select a delivery above or from the queue to see its next action and stop details.</p>
        </div>
      )}
    </div>
  );
  return (
    <section
      className="welcome rider-workspace has-delivery-queue"
      data-mobile-view={mobileWorkspaceView}
    >
      <PageHeader
        title="My Deliveries"
        description="Your current pickups and drop-offs. Keep GPS online during a delivery."
        actions={
          <Button
            variant="secondary"
            onClick={() => load(true)}
            disabled={loading || refreshing}
            aria-busy={refreshing || undefined}
          >
            <RefreshCw
              className={refreshing ? "spin" : undefined}
              size={16}
              aria-hidden="true"
            />
            {refreshing ? "Refreshing assignments…" : "Refresh assignments"}
          </Button>
        }
      />
      {loading && deliveries.length === 0 && (
        <div
          className="rider-assignments-loading"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="rider-assignments-loading-status">
            <RefreshCw className="spin" size={18} aria-hidden="true" />
            <div>
              <strong>
                {refreshing ? "Refreshing assignments" : "Loading assignments"}
              </strong>
              <p>Checking for your latest pickups and drop-offs…</p>
            </div>
          </div>
          <div className="rider-assignments-loading-preview" aria-hidden="true">
            <div className="rider-assignments-map-skeleton">
              <span className="route-skeleton-road route-skeleton-road-one" />
              <span className="route-skeleton-road route-skeleton-road-two" />
              <span className="route-skeleton-road route-skeleton-road-three" />
              <span className="route-skeleton-path" />
              <i className="route-skeleton-pin route-skeleton-pin-one" />
              <i className="route-skeleton-pin route-skeleton-pin-two" />
            </div>
            <div className="rider-assignments-route-skeleton">
              <div className="route-skeleton-tabs"><i /><i /></div>
              <div className="route-skeleton-heading" />
              {[0, 1, 2].map((item) => (
                <div className="route-skeleton-stop" key={item}>
                  <i />
                  <span><b /><em /></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {!loading &&
        !refreshing &&
        !error &&
        !refreshError &&
        deliveries.length === 0 && (
          <div className="rider-deliveries-empty">
            <EmptyState
              title="Ready for your next delivery"
              description="New assignments will appear here. Go online to see nearby offers and choose your next pickup."
              action="Browse delivery offers"
              to="/rider/offers"
            />
          </div>
        )}
      {(error || refreshError) && (
        <Feedback onRetry={load}>{error || refreshError}</Feedback>
      )}
      {!loading && (updatedAt || refreshing || error || refreshError) && (
        <p className="rider-data-freshness" role="status">
          {refreshing
            ? "Refreshing assignments; your current deliveries remain available."
            : error || refreshError
              ? "Showing previously loaded assignments. Updates are unavailable."
              : updatedAt
                ? `Assignments updated at ${updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : ""}
        </p>
      )}
      {geoError && (
        <div className="error" role="alert">
          {geoError}
        </div>
      )}
      {notice && <Feedback tone="success">{notice}</Feedback>}
      {deliveries.length > 0 && (
        <>
          <nav className="rider-mobile-workspace-tabs" aria-label="Delivery workspace view">
            <Button
              variant="secondary"
              aria-pressed={mobileWorkspaceView === "map"}
              onClick={() => setMobileWorkspaceView("map")}
            >
              Route & map
            </Button>
            <Button
              variant="secondary"
              aria-pressed={mobileWorkspaceView === "queue"}
              onClick={() => setMobileWorkspaceView("queue")}
            >
              Queue <span>{deliveries.length}</span>
            </Button>
          </nav>
          <RiderRoutePlanner
            deliveries={deliveries}
            deliveryOrder={routeOrder}
            onOrderChange={(ids) => {
              if (routeSaveLock.current) return;
              routeRevision.current += 1;
              orderDirty.current = true;
              setDirtyOrder(true);
              setRouteOrder(ids);
            }}
            onApplyOrder={applyOrder}
            orderDirty={dirtyOrder}
            savingOrder={savingOrder}
            onSelectDelivery={setSelectedId}
            selectedDeliveryId={selectedId}
            openSelectedRequest={openDeliveryRequest}
            selectedDeliveryPanel={selectedDeliveryPanel}
          />
          <div className="rider-delivery-lower-grid">
            <section className="rider-delivery-queue" aria-labelledby="rider-queue-heading">
              <header>
                <div>
                  <h2 id="rider-queue-heading">Your delivery queue</h2>
                  <span>{deliveries.length} active</span>
                </div>
                <a href="#rider-route-heading">Route tools</a>
              </header>
              <div className="rider-delivery-queue-list">
                {visibleQueueDeliveries.map((delivery, index) => {
                  const statusLabel = title(delivery.status);
                  const nextStop = ["picked_up", "in_transit"].includes(delivery.status)
                    ? delivery.order.destination?.address
                    : delivery.order.pickup?.address;
                  return (
                    <button
                      className="rider-delivery-queue-row"
                      type="button"
                      key={delivery.id}
                      aria-pressed={selectedId != null && String(selectedId) === String(delivery.id)}
                      onClick={() => {
                        setSelectedId(delivery.id);
                        setOpenDeliveryRequest((request) => request + 1);
                        setMobileWorkspaceView("map");
                      }}
                    >
                      <span className="rider-queue-number">
                        {currentDeliveryQueuePage * DELIVERY_QUEUE_PAGE_SIZE + index + 1}
                      </span>
                      <span className="rider-queue-order">
                        <strong>{delivery.order.order_number}</strong>
                        <small>{nextStop || "Stop address not recorded"}</small>
                      </span>
                      <span className={`rider-route-stop-state state-${delivery.status}`}>{statusLabel}</span>
                      <span className="rider-queue-action">
                        {selectedId != null && String(selectedId) === String(delivery.id) ? "Viewing" : "View"}
                      </span>
                    </button>
                  );
                })}
              </div>
              {deliveryQueuePageCount > 1 && (
                <nav className="rider-delivery-queue-pagination" aria-label="Delivery queue pages">
                  <Button
                    variant="secondary"
                    onClick={() => setDeliveryQueuePage((page) => Math.max(0, page - 1))}
                    disabled={currentDeliveryQueuePage === 0}
                  >
                    Previous
                  </Button>
                  <span aria-live="polite">
                    Page {currentDeliveryQueuePage + 1} of {deliveryQueuePageCount}
                  </span>
                  <Button
                    variant="secondary"
                    onClick={() => setDeliveryQueuePage((page) => Math.min(deliveryQueuePageCount - 1, page + 1))}
                    disabled={currentDeliveryQueuePage >= deliveryQueuePageCount - 1}
                  >
                    Next
                  </Button>
                </nav>
              )}
              <p className="rider-queue-hint">Select a delivery to focus it on the map. Change stop order from Route order in the route panel.</p>
            </section>
            <aside className="rider-before-pickup" aria-labelledby="rider-before-pickup-heading">
              <header>
                <h2 id="rider-before-pickup-heading">Before pickup</h2>
                <span>{presence.state === "online" ? "Online" : "Offline"}</span>
              </header>
              <div className="rider-before-pickup-message">
                <Radio size={17} aria-hidden="true" />
                <p>{presence.state === "online" ? "You’re ready to receive nearby offers." : "Offers are paused. Go online to refresh your assignments before your next pickup."}</p>
              </div>
              <Link className="ui-button ui-button--primary" to="/rider/offers">
                {presence.state === "online" ? "View delivery offers" : "Go online"}
              </Link>
              <h3>Pickup checklist</h3>
              <ol>
                <li>Check the restaurant and order number.</li>
                <li>Wait for the kitchen to mark the order ready.</li>
                <li>Confirm pickup before starting the drop-off.</li>
              </ol>
            </aside>
          </div>
        </>
      )}
    </section>
  );
}
