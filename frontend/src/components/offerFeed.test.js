import { expect, it } from "vitest";
import { receiveOffers, showOfferUpdates } from "./offerFeed";

const now = Date.parse("2026-10-25T04:00:00Z");
const offer = (id, expiry = now + 30000) => ({
  id,
  order_number: `DF-${id}`,
  pickup: `Pickup ${id}`,
  expires_at: new Date(expiry).toISOString(),
});

it("automatically fills an empty list, then queues new arrivals without reordering existing cards", () => {
  let feed = receiveOffers(
    { visible: [], queued: [] },
    [offer(1), offer(2)],
    now,
  );
  feed = receiveOffers(
    feed,
    [offer(3), { ...offer(2), pickup: "Changed" }, offer(1), offer(3)],
    now,
  );
  expect(feed.visible.map((item) => item.id)).toEqual([1, 2]);
  expect(feed.visible[1].pickup).toBe("Pickup 2");
  expect(feed.queued.map((item) => item.id)).toEqual([3]);
  expect(showOfferUpdates(feed, now).visible.map((item) => item.id)).toEqual([
    1, 2, 3,
  ]);
});

it("retains ended cards and responding cards until an explicit list refresh", () => {
  let feed = receiveOffers(
    { visible: [], queued: [] },
    [offer(1), offer(2)],
    now,
  );
  feed.visible[0].feedStatus = "responding";
  feed = receiveOffers(feed, [offer(3)], now);
  expect(feed.visible.map((item) => item.feedStatus)).toEqual([
    "responding",
    "unavailable",
  ]);
  expect(
    showOfferUpdates(
      {
        ...feed,
        visible: feed.visible.map((item) => ({
          ...item,
          feedStatus: "accepted",
        })),
      },
      now,
    ).visible.map((item) => item.id),
  ).toEqual([3]);
});

it("discards queued offers that expire before the rider displays them", () => {
  let feed = receiveOffers({ visible: [], queued: [] }, [offer(1)], now);
  feed = receiveOffers(feed, [offer(1), offer(2, now + 1000)], now);
  expect(
    showOfferUpdates(feed, now + 2000).visible.map((item) => item.id),
  ).toEqual([1]);
});
