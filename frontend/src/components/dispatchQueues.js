export function dispatchQueue(delivery) {
  if (delivery.status === "failed" || delivery.dispatch_status === "exhausted")
    return "attention";
  if (["delivered", "cancelled"].includes(delivery.status)) return "finished";
  if (["picked_up", "in_transit"].includes(delivery.status)) return "road";
  if (
    ["assigned", "accepted", "arrived_at_restaurant"].includes(delivery.status)
  )
    return "pickup";
  return "waiting";
}
export const dispatchQueues = [
  ["attention", "Needs attention"],
  ["waiting", "Awaiting rider"],
  ["pickup", "Pickup"],
  ["road", "On the road"],
  ["finished", "Finished"],
];
