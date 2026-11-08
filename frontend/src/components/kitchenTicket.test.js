import { describe, expect, it } from "vitest";
import {
  allDayCounts,
  mentionsAllergy,
  riderStatus,
  sortTickets,
} from "./kitchenTicket";

describe("mentionsAllergy", () => {
  it("flags allergies and common allergens, not ordinary requests", () => {
    expect(mentionsAllergy("Nut allergy, please be careful")).toBe(true);
    expect(mentionsAllergy("No shrimp")).toBe(true);
    expect(mentionsAllergy("allergic to eggs")).toBe(true);
    expect(mentionsAllergy("Less spicy, please.")).toBe(false);
    expect(mentionsAllergy("Extra rice")).toBe(false);
    expect(mentionsAllergy(null)).toBe(false);
  });
});

describe("allDayCounts", () => {
  it("totals dishes still to cook across open tickets", () => {
    const orders = [
      {
        status: "preparing",
        items: [
          { item_name_snapshot: "Tapsilog", quantity: 2 },
          { item_name_snapshot: "Rice", quantity: 1, prepared_at: "x" },
        ],
      },
      {
        status: "confirmed",
        items: [
          { item_name_snapshot: "Tapsilog", quantity: 3 },
          { item_name_snapshot: "Adobo", quantity: 1 },
        ],
      },
      {
        status: "ready_to_serve",
        items: [{ item_name_snapshot: "Tapsilog", quantity: 9 }],
      },
    ];
    expect(allDayCounts(orders)).toEqual([
      { name: "Tapsilog", quantity: 5 },
      { name: "Adobo", quantity: 1 },
    ]);
  });
});

describe("riderStatus", () => {
  it("describes the rider for each delivery stage", () => {
    expect(riderStatus({ status: "pending_assignment" }).text).toBe(
      "Finding a rider",
    );
    expect(
      riderStatus({
        status: "accepted",
        rider_name: "Ben",
        rider_eta_minutes: 6,
      }).text,
    ).toBe("Ben arrives in about 6 min");
    expect(
      riderStatus({
        status: "accepted",
        rider_name: "Ben",
        rider_eta_minutes: null,
      }).text,
    ).toBe("Ben is on the way");
    expect(
      riderStatus({ status: "arrived_at_restaurant", rider_name: "Ben" }),
    ).toEqual({ text: "Ben is here for pickup", tone: "here" });
    expect(riderStatus({ status: "picked_up" })).toBeNull();
    expect(riderStatus(null)).toBeNull();
  });
});

describe("sortTickets", () => {
  it("puts late tickets first, oldest next, and ready ones last", () => {
    const t = (id, status, priority, created_at, ready_at) => ({
      order: { id, status, created_at, ready_at },
      priority,
    });
    const sorted = sortTickets([
      t(1, "preparing", "normal", "2026-01-01T10:00:00Z"),
      t(
        2,
        "ready_to_serve",
        "normal",
        "2026-01-01T09:00:00Z",
        "2026-01-01T10:05:00Z",
      ),
      t(3, "confirmed", "late", "2026-01-01T10:10:00Z"),
      t(4, "preparing", "normal", "2026-01-01T09:30:00Z"),
      t(
        5,
        "ready_to_serve",
        "normal",
        "2026-01-01T09:00:00Z",
        "2026-01-01T10:20:00Z",
      ),
    ]);
    expect(sorted.map((ticket) => ticket.order.id)).toEqual([3, 4, 1, 5, 2]);
  });

  it("puts pinned tickets above late ones, keeping the usual order among them", () => {
    const t = (id, priority, created_at, kitchen_pinned_at = null) => ({
      order: { id, status: "preparing", created_at, kitchen_pinned_at },
      priority,
    });
    const sorted = sortTickets([
      t(1, "late", "2026-01-01T09:00:00Z"),
      t(2, "normal", "2026-01-01T10:00:00Z", "2026-01-01T10:30:00Z"),
      t(3, "normal", "2026-01-01T09:30:00Z"),
      t(4, "soon", "2026-01-01T10:10:00Z", "2026-01-01T10:20:00Z"),
      {
        order: {
          id: 5,
          status: "ready_to_serve",
          created_at: "2026-01-01T08:00:00Z",
          ready_at: "2026-01-01T10:00:00Z",
          kitchen_pinned_at: "2026-01-01T09:00:00Z",
        },
        priority: "normal",
      },
    ]);
    expect(sorted.map((ticket) => ticket.order.id)).toEqual([4, 2, 1, 3, 5]);
  });
});
