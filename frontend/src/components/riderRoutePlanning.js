export function validRoutePoint(point) {
  return (
    point?.latitude != null &&
    point?.longitude != null &&
    point.latitude !== "" &&
    point.longitude !== "" &&
    Number.isFinite(Number(point.latitude)) &&
    Number.isFinite(Number(point.longitude)) &&
    Math.abs(Number(point.latitude)) <= 90 &&
    Math.abs(Number(point.longitude)) <= 180
  );
}

export function respectsBatchOrder(deliveries) {
  const previous = new Map();
  for (const delivery of deliveries) {
    if (!delivery.batch_key) continue;
    if (
      (previous.get(delivery.batch_key) ?? -1) > Number(delivery.batch_sequence)
    )
      return false;
    previous.set(delivery.batch_key, Number(delivery.batch_sequence));
  }
  return true;
}

export function orderedRouteDeliveries(deliveries, order = []) {
  const active = deliveries.filter(
    (d) => !["delivered", "failed", "cancelled"].includes(d.status),
  );
  const byId = new Map(active.map((d) => [d.id, d]));
  const preferred = [
    ...order.filter((id) => byId.has(id)).map((id) => byId.get(id)),
    ...active.filter((d) => !order.includes(d.id)),
  ];
  return respectsBatchOrder(preferred)
    ? preferred
    : nearestDeliveryOrder(preferred, null);
}

// A nearest-stop suggestion, preserving each paired delivery's required sequence.
export function nearestDeliveryOrder(deliveries, origin) {
  const remaining = [...deliveries];
  const result = [];
  let current = origin;
  while (remaining.length) {
    const eligible = remaining.filter(
      (d) =>
        !d.batch_key ||
        !remaining.some(
          (other) =>
            other.batch_key === d.batch_key &&
            Number(other.batch_sequence) < Number(d.batch_sequence),
        ),
    );
    const distance = (d) => {
      const point = d.order.destination;
      if (!validRoutePoint(current) || !validRoutePoint(point)) return Infinity;
      const lat =
        ((Number(current.latitude) + Number(point.latitude)) * Math.PI) / 360;
      return (
        (Number(current.latitude) - Number(point.latitude)) ** 2 +
        ((Number(current.longitude) - Number(point.longitude)) *
          Math.cos(lat)) **
          2
      );
    };
    const next =
      eligible.reduce(
        (best, item) =>
          !best || distance(item) < distance(best) ? item : best,
        null,
      ) || remaining[0];
    result.push(next);
    remaining.splice(remaining.indexOf(next), 1);
    if (validRoutePoint(next.order.destination))
      current = next.order.destination;
  }
  return result;
}
