export function liveOffers(offers, now) {
  return [
    ...new Map(
      (offers || [])
        .filter((offer) => new Date(offer.expires_at).getTime() > now)
        .map((offer) => [offer.id, offer]),
    ).values(),
  ];
}

export function receiveOffers(feed, offers, now, replace = false) {
  const incoming = liveOffers(offers, now);
  if (replace || !feed.visible.length)
    return {
      visible: incoming.map((offer) => ({ ...offer, feedStatus: "available" })),
      queued: [],
    };
  const current = new Map(incoming.map((offer) => [offer.id, offer]));
  const visibleIds = new Set(feed.visible.map((offer) => offer.id));
  return {
    visible: feed.visible.map((offer) =>
      ["responding", "accepted", "declined"].includes(offer.feedStatus)
        ? offer
        : {
            ...offer,
            expires_at: current.get(offer.id)?.expires_at || offer.expires_at,
            feedStatus: current.has(offer.id) ? "available" : "unavailable",
          },
    ),
    queued: incoming.filter((offer) => !visibleIds.has(offer.id)),
  };
}

export function showOfferUpdates(feed, now) {
  const retained = feed.visible.filter(
    (offer) =>
      offer.feedStatus === "available" &&
      new Date(offer.expires_at).getTime() > now,
  );
  const ids = new Set(retained.map((offer) => offer.id));
  return {
    visible: [
      ...retained,
      ...liveOffers(feed.queued, now)
        .filter((offer) => !ids.has(offer.id))
        .map((offer) => ({ ...offer, feedStatus: "available" })),
    ],
    queued: [],
  };
}
