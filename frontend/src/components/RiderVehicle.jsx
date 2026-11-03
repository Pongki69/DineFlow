import { Bike, Car, ChevronRight, Truck } from "lucide-react";
import { Link } from "react-router-dom";
import "./riderVehicle.css";

function MotorcycleIcon({ size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="5" cy="17" r="3.5" />
      <circle cx="19" cy="17" r="3.5" />
      <path d="m19 17-4-11h-3m4 5H9l-4 6h7l4-6M7 9h4m4-5h3" />
    </svg>
  );
}

const vehicles = {
  bicycle: { label: "Bicycle", Icon: Bike },
  motorcycle: { label: "Motorcycle", Icon: MotorcycleIcon },
  car: { label: "Car", Icon: Car },
};

/** The icon for a rider's vehicle; a bicycle when none is saved. */
export function VehicleIcon({ type, size = 18 }) {
  const normalized = String(type || "")
    .trim()
    .toLowerCase();
  const { Icon } =
    vehicles[normalized === "bike" ? "bicycle" : normalized] ||
    vehicles.bicycle;
  return <Icon size={size} aria-hidden="true" />;
}

// Where a rider saves their vehicle (Account, Rider details).
export const RIDER_VEHICLE_SETUP = "/account#rider-details";

/** `setupTo`: for the rider's own screens, a missing vehicle links to setup. */
export function RiderVehicle({ type, setupTo }) {
  const normalized = String(type || "")
    .trim()
    .toLowerCase();
  const known = vehicles[normalized === "bike" ? "bicycle" : normalized];
  if (!known && setupTo)
    return (
      <Link
        className="rider-vehicle-badge rider-vehicle-badge--missing"
        to={setupTo}
      >
        <Truck size={18} aria-hidden="true" />
        <span>No vehicle yet · Add your vehicle</span>
        <ChevronRight size={16} aria-hidden="true" />
      </Link>
    );
  const { label, Icon } = known || {
    label: "Vehicle not specified",
    Icon: Truck,
  };
  return (
    <span className="rider-vehicle-badge">
      <Icon size={18} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
