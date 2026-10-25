import { Bike, Car, Truck } from "lucide-react";
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

export function RiderVehicle({ type }) {
  const normalized = String(type || "")
    .trim()
    .toLowerCase();
  const { label, Icon } = vehicles[
    normalized === "bike" ? "bicycle" : normalized
  ] || { label: "Vehicle not specified", Icon: Truck };
  return (
    <span className="rider-vehicle-badge">
      <Icon size={18} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
