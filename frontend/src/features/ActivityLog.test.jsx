// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { activityDay, groupByDay } from "./ActivityLog.jsx";
import { visibleNavigation } from "../navigation";

describe("activity days", () => {
  const now = new Date(2026, 10, 3, 15, 0);
  it("names today and yesterday", () => {
    expect(activityDay(new Date(2026, 10, 3, 9, 0), now)).toBe("Today");
    expect(activityDay(new Date(2026, 10, 2, 23, 0), now)).toBe("Yesterday");
    expect(activityDay(new Date(2026, 9, 30, 12, 0), now)).toMatch(/Oct/);
  });
  it("keeps entries in order, one group per day", () => {
    const groups = groupByDay([
      { id: 3, created_at: new Date(2026, 10, 3, 14).toISOString() },
      { id: 2, created_at: new Date(2026, 10, 3, 9).toISOString() },
      { id: 1, created_at: new Date(2026, 10, 1, 20).toISOString() },
    ]);
    expect(groups.map((group) => group.entries.map((e) => e.id))).toEqual([
      [3, 2],
      [1],
    ]);
  });
});

describe("My activity in the menu", () => {
  it("is offered to staff, not to customers", () => {
    const paths = (roles) =>
      visibleNavigation([], roles).map(([, , path]) => path);
    expect(paths(["cashier"])).toContain("/activity");
    expect(paths(["customer"])).not.toContain("/activity");
  });
});
