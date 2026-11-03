import { describe, expect, it } from "vitest";
import {
  RECEIPT_WIDTH,
  center,
  formatThermalReceipt,
  row,
  wrap,
} from "./thermalReceipt";

const receipt = {
  restaurant: {
    name: "DineFlow",
    address: "23 Hilario T. Apolinario Street, Los Baños, 4030 LG, Philippines",
    phone: "09850865725",
  },
  status: "paid",
  reference: "DEMO-PAY-007",
  order_number: "DEMO-007",
  order_type: "dine_in",
  table: "Table 6",
  method: "cash",
  amount: "1310.00",
  order_total: "1310.00",
  subtotal: "1260.00",
  cash_tendered: "1500.00",
  change: "190.00",
  paid_at: "2026-11-03T02:59:00Z",
  received_by: "Ben Villanueva",
  lines: [
    {
      quantity: 2,
      name: "Pancit Canton / Bihon Guisado Special Family Size",
      total: "1120.00",
      addons: ["Extra Egg (Fried or Poached)"],
      note: "No onions please",
    },
    {
      quantity: 1,
      name: "Mais con Yelo",
      variant: "Large",
      total: "140.00",
      addons: [],
    },
  ],
  charges: [{ name: "Service charge", total: "50.00" }],
};

describe("thermal receipt", () => {
  const text = formatThermalReceipt(receipt);
  const lines = text.split("\n");

  it("never goes past 40 characters and uses no tabs or markdown", () => {
    expect(Math.max(...lines.map((line) => line.length))).toBeLessThanOrEqual(
      RECEIPT_WIDTH,
    );
    expect(text).not.toMatch(/\t|\*\*|\|/);
  });

  it("right-aligns every price to the edge", () => {
    for (const label of ["Item Total", "Subtotal", "Change Due:"]) {
      const line = lines.find((l) => l.startsWith(label));
      expect(line.length).toBe(RECEIPT_WIDTH);
    }
    expect(lines.find((l) => l.startsWith("2x  Pancit")).length).toBe(
      RECEIPT_WIDTH,
    );
    expect(text).toContain("GRAND TOTAL");
    expect(
      lines.find((l) => l.startsWith("GRAND TOTAL")).endsWith("PHP 1,310.00"),
    ).toBe(true);
  });

  it("lists add-ons and notes under their dish, indented", () => {
    const at = lines.findIndex((l) => l.startsWith("2x  Pancit"));
    const after = lines.slice(at + 1, at + 5).join("\n");
    expect(after).toContain("  - Extra Egg");
    expect(after).toContain("  - Note: No onions please");
  });

  it("shows order type, payment, tendered and change", () => {
    expect(text).toMatch(/Order Type:\s+Dine-in/);
    expect(text).toMatch(/Payment Method:\s+Cash/);
    expect(text).toMatch(/Cash Received:\s+1,500\.00/);
    expect(text).toMatch(/Change Due:\s+190\.00/);
  });

  it("centres the header and footer", () => {
    const header = lines[0];
    const pad = header.length - header.trimStart().length;
    expect(
      Math.abs(pad - (RECEIPT_WIDTH - header.trim().length) / 2),
    ).toBeLessThanOrEqual(1);
    expect(lines.at(-1).trim()).toBe("Powered by DineFlow");
  });
});

describe("helpers", () => {
  it("wraps, centres and pads", () => {
    expect(
      wrap("a very long word supercalifragilisticexpialidocious", 10).every(
        (l) => l.length <= 10,
      ),
    ).toBe(true);
    expect(center("Hi")[0]).toBe(" ".repeat(19) + "Hi");
    expect(row("Total", "9.00")[0]).toHaveLength(RECEIPT_WIDTH);
  });
});
