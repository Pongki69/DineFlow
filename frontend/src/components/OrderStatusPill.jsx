import {
  BellRing,
  Bike,
  ChefHat,
  CircleCheck,
  CircleX,
  ClipboardCheck,
  Clock3,
  Package,
  Store,
  TriangleAlert,
  UtensilsCrossed,
} from "lucide-react";

// Order states mapped onto the existing Sage status pairs
// (--df-status-pending / progress / success / neutral / danger). States are
// told apart by icon and written label, never by color alone.
const STATES = {
  pending: { label: "Pending", icon: Clock3, tone: "pending" },
  confirmed: { label: "Confirmed", icon: ClipboardCheck, tone: "pending" },
  preparing: { label: "Preparing", icon: ChefHat, tone: "progress" },
  ready: { label: "Ready", icon: BellRing, tone: "success" },
  dispatched: { label: "Out for delivery", icon: Bike, tone: "progress" },
  served: { label: "Served", icon: UtensilsCrossed, tone: "success" },
  delivered: { label: "Delivered", icon: CircleCheck, tone: "success" },
  completed: { label: "Completed", icon: CircleCheck, tone: "success" },
  cancelled: { label: "Cancelled", icon: CircleX, tone: "danger" },
  failed: { label: "Unsuccessful", icon: TriangleAlert, tone: "danger" },
};

const ALIASES = {
  accepted: "preparing",
  in_progress: "preparing",
  ready_to_serve: "ready",
  out_for_delivery: "dispatched",
  in_transit: "dispatched",
  picked_up: "dispatched",
  canceled: "cancelled",
};

export function orderStateKey(status) {
  const value = String(status || "pending").toLowerCase();
  const key = ALIASES[value] || value;
  return STATES[key] ? key : "pending";
}

// Rider delivery states, worded for the rider. Order states fall through to
// the order pill so a record page can pass either.
const DELIVERY_STATES = {
  assigned: { label: "Awaiting acceptance", icon: Clock3, tone: "pending" },
  accepted: { label: "Heading to pickup", icon: Store, tone: "progress" },
  arrived_at_restaurant: {
    label: "At restaurant",
    icon: Store,
    tone: "progress",
  },
  picked_up: { label: "Picked up", icon: Package, tone: "progress" },
  in_transit: { label: "On the way", icon: Bike, tone: "progress" },
  delivered: { label: "Delivered", icon: CircleCheck, tone: "success" },
  failed: { label: "Unsuccessful", icon: TriangleAlert, tone: "danger" },
  cancelled: { label: "Cancelled", icon: CircleX, tone: "danger" },
};

export function deliveryStatusLabel(status) {
  return DELIVERY_STATES[status]?.label;
}

export function DeliveryStatusPill({ status, className = "" }) {
  const state = DELIVERY_STATES[status];
  if (!state) return <OrderStatusPill status={status} className={className} />;
  const { label, icon: Icon, tone } = state;
  return (
    <span
      className={`df-status ${className}`.trim()}
      data-state={status}
      data-tone={tone}
    >
      <Icon size={16} strokeWidth={1.7} aria-hidden="true" />
      {label}
    </span>
  );
}

export function OrderStatusPill({ status, className = "" }) {
  const key = orderStateKey(status);
  const { label, icon: Icon, tone } = STATES[key];
  return (
    <span
      className={`df-status ${className}`.trim()}
      data-state={key}
      data-tone={tone}
    >
      <Icon size={16} strokeWidth={1.7} aria-hidden="true" />
      {label}
    </span>
  );
}
