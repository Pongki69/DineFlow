import { expect, it } from "vitest";
import { bookingTime } from "./bookingTime";

it("converts restaurant wall-clock time independently of the visitors timezone", () => {
  expect(bookingTime("2026-10-25", "18:00", "Asia/Manila")).toBe(
    "2026-10-25T10:00:00.000Z",
  );
  expect(bookingTime("2026-10-25", "18:00", "UTC")).toBe(
    "2026-10-25T18:00:00.000Z",
  );
  expect(() => bookingTime("2026-03-08", "02:30", "America/New_York")).toThrow(
    "does not exist",
  );
});
