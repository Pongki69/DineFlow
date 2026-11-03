import { describe, expect, it } from "vitest";
import {
  collectionGroups,
  counterTag,
  isUrgent,
  waitingFor,
  matchesSearch,
  peso,
  quickCashAmounts,
  tableLabel,
  totalsByMethod,
} from "./cashierQueue";

describe("peso and tableLabel", () => {
  it("formats money with separators and avoids 'Table Table'", () => {
    expect(peso(11336.8)).toBe("₱11,336.80");
    expect(peso("570")).toBe("₱570.00");
    expect(peso(null)).toBe("₱0.00");
    expect(tableLabel("Table 6")).toBe("Table 6");
    expect(tableLabel("6")).toBe("Table 6");
  });
});

describe("collectionGroups", () => {
  const bills = [
    {
      id: 1,
      table_number: "Table 2",
      balance_due: "1285.00",
      orders: [{ order_number: "A" }, { order_number: "B" }],
      guest_count: 3,
    },
    {
      id: 2,
      table_number: "Table 6",
      balance_due: "570.00",
      orders: [{ order_number: "C" }],
      bill_requested_at: "2026-11-02T10:00:00Z",
    },
    { id: 3, table_number: "Table 1", balance_due: "0.00", orders: [] },
  ];
  const queue = {
    orders: [
      {
        id: 10,
        order_number: "A",
        order_type: "dine_in",
        balance_due: "100.00",
        dining_session_id: 1,
      },
      {
        id: 11,
        order_number: "P-1",
        order_type: "pickup",
        balance_due: "480.00",
        customer_name: "Ana",
      },
      {
        id: 12,
        order_number: "D-1",
        order_type: "delivery",
        balance_due: "920.00",
      },
    ],
    reservation_deposits: [
      { id: 5, reference: "RSV-1", guest_name: "Ben", deposit_amount: 250 },
    ],
  };
  it("puts bill requests first and keeps deliveries apart", () => {
    const groups = collectionGroups(bills, queue);
    expect(groups.requested.map((e) => e.title)).toEqual(["Table 6"]);
    expect(groups.tables.map((e) => e.title)).toEqual(["Table 2"]);
    expect(groups.counter.map((e) => e.title)).toEqual(["P-1", "RSV-1"]);
    expect(groups.delivery.map((e) => e.title)).toEqual(["D-1"]);
    expect(groups.tables[0].detail).toBe("2 orders · 3 guests");
  });
  it("finds entries by table, order number or name", () => {
    const groups = collectionGroups(bills, queue);
    expect(matchesSearch(groups.tables[0], "b")).toBe(true);
    expect(matchesSearch(groups.counter[0], "ana")).toBe(true);
    expect(matchesSearch(groups.counter[0], "table 2")).toBe(false);
  });
});

describe("quickCashAmounts", () => {
  it("offers exact and likely notes", () => {
    expect(quickCashAmounts(285)).toEqual([285, 300, 500, 1000]);
    expect(quickCashAmounts(1000)).toEqual([1000]);
    expect(quickCashAmounts(1285)).toEqual([1285, 1300, 1500, 2000]);
    expect(quickCashAmounts(0)).toEqual([]);
  });
});

describe("totalsByMethod", () => {
  it("adds up paid payments per method", () => {
    expect(
      totalsByMethod([
        { method: "cash", status: "paid", amount: "530.00" },
        { method: "cash", status: "paid", amount: "320.00" },
        { method: "card", status: "refunded", amount: "585.00" },
        { method: "gcash", status: "paid", amount: "1195.00" },
      ]),
    ).toEqual([
      { method: "gcash", total: 1195, count: 1 },
      { method: "cash", total: 850, count: 2 },
    ]);
  });
});

describe("waiting and urgency", () => {
  const now = Date.parse("2026-11-03T12:00:00Z");
  it("says how long someone has waited", () => {
    expect(waitingFor("2026-11-03T11:48:00Z", now)).toBe("12 min");
    expect(waitingFor("2026-11-03T10:48:00Z", now)).toBe("1 h 12 min");
    expect(waitingFor(null, now)).toBe("");
  });
  it("puts people already holding their food first at the counter", () => {
    const groups = collectionGroups([], {
      orders: [
        {
          id: 1,
          order_number: "OLD",
          order_type: "pickup",
          balance_due: "10",
          status: "preparing",
          created_at: "2026-11-03T09:00:00Z",
        },
        {
          id: 2,
          order_number: "READY",
          order_type: "pickup",
          balance_due: "10",
          status: "ready_to_serve",
          created_at: "2026-11-03T11:00:00Z",
        },
      ],
    });
    expect(groups.counter.map((e) => e.title)).toEqual(["READY", "OLD"]);
    expect(isUrgent(groups.counter[0])).toBe(true);
    expect(counterTag(groups.counter[0]).text).toBe("Ready · customer waiting");
    expect(counterTag(groups.counter[1]).text).toBe("In the kitchen");
  });
});
