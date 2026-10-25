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
import { dispatchQueue, dispatchQueues } from "../components/dispatchQueues";
import { usePollingResource } from "../components/usePollingResource";

export function DispatchDashboard() {
  const [queue, setQueue] = useState("attention");
  const [query, setQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState({});
  const [feedback, setFeedback] = useState({});
  const locks = useRef(new Set());
  const ask = usePrompt();
  const [deliveries, setDeliveries] = useState([]),
    [riders, setRiders] = useState([]),
    [selection, setSelection] = useState({}),
    [notice, setNotice] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(query.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);
  const requestPath = `/admin/deliveries?${new URLSearchParams({ queue, q: searchTerm, page: String(page), per_page: "20" })}`;
  const {
    data: result,
    error: refreshError,
    loading,
    refreshing,
    updatedAt,
    refresh: load,
  } = usePollingResource(({ signal }) => api(requestPath, { signal }), {
    intervalMs: 15000,
    resourceKey: requestPath,
  });
  useEffect(() => {
    if (!result) {
      setDeliveries([]);
      return;
    }
    const r = result;
    setDeliveries((current) => {
      const fresh = new Map((r.data || []).map((d) => [d.id, d]));
      return [
        ...current.filter((d) => fresh.has(d.id)).map((d) => fresh.get(d.id)),
        ...(r.data || []).filter(
          (d) => !current.some((old) => old.id === d.id),
        ),
      ];
    });
    setRiders(r.riders || []);
    if (r.meta?.last_page && page > r.meta.last_page) setPage(r.meta.last_page);
  }, [result, page]);
  async function perform(d, task) {
    if (locks.current.has(d.id)) return;
    locks.current.add(d.id);
    setPending((p) => ({ ...p, [d.id]: true }));
    setFeedback((p) => ({ ...p, [d.id]: null }));
    try {
      await task();
      setFeedback((p) => ({ ...p, [d.id]: { message: "Update saved." } }));
      await load();
    } catch (e) {
      setFeedback((p) => ({
        ...p,
        [d.id]: { error: true, message: e.message },
      }));
      if (e.uncertain) await load();
    } finally {
      locks.current.delete(d.id);
      setPending((p) => ({ ...p, [d.id]: false }));
    }
  }
  async function assign(d) {
    let reason;
    if (d.rider_user_id) {
      reason = await ask(
        `Reassign ${d.order.order_number}? Enter the reason for changing its rider:`,
      );
      if (!reason) return;
    }
    return perform(d, async () => {
      await api(`/admin/deliveries/${d.id}/assign`, {
        method: "POST",
        body: JSON.stringify({ rider_id: Number(selection[d.id]), reason }),
      });
      setNotice(`Rider assigned to ${d.order.order_number}.`);
    });
  }
  async function cancel(d) {
    const reason = await ask("Reason for cancelling this delivery:");
    if (!reason) return;
    return perform(d, async () => {
      await api(`/admin/deliveries/${d.id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
    });
  }
  async function retry(d) {
    return perform(d, async () => {
      await api(`/admin/deliveries/${d.id}/retry-dispatch`, { method: "POST" });
    });
  }
  async function recover(d) {
    const reason = await ask(`Restore ${d.order.order_number}?`, "", {
      description: `Restore this delivery to ${title(d.recovery_status)} with ${d.rider?.name || "its original rider"}. This keeps the previous failure in its activity history. Confirm the restaurant and rider agree the order can continue.`,
      label: "Reason for restoring this delivery",
      confirmLabel: "Restore delivery",
      confirmationLabel:
        "I checked the order and confirm it is still with the same rider, or is still awaiting their pickup.",
      required: true,
      minLength: 3,
      maxLength: 1000,
      multiline: true,
    });
    if (!reason?.trim() || reason.trim().length < 3) return;
    return perform(d, () =>
      api(`/admin/deliveries/${d.id}/recover`, {
        method: "POST",
        body: JSON.stringify({
          reason: reason.trim(),
          custody_confirmed: true,
        }),
      }),
    );
  }
  return (
    <section className="welcome dispatch-dashboard">
      <PageHeader
        eyebrow="DELIVERY OPERATIONS"
        title="Dispatch and tracking"
        description="Resolve exceptions, assign riders and monitor active deliveries."
        actions={
          <Button variant="secondary" busy={refreshing} onClick={() => load()}>
            {refreshing ? "Refreshing deliveries…" : "Refresh deliveries"}
          </Button>
        }
      />
      <nav className="dispatch-queues" aria-label="Dispatch queues">
        {dispatchQueues.map(([key, label]) => (
          <Button
            key={key}
            variant="secondary"
            aria-pressed={queue === key}
            onClick={() => {
              setQueue(key);
              setPage(1);
            }}
          >
            {label}
            <strong>
              {result?.counts?.[key] ??
                deliveries.filter((d) => dispatchQueue(d) === key).length}
            </strong>
          </Button>
        ))}
      </nav>
      <label className="dispatch-search">
        Search orders, riders or addresses
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Order number, rider or destination"
        />
      </label>
      {updatedAt && (
        <p className="rider-data-freshness">
          {refreshError
            ? "Updates unavailable. Showing previously loaded records."
            : `Updated at ${updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}{" "}
          · {result?.meta?.total ?? deliveries.length} matching deliveries
        </p>
      )}
      {loading && <Skeleton label="Loading your content" />}
      {!loading && !refreshError && deliveries.length === 0 && (
        <EmptyState
          title={searchTerm ? "No matching deliveries" : "This queue is clear"}
          description={
            searchTerm
              ? "Try a different order, rider or address."
              : "Choose another queue to review the rest of your delivery work."
          }
        />
      )}
      {refreshError && <Feedback onRetry={load}>{refreshError}</Feedback>}
      {notice && <Feedback tone="success">{notice}</Feedback>}
      <div className="rider-delivery-list">
        {deliveries
          .filter(
            (d) =>
              result?.meta ||
              (dispatchQueue(d) === queue &&
                `${d.order.order_number} ${d.rider?.name || ""} ${d.order.delivery_address || ""}`
                  .toLowerCase()
                  .includes(query.toLowerCase())),
          )
          .map((d) => (
            <article className="rider-delivery-card" key={d.id}>
              {pending[d.id] && <p role="status">Saving dispatch update…</p>}
              {feedback[d.id] && (
                <Feedback tone={feedback[d.id].error ? undefined : "success"}>
                  {feedback[d.id].message}
                </Feedback>
              )}
              <div className="rider-delivery-head">
                <div>
                  <strong>{d.order.order_number}</strong>
                  <span className={`delivery-state state-${d.status}`}>
                    {title(d.status)}
                  </span>
                </div>
                <span>{d.rider?.name || "Unassigned"}</span>
              </div>
              <p>{d.order.delivery_address}</p>
              <p>
                ₱{d.order.total} · {d.order.delivery_distance_km || "—"} km ·
                ETA{" "}
                {d.estimated_arrival_at
                  ? new Date(d.estimated_arrival_at).toLocaleTimeString()
                  : "not available"}
              </p>
              <details className="dispatch-search-details">
                <summary>Automatic search details</summary>
                <p>
                  Automatic search: {title(d.dispatch_status)} · radius stage{" "}
                  {Number(d.dispatch_stage || 0) + 1}
                  {d.next_dispatch_at
                    ? ` · next check ${new Date(d.next_dispatch_at).toLocaleTimeString()}`
                    : ""}
                </p>
              </details>
              {d.dispatch_status === "exhausted" && (
                <Feedback tone="warning">
                  No rider accepted within the search limits. Assign manually or
                  restart the automatic search.{" "}
                  <button
                    type="button"
                    disabled={pending[d.id]}
                    onClick={() => retry(d)}
                  >
                    Restart automatic search
                  </button>
                </Feedback>
              )}
              {d.batch_key && (
                <p>Paired delivery · drop-off {d.batch_sequence} of 2</p>
              )}
              {d.status === "failed" && (
                <div className="dispatch-recovery">
                  {d.can_recover ? (
                    <>
                      <p>
                        The previous attempt was unsuccessful. Verify the order
                        and rider before restoring it.
                      </p>
                      <Button
                        variant="secondary"
                        disabled={!!pending[d.id]}
                        onClick={() => recover(d)}
                      >
                        Review and restore delivery
                      </Button>
                    </>
                  ) : (
                    <p>
                      {d.recovery_blocked_reason ||
                        "This delivery needs manager review before another attempt. Contact the rider and restaurant to resolve the order."}
                    </p>
                  )}
                </div>
              )}
              {d.location_updates?.[0] && (
                <p>
                  Last rider GPS: {d.location_updates[0].latitude},{" "}
                  {d.location_updates[0].longitude} ·{" "}
                  {new Date(
                    d.location_updates[0].recorded_at,
                  ).toLocaleTimeString()}
                </p>
              )}
              {!terminal.includes(d.status) &&
                !["picked_up", "in_transit"].includes(d.status) && (
                  <fieldset
                    className="dispatch-assign"
                    disabled={!!pending[d.id]}
                  >
                    <select
                      aria-label={`Assign rider for ${d.order.order_number}`}
                      value={selection[d.id] || d.rider_user_id || ""}
                      onChange={(e) =>
                        setSelection((s) => ({ ...s, [d.id]: e.target.value }))
                      }
                    >
                      <option value="">Select available rider</option>
                      {riders.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} · {r.vehicle_type || "vehicle not set"}
                        </option>
                      ))}
                    </select>
                    <button
                      disabled={
                        !selection[d.id] ||
                        Number(selection[d.id]) === Number(d.rider_user_id)
                      }
                      onClick={async () => assign(d)}
                    >
                      {d.rider_user_id ? "Reassign" : "Assign rider"}
                    </button>
                    <button
                      className="danger-button"
                      onClick={async () => cancel(d)}
                    >
                      Cancel delivery
                    </button>
                  </fieldset>
                )}
              <small>
                {d.status_history
                  ?.map(
                    (h) =>
                      `${title(h.to_status)} · ${new Date(h.created_at).toLocaleString()}`,
                  )
                  .join(" / ")}
              </small>
            </article>
          ))}
      </div>
      {result?.meta && result.meta.last_page > 1 && (
        <nav className="dispatch-pagination" aria-label="Delivery pages">
          <span>
            {result.meta.from || 0}–{result.meta.to || 0} of {result.meta.total}
          </span>
          <Button
            variant="secondary"
            disabled={refreshing || page <= 1}
            onClick={() => setPage((value) => value - 1)}
          >
            Previous
          </Button>
          <span aria-current="page">
            Page {page} of {result.meta.last_page}
          </span>
          <Button
            variant="secondary"
            disabled={refreshing || page >= result.meta.last_page}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </Button>
        </nav>
      )}
      {!loading &&
        deliveries.length > 0 &&
        !refreshError &&
        !deliveries.some(
          (d) =>
            result?.meta ||
            (dispatchQueue(d) === queue &&
              `${d.order.order_number} ${d.rider?.name || ""} ${d.order.delivery_address || ""}`
                .toLowerCase()
                .includes(query.toLowerCase())),
        ) && (
          <EmptyState
            title={query ? "No matching deliveries" : "This queue is clear"}
            description={
              query
                ? "Try a different order, rider or address."
                : "Choose another queue to review the rest of your delivery work."
            }
          />
        )}
    </section>
  );
}
