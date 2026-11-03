import { describe, expect, it } from "vitest";
import { compactPeso, niceTicks, shareParts } from "./ReportCharts";

describe("report chart helpers", () => {
  it("makes round axis ticks that reach past the top value", () => {
    expect(niceTicks(16660)).toEqual([0, 5000, 10000, 15000, 20000]);
    expect(niceTicks(0)).toEqual([0]);
  });

  it("shortens peso amounts for the axis", () => {
    expect(compactPeso(0)).toBe("₱0");
    expect(compactPeso(2500)).toBe("₱2.5K");
    expect(compactPeso(15000)).toBe("₱15K");
    expect(compactPeso(1200000)).toBe("₱1.2M");
  });

  it("keeps slots fixed and folds unknown parts into Other", () => {
    const parts = shareParts(
      [
        { key: "delivery", label: "Delivery", value: 60 },
        { key: "dine_in", label: "Dine in", value: 30 },
        { key: "voucher", label: "Voucher", value: 10 },
        { key: "pickup", label: "Pickup", value: 0 },
      ],
      ["dine_in", "pickup", "delivery"],
    );
    expect(parts.map((p) => [p.key, p.slot])).toEqual([
      ["dine_in", 0],
      ["delivery", 2],
      ["other", "other"],
    ]);
    expect(parts[1].share).toBeCloseTo(0.6);
  });
});
