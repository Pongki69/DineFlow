// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { DatePicker } from "./DatePicker";
afterEach(cleanup);
function Picker() {
  const [value, setValue] = useState("2026-10-24");
  return (
    <DatePicker
      label="From"
      value={value}
      min="2026-10-20"
      max="2026-10-30"
      onChange={setValue}
    />
  );
}
it("respects range bounds, selects a day, and returns focus without submitting a form", () => {
  render(<Picker />);
  const trigger = screen.getByRole("button", { name: "From", exact: true });
  fireEvent.click(trigger);
  expect(screen.getByRole("button", { name: "Oct 19, 2026" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Oct 31, 2026" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Oct 25, 2026" }));
  expect(trigger).toHaveTextContent("Oct 25, 2026");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(trigger).toHaveFocus();
});
it("supports keyboard day navigation, Escape and clearing", () => {
  render(<Picker />);
  const trigger = screen.getByRole("button", { name: "From", exact: true });
  fireEvent.click(trigger);
  const selected = screen.getByRole("button", { name: "Oct 24, 2026" });
  expect(selected).toHaveFocus();
  fireEvent.keyDown(selected, { key: "ArrowRight" });
  expect(screen.getByRole("button", { name: "Oct 25, 2026" })).toHaveFocus();
  fireEvent.keyDown(document.activeElement, { key: "Escape" });
  expect(trigger).toHaveFocus();
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole("button", { name: "Clear date" }));
  expect(trigger).toHaveTextContent("Select date");
});
