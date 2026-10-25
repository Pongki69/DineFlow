import L from "leaflet";
import "./restaurantMapIcon.css";

export const restaurantMapIcon = L.divIcon({
  className: "restaurant-map-pin",
  html: '<svg viewBox="0 0 40 52" aria-hidden="true"><ellipse cx="20" cy="48" rx="10" ry="3" fill="#20372c" opacity=".18"/><path d="M20 49C15 41 3 30 3 20a17 17 0 1 1 34 0c0 10-12 21-17 29Z" fill="#245440" stroke="white" stroke-width="3"/><g fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 18h18l-2-6H13l-2 6Zm1 0v11h16V18M16 29v-7h8v7M11 18v2c0 2 3 2 3 0 0 2 3 2 3 0 0 2 3 2 3 0 0 2 3 2 3 0 0 2 3 2 3 0 0 2 3 2 3 0v-2"/></g></svg>',
  iconSize: [40, 52],
  iconAnchor: [20, 49],
});
