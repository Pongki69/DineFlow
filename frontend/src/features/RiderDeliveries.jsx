import { playSound } from "../uiSound";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useRestaurantLocation } from "../components/useRestaurantLocation";
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
import "../components/riderMobileMap.css";
const terminal = ["delivered", "failed", "cancelled"];
const DELIVERY_QUEUE_PAGE_SIZE = 8;
const title = (value) => String(value || "").replaceAll("_", " ");
import { Link, useSearchParams } from "react-router-dom";
import {
  RefreshCw,
  Radio,
  TriangleAlert,
  CircleX,
  ChevronRight,
  Phone,
  Mail,
  Store,
  Navigation,
  Inbox,
  Clock3,
} from "lucide-react";
import { hasOutletCoordinates } from "./outletConfiguration";
import "./riderCurrentOutlet.css";
import {
  RiderDeliveryDetails,
  RiderDeliveryNavigation,
} from "../components/RiderDeliveryDetails";
import { RiderRoutePlanner } from "../components/RiderRoutePlanner";
import { useMediaQuery } from "../components/useMediaQuery";
import {
  nearestDeliveryOrder,
  orderedRouteDeliveries,
  respectsBatchOrder,
} from "../components/riderRoutePlanning";
import { DeliveryProofUpload } from "../components/DeliveryProof";
import { subscribeRiderLocation } from "../components/riderLocationSession";
import { useRiderPresence } from "../components/riderPresence";
import { usePollingResource } from "../components/usePollingResource";
import { SwipeToConfirm } from "../components/SwipeToConfirm";
import { RiderStopsList } from "../components/RiderStopsList";
import { RiderScreenSkeleton } from "../components/RiderScreenSkeleton";
import {
  DeliveryStatusPill,
  deliveryStatusLabel,
} from "../components/OrderStatusPill";
import { locationDeniedMessage } from "../components/locationAccess";

export function RiderDeliveries() {
  const [params] = useSearchParams();
  const [selectedId, setSelectedId] = useState(
    Number(params.get("delivery")) || null,
  );
  const [mobileWorkspaceView, setMobileWorkspaceView] = useState("map");
  // Phones open on the Delivery panel once there is work, so the next action
  // is on the first screen; after the rider picks a panel, theirs sticks.
  const viewChosen = useRef(false);
  const chooseMobileView = (view) => {
    viewChosen.current = true;
    setMobileWorkspaceView(view);
  };
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
  const phone = useMediaQuery("(max-width: 850px)");
  const outletResource = useRestaurantLocation();
  const restaurantContact = outletResource.location;
  const [deliveries, setDeliveries] = useState([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [trackingId, setTrackingId] = useState(null),
    [geoError, setGeoError] = useState("");
  const sendAt = useRef(0);

  const {
    data: assignmentResult,
    error: refreshError,
    loading,
    refreshing,
    updatedAt,
    refresh: load,
  } = usePollingResource(
    ({ signal }) => api("/rider/assignments?scope=active", { signal }),
    { eventName: "rider-deliveries-updated", topics: ["deliveries", "orders"] },
  );
  useEffect(() => {
    const r = assignmentResult;
    if (!r) return;
    if (!orderDirty.current && r.delivery_order)
      setRouteOrder(r.delivery_order);
    setSelectedId((current) => {
      const currentDelivery = (r.data || []).find(
        (delivery) =>
          current != null && String(delivery.id) === String(current),
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
  const hasDeliveries = deliveries.length > 0;
  useEffect(() => {
    if (hasDeliveries && !viewChosen.current)
      setMobileWorkspaceView((view) => (view === "map" ? "delivery" : view));
  }, [hasDeliveries]);
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
            ? locationDeniedMessage(
                "Location permission denied. Enable location access to share your delivery progress.",
              )
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
      playSound(
        body.status === "delivered"
          ? "success"
          : ["failed", "cancelled"].includes(body.status)
            ? "remove"
            : "tap",
      );
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
  function changeOrder(ids) {
    if (routeSaveLock.current) return;
    routeRevision.current += 1;
    orderDirty.current = true;
    setDirtyOrder(true);
    setRouteOrder(ids);
  }
  function resetOrder() {
    orderDirty.current = false;
    setDirtyOrder(false);
    setRouteOrder(assignmentResult?.delivery_order || []);
  }
  // Move one stop to a new position, keeping paired deliveries in sequence.
  function moveStop(id, toIndex) {
    const ids = queueDeliveries.map((delivery) => delivery.id);
    const from = ids.indexOf(id);
    const target = Math.max(0, Math.min(ids.length - 1, toIndex));
    if (from < 0 || from === target) return;
    ids.splice(target, 0, ...ids.splice(from, 1));
    const next = ids.map((value) =>
      queueDeliveries.find((delivery) => delivery.id === value),
    );
    if (respectsBatchOrder(next)) changeOrder(ids);
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
  const outletCard = hasOutletCoordinates(restaurantContact) && (
    <aside
      className="rider-current-outlet"
      aria-label="Current restaurant outlet"
    >
      <Store size={22} aria-hidden="true" />
      <div>
        <span>Current restaurant outlet</span>
        <strong>{restaurantContact.name || "Restaurant"}</strong>
        <p>{restaurantContact.address}</p>
      </div>
      <a
        href={`https://www.google.com/maps/dir/?api=1&destination=${Number(restaurantContact.latitude)},${Number(restaurantContact.longitude)}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Navigation size={16} aria-hidden="true" />
        Directions
      </a>
    </aside>
  );
  // Live refreshes happen quietly; only a failed refresh is worth a line.
  const freshness = updatedAt
    ? `Showing assignments from ${updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Updates are unavailable.`
    : "Showing previously loaded assignments. Updates are unavailable.";
  // One stop list, shown on the page and in the fullscreen Stops panel.
  const stopsListProps = {
    selectedId,
    saving: savingOrder,
    dirty: dirtyOrder,
    onMove: moveStop,
    onApply: applyOrder,
    onReset: resetOrder,
    onSuggest: () =>
      changeOrder(
        nearestDeliveryOrder(
          queueDeliveries,
          queueDeliveries[0]?.order.pickup || null,
        ).map((delivery) => delivery.id),
      ),
    onOpen: (delivery) => {
      setSelectedId(delivery.id);
      setOpenDeliveryRequest((request) => request + 1);
      chooseMobileView("delivery");
      const control = document.querySelector(
        '.rider-map-dock button[data-view="delivery"]',
      );
      if (control?.getClientRects().length)
        control.focus({ preventScroll: true });
    },
  };
  const selectedDeliveryPanel = (
    <div className="rider-delivery-list">
      {queueDeliveries.map((d, index) => {
        if (selectedId == null || String(d.id) !== String(selectedId))
          return null;
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
        const advance = () =>
          act(d, `/rider/deliveries/${d.id}/status`, { status: next });
        // Pickup and drop-off hand over food, so on touch screens they need
        // a deliberate swipe rather than a tap.
        const progressAction =
          next &&
          !waitingForKitchen &&
          (next !== "delivered" || d.proof_uploaded) ? (
            ["picked_up", "delivered"].includes(next) ? (
              <SwipeToConfirm
                busy={!!pending[d.id]}
                disabled={!!pending[d.id] || !canPick}
                onConfirm={advance}
              >
                {next === "picked_up" ? "Pick up order" : "Mark delivered"}
              </SwipeToConfirm>
            ) : (
              <Button
                busy={!!pending[d.id]}
                disabled={!!pending[d.id] || !canPick}
                onClick={advance}
              >
                {next === "arrived_at_restaurant"
                  ? "Arrived at restaurant"
                  : "Start delivery"}
              </Button>
            )
          ) : null;
        const primaryAction = waitingForKitchen ? (
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
        ) : d.status === "in_transit" && !d.proof_uploaded ? (
          <p className="rider-action-status" role="status">
            Upload a delivery photo to finish this drop-off
          </p>
        ) : (
          progressAction
        );
        const actionError = actionFeedback[d.id]?.error
          ? actionFeedback[d.id].message
          : null;
        return (
          <article
            className="rider-delivery-card"
            key={d.id}
            aria-busy={pending[d.id] || undefined}
          >
            {pending[d.id] && <p role="status">Saving delivery update…</p>}
            {actionFeedback[d.id] && !actionError && (
              <Feedback tone="success">{actionFeedback[d.id].message}</Feedback>
            )}
            <div className="rider-delivery-head">
              <span
                className="rider-card-sequence"
                aria-label={`Delivery ${index + 1}`}
              >
                {index + 1}
              </span>
              <div className="rider-delivery-head-copy">
                <strong className="rider-card-order-title">
                  Order {o.order_number}
                </strong>
                <div className="rider-delivery-head-meta">
                  <DeliveryStatusPill
                    key={d.status}
                    status={d.status}
                    className={`delivery-state state-${d.status}`}
                  />
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
                            : "Awaiting acceptance"}
                  </span>
                </div>
              </div>
            </div>
            <div
              className="rider-primary-actions rider-quick-actions"
              role="group"
              aria-label="Next step"
            >
              <RiderDeliveryNavigation order={o} status={d.status} />
              {(() => {
                const onRoad = ["picked_up", "in_transit"].includes(d.status);
                const phone = onRoad
                  ? o.destination?.phone
                  : o.pickup?.phone || restaurantContact?.phone;
                return phone ? (
                  <a className="rider-quick-action" href={`tel:${phone}`}>
                    <Phone size={18} aria-hidden="true" />
                    {onRoad ? "Call customer" : "Call restaurant"}
                  </a>
                ) : null;
              })()}
              {["picked_up", "in_transit"].includes(d.status) &&
                (presence.state === "online" ? (
                  <span
                    className="rider-quick-action is-on"
                    title="Customer tracking uses your online GPS"
                  >
                    <Radio size={18} aria-hidden="true" />
                    Tracking on
                  </span>
                ) : (
                  <button
                    type="button"
                    className={`rider-quick-action${trackingId === d.id ? " is-on" : ""}`}
                    aria-pressed={trackingId === d.id}
                    onClick={() => {
                      setGeoError("");
                      setTrackingId(trackingId === d.id ? null : d.id);
                    }}
                  >
                    <Radio size={18} aria-hidden="true" />
                    {trackingId === d.id ? "Tracking on" : "Share tracking"}
                  </button>
                ))}
            </div>
            <div className="rider-selected-route-progress">
              <div>
                <strong>Route position</strong>
                <span>
                  Delivery {index + 1} of {deliveries.length} active
                </span>
              </div>
              <progress
                max={Math.max(deliveries.length, 1)}
                value={index + 1}
                aria-label={`Selected delivery ${index + 1} of ${deliveries.length} active deliveries`}
              />
            </div>
            {(primaryAction || actionError) && (
              <div className="rider-selected-primary-action df-bottom-bar">
                {/* Names the order the action belongs to, for when the bar
                    covers the card header on a phone. */}
                <p className="rider-bar-context" aria-hidden="true">
                  Order {o.order_number}
                  {deliveryStatusLabel(d.status)
                    ? ` · ${deliveryStatusLabel(d.status)}`
                    : ""}
                </p>
                {actionError && (
                  <div className="df-alert df-alert--context" role="alert">
                    <TriangleAlert size={16} aria-hidden="true" />
                    {actionError}
                  </div>
                )}
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
                </aside>
              )}
              <RiderDeliveryDetails
                order={o}
                status={d.status}
                batchSequence={d.batch_key ? d.batch_sequence : null}
              />
            </div>
            {!!d.history?.length && (
              <section
                className="rider-card-section rider-card-timeline"
                aria-label="Delivery activity"
              >
                <h3 className="rider-card-section-title">Activity</h3>
                <ol>
                  {d.history.map((h, step) => (
                    <li key={h.id || step}>
                      <span>{title(h.to_status)}</span>
                      <time dateTime={h.created_at}>
                        {new Date(h.created_at).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </time>
                    </li>
                  ))}
                </ol>
              </section>
            )}
            <fieldset className="rider-actions" disabled={!!pending[d.id]}>
              <details className="rider-secondary-actions">
                <summary>More actions and details</summary>
                <div className="rider-secondary-actions-content">
                  <p className="rider-more-total">
                    <span>Order total</span>
                    <strong>
                      {new Intl.NumberFormat("en-PH", {
                        style: "currency",
                        currency: "PHP",
                      }).format(Number(o.total || 0))}
                    </strong>
                  </p>
                  {(restaurantContact?.phone ||
                    restaurantContact?.contact_email) && (
                    <a
                      className="rider-more-row"
                      href={
                        restaurantContact.phone
                          ? `tel:${restaurantContact.phone}`
                          : `mailto:${restaurantContact.contact_email}`
                      }
                      aria-labelledby={`rider-more-contact-title-${d.id}`}
                      aria-describedby={`rider-more-contact-${d.id}`}
                    >
                      <span className="rider-more-icon" aria-hidden="true">
                        {restaurantContact.phone ? (
                          <Phone size={18} />
                        ) : (
                          <Mail size={18} />
                        )}
                      </span>
                      <span className="rider-more-text">
                        <b id={`rider-more-contact-title-${d.id}`}>
                          Contact restaurant
                        </b>
                        <small id={`rider-more-contact-${d.id}`}>
                          {restaurantContact.phone ||
                            restaurantContact.contact_email}{" "}
                          · delays or address
                        </small>
                      </span>
                      <ChevronRight
                        className="rider-more-chevron"
                        size={18}
                        aria-hidden="true"
                      />
                    </a>
                  )}
                  {d.status === "assigned" && (
                    <button
                      type="button"
                      className="rider-more-row is-danger"
                      aria-labelledby={`rider-more-reject-title-${d.id}`}
                      aria-describedby={`rider-more-reject-${d.id}`}
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
                      <span className="rider-more-icon" aria-hidden="true">
                        <CircleX size={18} />
                      </span>
                      <span className="rider-more-text">
                        <b id={`rider-more-reject-title-${d.id}`}>
                          Reject assignment
                        </b>
                        <small id={`rider-more-reject-${d.id}`}>
                          Send it back so another rider can take it
                        </small>
                      </span>
                      <ChevronRight
                        className="rider-more-chevron"
                        size={18}
                        aria-hidden="true"
                      />
                    </button>
                  )}
                  {[
                    "accepted",
                    "arrived_at_restaurant",
                    "picked_up",
                    "in_transit",
                  ].includes(d.status) && (
                    <button
                      type="button"
                      className="rider-more-row is-danger"
                      aria-labelledby={`rider-more-failed-title-${d.id}`}
                      aria-describedby={`rider-more-failed-${d.id}`}
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
                      <span className="rider-more-icon" aria-hidden="true">
                        <TriangleAlert size={18} />
                      </span>
                      <span className="rider-more-text">
                        <b id={`rider-more-failed-title-${d.id}`}>
                          Mark delivery unsuccessful
                        </b>
                        <small id={`rider-more-failed-${d.id}`}>
                          If the drop-off can&apos;t be completed
                        </small>
                      </span>
                      <ChevronRight
                        className="rider-more-chevron"
                        size={18}
                        aria-hidden="true"
                      />
                    </button>
                  )}
                </div>
              </details>
            </fieldset>
          </article>
        );
      })}
      {!queueDeliveries.some(
        (delivery) =>
          selectedId != null && String(delivery.id) === String(selectedId),
      ) && (
        <div className="rider-selected-delivery-empty" role="status">
          <strong>Choose an active delivery</strong>
          <p>
            Select a stop on the map or in Stops to see its next action and stop
            details.
          </p>
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
          <>
            <span className="rider-mobile-assignment-count">
              {loading
                ? "Checking deliveries…"
                : `${deliveries.length} active ${deliveries.length === 1 ? "delivery" : "deliveries"}`}
            </span>
            <Button
              variant="secondary"
              onClick={() => load(true)}
              aria-label={
                refreshing ? "Refreshing assignments…" : "Refresh assignments"
              }
              disabled={loading || refreshing}
              aria-busy={refreshing || undefined}
            >
              <RefreshCw
                className={refreshing ? "spin" : undefined}
                size={16}
                aria-hidden="true"
              />
              <span className="rider-refresh-label">
                {refreshing ? "Refreshing assignments…" : "Refresh assignments"}
              </span>
            </Button>
          </>
        }
      />
      {phone && outletCard}
      {outletResource.error && (
        <Feedback onRetry={outletResource.refresh}>
          Restaurant details could not refresh.{" "}
          {restaurantContact
            ? "Your last loaded outlet is still shown."
            : "Try again to load the saved outlet."}
        </Feedback>
      )}
      {loading && deliveries.length === 0 && (
        <RiderScreenSkeleton
          variant="deliveries"
          label={refreshing ? "Refreshing assignments" : "Loading assignments"}
        />
      )}
      {/* Background refreshes keep the card; it goes only when work arrives. */}
      {!loading &&
        !error &&
        !refreshError &&
        deliveries.length === 0 &&
        (phone ? (
          // Phones: one slim row, so the map below has the screen.
          <div className="rider-deliveries-empty-row" role="status">
            <span aria-hidden="true">
              <Inbox size={18} />
            </span>
            <p>
              <strong>No deliveries yet</strong>
              <small>
                {presence.state === "online"
                  ? "New assignments will appear here."
                  : "Go online to get offers."}
              </small>
            </p>
            <Link to="/rider/offers">Browse offers</Link>
          </div>
        ) : (
          <div className="rider-deliveries-empty">
            <EmptyState
              title="Ready for your next delivery"
              description="New assignments will appear here. Go online to see nearby offers and choose your next pickup."
              action="Browse delivery offers"
              to="/rider/offers"
            />
          </div>
        ))}
      {(error || refreshError) && (
        <Feedback onRetry={load}>{error || refreshError}</Feedback>
      )}
      {!loading && (error || refreshError) && (
        <p className="rider-data-freshness" role="status">
          {freshness}
        </p>
      )}
      {geoError && (
        <div className="error" role="alert">
          {geoError}
        </div>
      )}
      {notice && <Feedback tone="success">{notice}</Feedback>}
      {!loading &&
        deliveries.length === 0 &&
        hasOutletCoordinates(restaurantContact) && (
          <RiderRoutePlanner
            deliveries={[]}
            online={presence.state === "online"}
            restaurantLocation={restaurantContact}
            mobileView={mobileWorkspaceView}
            onMobileViewChange={chooseMobileView}
          />
        )}
      {!phone && deliveries.length === 0 && outletCard}
      {deliveries.length > 0 && (
        <>
          <RiderRoutePlanner
            deliveries={deliveries}
            restaurantLocation={restaurantContact}
            deliveryOrder={routeOrder}
            onOrderChange={changeOrder}
            onApplyOrder={applyOrder}
            orderDirty={dirtyOrder}
            savingOrder={savingOrder}
            onSelectDelivery={setSelectedId}
            selectedDeliveryId={selectedId}
            openSelectedRequest={openDeliveryRequest}
            selectedDeliveryPanel={selectedDeliveryPanel}
            fullscreenStops={
              <RiderStopsList
                deliveries={queueDeliveries}
                headingId="rider-fullscreen-queue-heading"
                {...stopsListProps}
              />
            }
            mobileView={mobileWorkspaceView}
            onMobileViewChange={chooseMobileView}
          />
          <div className="rider-delivery-lower-grid">
            <RiderStopsList
              deliveries={visibleQueueDeliveries}
              offset={currentDeliveryQueuePage * DELIVERY_QUEUE_PAGE_SIZE}
              headingId="rider-queue-heading"
              headerExtras={
                <a
                  className="rider-desktop-route-link"
                  href="#rider-route-heading"
                >
                  Route tools
                </a>
              }
              pagination={
                deliveryQueuePageCount > 1 && (
                  <nav
                    className="rider-delivery-queue-pagination"
                    aria-label="Delivery queue pages"
                  >
                    <Button
                      variant="secondary"
                      onClick={() =>
                        setDeliveryQueuePage((page) => Math.max(0, page - 1))
                      }
                      disabled={currentDeliveryQueuePage === 0}
                    >
                      Previous
                    </Button>
                    <span aria-live="polite">
                      Page {currentDeliveryQueuePage + 1} of{" "}
                      {deliveryQueuePageCount}
                    </span>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        setDeliveryQueuePage((page) =>
                          Math.min(deliveryQueuePageCount - 1, page + 1),
                        )
                      }
                      disabled={
                        currentDeliveryQueuePage >= deliveryQueuePageCount - 1
                      }
                    >
                      Next
                    </Button>
                  </nav>
                )
              }
              {...stopsListProps}
            />
            {phone ? (
              <BeforePickup online={presence.state === "online"} />
            ) : (
              <div className="rider-delivery-support">
                <BeforePickup online={presence.state === "online"} />
                {outletCard}
              </div>
            )}
          </div>
        </>
      )}
      {phone && (
        <Link className="rider-past-link" to="/rider/history">
          <span aria-hidden="true">
            <Clock3 size={17} />
          </span>
          <strong>Past deliveries</strong>
          <ChevronRight size={17} aria-hidden="true" />
        </Link>
      )}
    </section>
  );
}

function BeforePickup({ online, headingId = "rider-before-pickup-heading" }) {
  return (
    <aside className="rider-before-pickup" aria-labelledby={headingId}>
      <header>
        <h2 id={headingId}>Before pickup</h2>
        <span>{online ? "Online" : "Offline"}</span>
      </header>
      <div className="rider-before-pickup-message">
        <Radio size={17} aria-hidden="true" />
        <p>
          {online
            ? "You’re ready to receive nearby offers."
            : "Offers are paused. Go online to refresh your assignments before your next pickup."}
        </p>
      </div>
      <Link className="ui-button ui-button--primary" to="/rider/offers">
        {online ? "View delivery offers" : "Go online"}
      </Link>
      <h3>Pickup checklist</h3>
      <ol>
        <li>Check the restaurant and order number.</li>
        <li>Wait for the kitchen to mark the order ready.</li>
        <li>Confirm pickup before starting the drop-off.</li>
      </ol>
    </aside>
  );
}
