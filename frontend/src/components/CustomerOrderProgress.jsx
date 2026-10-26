import { Check, ChefHat, Bike } from "lucide-react";
import "./customerOrderProgress.css";
import { TrackingDisclosureSummary } from "./TrackingDisclosureSummary";
import { Link } from "react-router-dom";
import { RiderVehicle } from "./RiderVehicle";

export const foodLabels = {
  pending: "Order received",
  confirmed: "Restaurant confirmed your order",
  preparing: "Kitchen is preparing your food",
  ready_to_serve: "Food ready for rider pickup",
  completed: "Order completed",
  cancelled: "Order cancelled",
};
export const deliveryLabels = {
  pending_assignment: "Finding your rider",
  assigned: "Rider assigned · awaiting confirmation",
  accepted: "Rider confirmed · heading to restaurant",
  arrived_at_restaurant: "Rider arrived at the restaurant",
  picked_up: "Rider picked up your food",
  in_transit: "Rider is on the way",
  delivered: "Delivered",
  failed: "Delivery needs attention",
  cancelled: "Delivery cancelled",
};
const foodStages = [
  ["pending", "Order received"],
  ["confirmed", "Restaurant confirmed"],
  ["preparing", "Preparing your food"],
  ["ready_to_serve", "Ready for rider pickup"],
];
const riderStages = [
  ["pending_assignment", "Finding a rider"],
  ["accepted", "Rider confirmed"],
  ["arrived_at_restaurant", "At the restaurant"],
  ["picked_up", "Food picked up"],
  ["in_transit", "On the way"],
  ["delivered", "Delivered"],
];
const readable = (status) =>
  String(status || "Waiting for an update").replaceAll("_", " ");

export function trackingTimeline(data) {
  return [
    ...(data.order_history || []).map((event) => ({
      ...event,
      source: "order",
      label: foodLabels[event.status] || readable(event.status),
    })),
    ...(data.history || []).map((event) => ({
      ...event,
      source: "rider",
      label: deliveryLabels[event.status] || readable(event.status),
    })),
  ]
    .filter(
      (event) => event.at && Number.isFinite(new Date(event.at).getTime()),
    )
    .sort(
      (a, b) =>
        new Date(a.at) - new Date(b.at) ||
        (a.source === b.source
          ? (a.id ?? 0) - (b.id ?? 0)
          : a.source === "order"
            ? -1
            : 1),
    );
}

export function riderSearchMessage(status) {
  return (
    {
      waiting_payment:
        "Waiting for payment verification before finding a rider.",
      waiting_merchant:
        "Waiting for the restaurant to confirm preparation time.",
      scheduled: "We are timing the rider search around your food preparation.",
      exhausted: "Restaurant staff are helping find an available rider.",
    }[status] || "We will update you as soon as a rider accepts your delivery."
  );
}

function ProgressSteps({ stages, current, history, stopped, completed }) {
  const reached = Math.max(
    completed ? stages.length - 1 : -1,
    stages.findIndex(([status]) => status === current),
    ...history.map((event) =>
      stages.findIndex(([status]) => event.status === status),
    ),
  );
  return (
    <ol className="customer-progress-steps">
      {stages.map(([status, label], index) => (
        <li
          key={status}
          className={index <= reached ? "reached" : "upcoming"}
          aria-current={!stopped && index === reached ? "step" : undefined}
        >
          <span className="customer-progress-dot" aria-hidden="true">
            {index < reached || completed ? <Check size={14} /> : index + 1}
          </span>
          <span>
            {label}
            <small>
              {index < reached || completed
                ? "Complete"
                : index === reached
                  ? stopped
                    ? "Last reached"
                    : "Current"
                  : "Upcoming"}
            </small>
          </span>
        </li>
      ))}
    </ol>
  );
}

export function CustomerOrderProgress({ data, children }) {
  const stopped =
    ["cancelled", "failed"].includes(data.status) ||
    data.order_status === "cancelled";
  const done = data.status === "delivered";
  const foodReady = ["ready_to_serve", "completed"].includes(data.order_status);
  const foodTitle =
    foodLabels[data.order_status] || "Waiting for a kitchen update";
  const riderTitle = deliveryLabels[data.status] || readable(data.status);
  const events = trackingTimeline(data);
  return (
    <>
      <div className="customer-progress-grid">
        <section
          className="customer-progress-card customer-progress-food"
          aria-labelledby="food-progress-heading"
        >
          <div className="customer-progress-heading">
            <ChefHat size={21} aria-hidden="true" />
            <h2 id="food-progress-heading">Your food</h2>
          </div>
          <p className="customer-progress-current" role="status">
            {foodTitle}
          </p>
          {!foodReady && !stopped && data.prep_ready_at && (
            <p className="customer-progress-note">
              Est. ready:{" "}
              <time dateTime={data.prep_ready_at}>
                {new Date(data.prep_ready_at).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </time>
            </p>
          )}
          <details className="customer-progress-disclosure">
            <TrackingDisclosureSummary meta="Details">
              Food preparation
            </TrackingDisclosureSummary>
            <ProgressSteps
              stages={foodStages}
              current={data.order_status}
              history={data.order_history || []}
              stopped={stopped}
              completed={done}
            />
          </details>
        </section>
        <section
          className="customer-progress-card customer-progress-rider"
          aria-labelledby="rider-progress-heading"
        >
          <div className="customer-progress-heading">
            <Bike size={21} aria-hidden="true" />
            <h2 id="rider-progress-heading">Your rider</h2>
          </div>
          <p className="customer-progress-current" role="status">
            {riderTitle}
          </p>
          {data.rider && (
            <p className="customer-progress-note">
              {done ? `Delivered by ${data.rider.name}.` : data.rider.name}
            </p>
          )}
          {data.rider?.id && (
            <div>
              <RiderVehicle type={data.rider.vehicle_type} />
            </div>
          )}
          {data.rider?.id && (
            <Link
              className="rider-profile-link"
              to={`/riders/${data.rider.id}`}
            >
              View rider profile
            </Link>
          )}
          {data.status === "pending_assignment" && (
            <p className="customer-progress-note">
              {riderSearchMessage(data.dispatch_status)}
            </p>
          )}
          {data.status === "arrived_at_restaurant" && (
            <p className="customer-progress-note">
              {foodReady
                ? "Your food is ready. The rider will confirm pickup shortly."
                : "Your rider is at the restaurant while the kitchen finishes your food."}
            </p>
          )}
          <details className="customer-progress-disclosure">
            <TrackingDisclosureSummary meta="Details">
              Rider progress
            </TrackingDisclosureSummary>
            <ProgressSteps
              stages={riderStages}
              current={
                data.status === "assigned" ? "pending_assignment" : data.status
              }
              history={data.history || []}
              stopped={stopped}
              completed={done}
            />
          </details>
        </section>
      </div>
      {stopped && (
        <p className="customer-tracking-attention" role="status">
          {data.failure_reason ||
            (data.order_status === "cancelled" || data.status === "cancelled"
              ? "This order was cancelled. Contact the restaurant if you need help."
              : "Your delivery needs attention. Restaurant staff can help with the next step.")}
        </p>
      )}
      {children}
      <details className="customer-progress-card customer-order-timeline">
        <TrackingDisclosureSummary
          meta={events.length ? `${events.length} updates` : "Details"}
        >
          Order updates
        </TrackingDisclosureSummary>
        {events.length ? (
          <ol>
            {events.map((event, index) => (
              <li key={`${event.source}-${event.id ?? index}`}>
                <span className="customer-event-source">
                  {event.source === "order" ? "Kitchen & order" : "Delivery"}
                </span>
                <strong>{event.label}</strong>
                <time dateTime={event.at}>
                  {new Date(event.at).toLocaleString()}
                </time>
              </li>
            ))}
          </ol>
        ) : (
          <p className="customer-progress-note">
            Updates will appear here as the restaurant and rider progress.
          </p>
        )}
      </details>
    </>
  );
}
