import { describe, expect, it } from "vitest";
import {
  arrivingSoon,
  bookingTables,
  floorCounts,
  seatedFor,
  tableName,
  tableShort,
} from "./waiterHelpers";

describe("table labels", () => {
  it("never doubles 'Table'", () => {
    expect(tableShort("Table 6")).toBe("6");
    expect(tableShort("Patio 2")).toBe("Patio 2");
    expect(tableName("Table 6")).toBe("Table 6");
    expect(tableName("6")).toBe("Table 6");
  });
});

describe("seatedFor", () => {
  const now = Date.parse("2026-11-02T12:00:00Z");
  it("reads like a person would say it", () => {
    expect(seatedFor("2026-11-02T11:18:00Z", now)).toBe("42 min");
    expect(seatedFor("2026-11-02T10:48:00Z", now)).toBe("1 h 12 min");
    expect(seatedFor("2026-11-02T10:00:00Z", now)).toBe("2 h");
    expect(seatedFor("2026-10-22T12:00:00Z", now)).toBe("11 days");
    expect(seatedFor(null, now)).toBe("");
  });
});

describe("floorCounts", () => {
  it("counts active tables by state and bill requests", () => {
    expect(
      floorCounts([
        { operational_status: "available" },
        { operational_status: "occupied", current_session: { bill_requested_at: "x" } },
        { operational_status: "occupied", current_session: {} },
        { operational_status: "cleaning", is_active: false },
      ]),
    ).toMatchObject({ all: 3, available: 1, occupied: 2, bill: 1 });
  });
});

describe("arrivingSoon", () => {
  const now = Date.parse("2026-11-02T12:00:00Z");
  it("keeps confirmed bookings from 30 minutes ago to 3 hours ahead", () => {
    const at = (minutes, status = "confirmed", id = minutes) => ({ id, status, starts_at: new Date(now + minutes * 60000).toISOString() });
    const list = arrivingSoon([at(90), at(-20), at(-45), at(200), at(10, "cancelled"), at(30, "checked_in")], now);
    expect(list.map((booking) => booking.id)).toEqual([-20, 30, 90]);
  });
  it("names the booked tables", () => {
    expect(bookingTables({ tables: [{ table_number: "Table 2" }, { table_number: "3" }] })).toBe("Table 2, Table 3");
    expect(bookingTables({})).toBe("No table yet");
  });
});
