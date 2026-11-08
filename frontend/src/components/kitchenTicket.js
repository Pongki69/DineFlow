// Small pure helpers for the kitchen display.

// Notes that mention an allergy or a common allergen are flagged in red, so
// they stand out from notes like "less spicy".
const ALLERGY_PATTERN =
  /\b(allerg\w*|anaphyla\w*|epipen|nuts?|peanuts?|tree ?nuts?|cashews?|almonds?|shellfish|shrimps?|prawns?|crabs?|lobsters?|squid|gluten|wheat|celiac|coeliac|dairy|lactose|milk|eggs?|soy|sesame|fish)\b/i;

export function mentionsAllergy(text) {
  return Boolean(text) && ALLERGY_PATTERN.test(String(text));
}

// Every dish still to cook across the open tickets, biggest batch first:
// [{ name, quantity }]. Ticked-off dishes and ready tickets are left out.
export function allDayCounts(orders) {
  const totals = new Map();
  for (const order of orders) {
    if (!["confirmed", "preparing"].includes(order.status)) continue;
    for (const item of order.items || []) {
      if (item.prepared_at) continue;
      const name = item.variant_name_snapshot
        ? `${item.item_name_snapshot} (${item.variant_name_snapshot})`
        : item.item_name_snapshot;
      if (!name) continue;
      totals.set(name, (totals.get(name) || 0) + (Number(item.quantity) || 0));
    }
  }
  return [...totals]
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name));
}

// What the kitchen needs to know about a delivery's rider.
// Returns { text, tone } where tone is "waiting", "coming" or "here".
export function riderStatus(delivery) {
  if (!delivery) return null;
  const name = delivery.rider_name || "Rider";
  if (delivery.status === "pending_assignment")
    return { text: "Finding a rider", tone: "waiting" };
  if (delivery.status === "arrived_at_restaurant")
    return { text: `${name} is here for pickup`, tone: "here" };
  if (["assigned", "accepted"].includes(delivery.status)) {
    const eta = delivery.rider_eta_minutes;
    return {
      text:
        eta === null || eta === undefined
          ? `${name} is on the way`
          : `${name} arrives in about ${eta} min`,
      tone: "coming",
    };
  }
  return null;
}

const PRIORITY_RANK = { late: 0, soon: 1, normal: 2 };

// Most urgent first: tickets the pass pinned, then late, then due soon,
// then oldest. Ready tickets go last, the most recently finished on top.
export function sortTickets(tickets) {
  return [...tickets].sort((a, b) => {
    const aReady = a.order.status === "ready_to_serve";
    const bReady = b.order.status === "ready_to_serve";
    if (aReady !== bReady) return aReady ? 1 : -1;
    if (aReady)
      return new Date(b.order.ready_at || 0) - new Date(a.order.ready_at || 0);
    const aPinned = Boolean(a.order.kitchen_pinned_at);
    const bPinned = Boolean(b.order.kitchen_pinned_at);
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    return (
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      new Date(a.order.created_at || 0) - new Date(b.order.created_at || 0)
    );
  });
}
