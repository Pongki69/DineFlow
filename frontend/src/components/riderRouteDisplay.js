const congestedLevels = new Set(["moderate", "heavy", "severe"]);

export const routeColors = Object.freeze({
  next: "#1d4ed8",
  selected: "#0f766e",
  context: "#64748b",
  return: "#7c3aed",
});

export function roadLegAppearance({ returning, next, selected }) {
  // A return journey keeps its dashed purple identity even when it is next.
  const kind = returning
    ? "return"
    : next
      ? "next"
      : selected
        ? "selected"
        : "context";
  const emphasized = Boolean(next || selected);
  return {
    kind,
    emphasized,
    pathOptions: {
      color: routeColors[kind],
      weight: emphasized ? 6 : 4,
      opacity: emphasized ? 1 : 0.82,
      lineCap: "round",
      lineJoin: "round",
      className: `rider-road-leg is-${kind}`,
      ...(returning
        ? { dashArray: "10 8" }
        : !next
          ? { dashArray: selected ? "6 7" : "4 7" }
          : {}),
    },
  };
}

export function routeProgressCopy(stops, selectedDeliveryId, deliveries) {
  const next = stops[0];
  if (!next) return null;
  const selectedIndex = stops.findIndex(
    (stop) =>
      stop.kind === "dropoff" &&
      String(stop.delivery_id) === String(selectedDeliveryId),
  );
  const selected = deliveries.find(
    (delivery) => String(delivery.id) === String(selectedDeliveryId),
  );
  let detail = next.address || "";
  let heading = "Next stop: Customer delivery";
  if (next.kind === "pickup") {
    heading = "Next stop: Restaurant pickup";
    const count = next.order_numbers?.length || 1;
    detail = `Collect ${count === 1 ? "this order" : `${count} orders`} at the store before customer drop-offs.`;
    if (selected?.status === "accepted")
      detail += " Mark your arrival, then pick up the order when it is ready.";
    else if (selected?.status === "arrived_at_restaurant")
      detail += " Pick up the order once the kitchen marks it ready.";
  } else if (next.kind === "return") {
    heading = "Next stop: Return to store";
  }
  const previous = stops[selectedIndex - 1];
  return {
    heading,
    detail,
    selectionHint:
      selectedIndex > 0
        ? `Dashed teal previews the later leg from ${previous.kind === "pickup" ? "the pickup store" : `stop ${selectedIndex}`} to customer stop ${selectedIndex + 1}.`
        : null,
  };
}

export function trafficOverlays(leg) {
  return (leg.traffic_segments || []).filter(
    (segment) =>
      congestedLevels.has(segment.congestion) && segment.geometry?.length > 1,
  );
}

export function stopArrivalText(stop) {
  if (stop?.eta_at && Number.isFinite(new Date(stop.eta_at).getTime())) {
    return `ETA ${new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(stop.eta_at))}`;
  }
  if (stop?.travel_minutes_from_start > 0)
    return `~${stop.travel_minutes_from_start} min after the first stop`;
  return null;
}
