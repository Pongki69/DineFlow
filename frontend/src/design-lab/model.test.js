import { describe, expect, it } from "vitest";
import { MOCK_ORDERS } from "../mocks/productionTestData";
import { money, orderDataset, previewRole, ROLE_LAYOUTS } from "./model";

describe("design preview isolation", () => {
  it("keeps the supplied dataset unchanged and uses a distinct synthetic ID namespace", () => {
    expect(orderDataset(false)).toBe(MOCK_ORDERS);
    const rows = orderDataset(true);
    expect(rows).toHaveLength(128);
    expect(new Set(rows.map((row) => row.id)).size).toBe(128);
    expect(rows[0].id).toBe("sample_0001");
    expect(rows[0].total).toBe(MOCK_ORDERS[0].total);
    expect(MOCK_ORDERS[0].id).toBe("ord_1001");
    expect(MOCK_ORDERS).toHaveLength(4);
  });
  it("only exposes the eight defined design views", () => {
    expect(Object.keys(ROLE_LAYOUTS)).toHaveLength(8);
    expect(previewRole("rider")).toBe("rider");
    expect(previewRole("__proto__")).toBe("landing");
    expect(previewRole("arbitrary-route")).toBe("landing");
    expect(previewRole(null)).toBe("landing");
  });
  it("labels the fixture currency explicitly without converting real PHP amounts", () => {
    expect(money(95.58)).toBe("$95.58");
    expect(money(0)).toBe("$0.00");
  });
});
