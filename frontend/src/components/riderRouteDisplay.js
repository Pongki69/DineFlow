const congestedLevels = new Set(["moderate", "heavy", "severe"]);

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
