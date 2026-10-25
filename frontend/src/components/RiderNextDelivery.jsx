import { Link } from "react-router-dom";
import {
  ArrowRight,
  Check,
  MapPin,
  Store,
  UserRound,
  Phone,
  MessageSquare,
} from "lucide-react";
import { EmptyState, StatusBadge } from "./ui";
import "./riderNextDelivery.css";

const nextStep = {
  assigned: ["Review the assignment before heading out.", "Review assignment"],
  accepted: ["Head to the restaurant to collect this order.", "View pickup"],
  arrived_at_restaurant: ["Collect the order when it is ready.", "View pickup"],
  picked_up: ["Take the order to the customer.", "Continue drop-off"],
  in_transit: [
    "Complete the drop-off and add a delivery photo.",
    "Continue drop-off",
  ],
};

export function RiderNextDelivery({ delivery, activeCount }) {
  const onWay = ["picked_up", "in_transit"].includes(delivery?.status);
  const [guidance, action] = nextStep[delivery?.status] || [
    "Open your deliveries for the next step.",
    "View delivery",
  ];
  const stops = delivery
    ? [
        {
          key: "pickup",
          label: "Pickup",
          Icon: Store,
          address:
            delivery.order.pickup?.address ||
            "Restaurant location not recorded",
        },
        {
          key: "dropoff",
          label: "Drop-off",
          Icon: MapPin,
          address:
            delivery.order.destination?.address ||
            "Delivery address not recorded",
          recipient: delivery.order.destination?.recipient_name,
          phone: delivery.order.destination?.phone,
          instructions: delivery.order.destination?.instructions,
        },
      ]
    : [];
  return (
    <section
      className="rider-next-delivery"
      aria-labelledby="rider-next-heading"
    >
      <header>
        <h2 id="rider-next-heading">Next delivery</h2>
        <Link className="rider-page-link" to="/rider/deliveries">
          View all{activeCount ? ` (${activeCount})` : ""}{" "}
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </header>
      {delivery ? (
        <div className="rider-next-content">
          <div className="rider-next-identity">
            <div>
              <span className="rider-next-label">Current assignment</span>
              <h3>{delivery.order.order_number}</h3>
            </div>
            <span className="rider-next-status" data-status={delivery.status}>
              <StatusBadge status={delivery.status} />
            </span>
          </div>
          <ol className="rider-next-progress" aria-label="Delivery progress">
            {["Pickup", "On the way", "Delivered"].map((step, index) => (
              <li
                key={step}
                aria-current={index === (onWay ? 1 : 0) ? "step" : undefined}
                data-complete={(onWay && index === 0) || undefined}
              >
                <span className="rider-step-number" aria-hidden="true">
                  {onWay && index === 0 ? <Check size={13} /> : index + 1}
                </span>
                <div>
                  <strong>{step}</strong>
                  <small>
                    {onWay && index === 0
                      ? "Completed"
                      : index === (onWay ? 1 : 0)
                        ? "Current step"
                        : "Upcoming"}
                  </small>
                </div>
              </li>
            ))}
          </ol>
          <div className="rider-next-addresses">
            {stops.map(
              ({
                key,
                label,
                Icon,
                address,
                recipient,
                phone,
                instructions,
              }) => (
                <section
                  className={
                    key === (onWay ? "dropoff" : "pickup")
                      ? "rider-next-stop"
                      : "rider-other-stop"
                  }
                  key={key}
                  aria-label={
                    key === (onWay ? "dropoff" : "pickup")
                      ? `Next stop: ${label}`
                      : label
                  }
                >
                  <div className="rider-stop-heading">
                    <span className={`rider-next-place-icon ${key}`}>
                      <Icon size={20} aria-hidden="true" />
                    </span>
                    <span className="rider-next-label">
                      {key === (onWay ? "dropoff" : "pickup")
                        ? `Next stop · ${label}`
                        : label}
                    </span>
                  </div>
                  <p className="rider-stop-address">{address}</p>
                  {recipient && (
                    <div className="rider-next-recipient">
                      <UserRound size={15} aria-hidden="true" />
                      <strong>{recipient}</strong>
                    </div>
                  )}
                  {phone && (
                    <a
                      className="rider-recipient-call-link"
                      href={`tel:${phone}`}
                    >
                      <Phone size={16} aria-hidden="true" />
                      {phone}
                    </a>
                  )}
                  {instructions?.trim() && (
                    <div className="rider-dropoff-instructions">
                      <span>
                        <MessageSquare size={16} aria-hidden="true" />
                        Drop-off instructions
                      </span>
                      <p>{instructions}</p>
                    </div>
                  )}
                  {key === (onWay ? "dropoff" : "pickup") && (
                    <div className="rider-next-actions">
                      <Link
                        className="workspace-action"
                        to={`/rider/deliveries?delivery=${delivery.id}`}
                      >
                        {action}
                        <ArrowRight size={18} aria-hidden="true" />
                      </Link>
                      <p>{guidance}</p>
                    </div>
                  )}
                </section>
              ),
            )}
          </div>
          <footer className="rider-delivery-reference">
            <span>Delivery ID: #{delivery.id}</span>
            <span>
              {activeCount} active{" "}
              {activeCount === 1 ? "delivery" : "deliveries"}
            </span>
          </footer>
        </div>
      ) : (
        <EmptyState
          title="No active delivery"
          description="Check delivery offers when you are ready for your next pickup."
          to="/rider/offers"
          action="Browse offers"
        />
      )}
    </section>
  );
}
