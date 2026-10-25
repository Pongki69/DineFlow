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
const title = (value) => String(value || "").replaceAll("_", " ");
import { useSearchParams } from "react-router-dom";
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
    setSelectedId((current) =>
      (r.data || []).some((d) => d.id === current)
        ? current
        : r.next_delivery_id || r.data?.[0]?.id || null,
    );
    setDeliveries(
      (r.data || []).filter((delivery) => !terminal.includes(delivery.status)),
    );
  }, [assignmentResult]);
  const tracked = deliveries.find((d) => d.id === trackingId);
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
      {orderedRouteDeliveries(deliveries, routeOrder).map((d, index) => {
        if (d.id !== selectedId) return null;
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
        const progressAction = next && (
          <Button
            busy={!!pending[d.id]}
            disabled={
              !!pending[d.id] ||
              !canPick ||
              (next === "delivered" && !d.proof_uploaded)
            }
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
                ? canPick
                  ? "Pick up order"
                  : "Waiting for kitchen to mark order ready"
                : next === "in_transit"
                  ? "Start delivery"
                  : "Mark delivered"}
          </Button>
        );
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
              <strong className="rider-card-total">
                <small>Order total</small>
                {new Intl.NumberFormat("en-PH", {
                  style: "currency",
                  currency: "PHP",
                }).format(Number(o.total || 0))}
              </strong>
            </div>
            <div
              className={`rider-card-body${d.status === "in_transit" ? " has-proof" : ""}`}
            >
              <RiderDeliveryDetails
                order={o}
                status={d.status}
                batchSequence={d.batch_key ? d.batch_sequence : null}
              />
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
            </div>
            <fieldset className="rider-actions" disabled={!!pending[d.id]}>
              {d.status === "assigned" && (
                <>
                  <Button
                    onClick={async () =>
                      act(d, `/rider/deliveries/${d.id}/accept`)
                    }
                  >
                    Accept assignment
                  </Button>
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
                    Reject
                  </Button>
                </>
              )}
              {d.status !== "in_transit" && progressAction}
              <RiderDeliveryNavigation order={o} status={d.status} />
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
            </fieldset>
          </article>
        );
      })}
    </div>
  );
  return (
    <section className="welcome rider-workspace">
      <PageHeader
        eyebrow="RIDER WORKSPACE"
        title="My deliveries"
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
      {loading && (
        <div
          className="rider-assignments-loading"
          role="status"
          aria-live="polite"
        >
          <RefreshCw className="spin" size={26} aria-hidden="true" />
          <strong>
            {refreshing ? "Refreshing assignments" : "Loading assignments"}
          </strong>
          <p>Checking for your latest pickups and drop-offs…</p>
          <div className="rider-assignments-loading-bar" aria-hidden="true" />
        </div>
      )}
      {!loading &&
        !refreshing &&
        !error &&
        !refreshError &&
        deliveries.length === 0 && (
          <EmptyState
            title="Ready for your next delivery"
            description="Your assigned deliveries will appear here."
          />
        )}
      {(error || refreshError) && (
        <Feedback onRetry={load}>{error || refreshError}</Feedback>
      )}
      {!loading && (
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
        selectedDeliveryPanel={deliveries.length ? selectedDeliveryPanel : null}
      />
    </section>
  );
}
