import {
  MapPin,
  Store,
  UserRound,
  Phone,
  Navigation,
  MessageSquareText,
  Package,
  ChevronDown,
} from "lucide-react";

// Grouped into Route (where to go, and the way there) and Customer (who it is
// for and what), so each part of a delivery has its own labelled section.
export function RiderDeliveryDetails({ order, batchSequence, routeAction }) {
  const destination = order.destination || {};
  return (
    <div className="rider-delivery-details">
      <section className="rider-card-section" aria-label="Route">
        <h3 className="rider-card-section-title">Route</h3>
        <div className="rider-card-journey">
          <div className="rider-card-stop">
            <span className="rider-card-stop-icon pickup">
              <Store size={18} aria-hidden="true" />
            </span>
            <div>
              <span className="rider-card-field-label">Pickup</span>
              <p>
                {order.pickup?.address || "Restaurant address not configured"}
              </p>
              {order.pickup?.phone && (
                <a
                  className="rider-card-navigation rider-store-call"
                  href={`tel:${order.pickup.phone}`}
                >
                  <Phone size={15} aria-hidden="true" />
                  Call store
                </a>
              )}
            </div>
          </div>
          <div className="rider-card-stop">
            <span className="rider-card-stop-icon">
              <MapPin size={18} aria-hidden="true" />
            </span>
            <div>
              <span className="rider-card-field-label">Drop-off</span>
              <p>{destination.address || "Delivery address not recorded"}</p>
            </div>
          </div>
        </div>
        {batchSequence && (
          <p className="rider-card-batch">
            Paired delivery · drop-off {batchSequence} of 2. Follow the assigned
            sequence.
          </p>
        )}
        {routeAction}
      </section>
      <section className="rider-card-section" aria-label="Customer">
        <h3 className="rider-card-section-title">Customer</h3>
        <div className="rider-card-recipient">
          <UserRound size={18} aria-hidden="true" />
          <div>
            <span className="rider-card-field-label">Recipient</span>
            <strong>{destination.recipient_name || "Name not recorded"}</strong>
          </div>
          {destination.phone && (
            <a href={`tel:${destination.phone}`}>
              <Phone size={15} aria-hidden="true" />
              {destination.phone}
            </a>
          )}
        </div>
        {destination.instructions && (
          <div className="rider-card-instructions">
            <MessageSquareText size={17} aria-hidden="true" />
            <div>
              <span className="rider-card-field-label">
                Delivery instructions
              </span>
              <p>{destination.instructions}</p>
            </div>
          </div>
        )}
        {!!order.items?.length && (
          <details className="rider-card-items">
            <summary>
              <Package size={17} aria-hidden="true" />
              Order items{" "}
              <span>
                {order.items.reduce(
                  (sum, item) => sum + Number(item.quantity || 0),
                  0,
                )}
              </span>
              <ChevronDown size={15} aria-hidden="true" />
            </summary>
            <ul>
              {order.items.map((item, index) => (
                <li key={item.id || index}>
                  <b>{item.quantity}×</b> {item.item_name_snapshot}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}

export function RiderDeliveryNavigation({ order, status }) {
  const onRoad = ["picked_up", "in_transit"].includes(status);
  const point = onRoad ? order.destination : order.pickup;
  if (point?.latitude == null || point?.longitude == null) return null;
  return (
    <a
      className="rider-card-navigation"
      target="_blank"
      rel="noreferrer"
      href={`https://www.google.com/maps/dir/?api=1&destination=${point.latitude},${point.longitude}&travelmode=driving`}
    >
      <Navigation size={15} aria-hidden="true" />
      {onRoad ? "Navigate to customer" : "Navigate to pickup"}
    </a>
  );
}
