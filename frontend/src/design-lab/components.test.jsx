// @vitest-environment jsdom
import React, { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import {
  Drawer,
  Pagination,
  ResponsiveDataTable,
  StatePanel,
  StatusBadge,
} from "./components";
import {
  MOCK_MENU_ITEMS,
  MOCK_ORDERS,
  MOCK_RESTAURANT_INFO,
  MOCK_TABLES,
  MOCK_USERS,
} from "../mocks/productionTestData";

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value() {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value() {
      this.removeAttribute("open");
    },
  });
});
afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
  document.body.style.paddingRight = "";
});

describe("supplied visual-test fixtures", () => {
  it("preserves the five supplied datasets and normalizes Markdown image links", () => {
    expect(MOCK_RESTAURANT_INFO).toMatchObject({
      currency: "USD",
      deliveryRadiusKm: 12.5,
      taxRate: 0.08,
      serviceChargeRate: 0.1,
    });
    expect(MOCK_USERS).toHaveLength(7);
    expect(MOCK_TABLES).toHaveLength(6);
    expect(MOCK_MENU_ITEMS).toHaveLength(5);
    expect(MOCK_ORDERS).toHaveLength(4);
    expect(MOCK_ORDERS[1]).toMatchObject({
      total: 102.2,
      status: "Delayed",
      paymentStatus: "Paid (PayMongo)",
    });
    for (const value of [
      ...MOCK_USERS.map((user) => user.avatar),
      ...MOCK_MENU_ITEMS.map((item) => item.image),
    ]) {
      expect(new URL(value).protocol).toBe("https:");
      expect(value).not.toContain("](");
    }
  });
});

describe("Pagination", () => {
  it("announces zero results without allowing invalid navigation", () => {
    const change = vi.fn();
    render(
      <Pagination
        page={0}
        pageSize={0}
        total={0}
        onPageChange={change}
        onPageSizeChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("0–0 of 0 orders");
    expect(
      screen.getByRole("button", { name: "Previous page" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Page 1" })).toBeDisabled();
    expect(change).not.toHaveBeenCalled();
  });

  it("keeps long page ranges bounded and requests only valid page changes", () => {
    const change = vi.fn();
    render(
      <Pagination
        page={10}
        pageSize={10}
        total={300}
        onPageChange={change}
        onPageSizeChange={vi.fn()}
      />,
    );
    expect(screen.getAllByText("…")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Page 10" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.queryByRole("button", { name: "Page 4" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    fireEvent.click(screen.getByRole("button", { name: "Page 10" }));
    expect(change.mock.calls).toEqual([[9], [11]]);
  });

  it("clamps a stale last page and resets the page after a size change", () => {
    const change = vi.fn();
    const size = vi.fn();
    render(
      <Pagination
        page={99}
        pageSize={10}
        total={24}
        onPageChange={change}
        onPageSizeChange={size}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("21–24 of 24 orders");
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Page 3" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    fireEvent.change(screen.getByLabelText("Rows per page"), {
      target: { value: "25" },
    });
    expect(size).toHaveBeenCalledWith(25);
    expect(change).toHaveBeenCalledWith(1);
  });
});

describe("StatusBadge", () => {
  it.each([
    ["ready_to_serve", "Ready to serve", "success"],
    ["PAID (PAYMONGO)", "Paid · PayMongo", "success"],
    ["in_transit", "In transit", "progress"],
    ["pending_assignment", "Awaiting rider", "pending"],
    ["Delayed", "Delayed", "danger"],
    ["", "Unknown", "neutral"],
  ])(
    "normalizes %s into readable text with an explicit semantic tone",
    (status, label, tone) => {
      const { container } = render(<StatusBadge status={status} />);
      expect(
        screen.getByText(label).closest(".df-status-badge"),
      ).toHaveAttribute("data-tone", tone);
      expect(container.querySelector("svg")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
    },
  );
});

describe("ResponsiveDataTable", () => {
  it("provides desktop table headers and contained mobile definitions with details callbacks", () => {
    const view = vi.fn();
    render(<ResponsiveDataTable orders={[MOCK_ORDERS[0]]} onView={view} />);
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("columnheader")).toHaveLength(8);
    expect(within(table).getByRole("rowheader")).toHaveTextContent("ord_1001");
    expect(within(table).getByText("$95.58")).toBeInTheDocument();
    fireEvent.click(
      within(table).getByRole("button", { name: "View order ord_1001" }),
    );
    expect(view).toHaveBeenCalledWith(MOCK_ORDERS[0]);
    const mobile = screen.getByRole("article", { name: "Order ord_1001" });
    expect(mobile.querySelector("dl")).not.toBeNull();
    expect(within(mobile).getByText("Dine-In · T-02")).toBeInTheDocument();
    fireEvent.click(
      within(mobile).getByRole("button", { name: "View order ord_1001" }),
    );
    expect(view).toHaveBeenCalledTimes(2);
  });

  it("handles loading, failure with retry, and an empty filtered result", () => {
    const retry = vi.fn();
    const { rerender } = render(
      <ResponsiveDataTable orders={[]} onView={vi.fn()} loading />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Loading orders");
    rerender(
      <ResponsiveDataTable
        orders={[]}
        onView={vi.fn()}
        error="Connection interrupted"
        onRetry={retry}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Connection interrupted",
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
    rerender(<ResponsiveDataTable orders={[]} onView={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("No matching orders");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("announces a successful action without using an error alert", () => {
    render(<StatePanel state="success" title="Draft order saved" />);
    expect(screen.getByRole("status")).toHaveTextContent("Draft order saved");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("Drawer", () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Open order
        </button>
        <Drawer
          open={open}
          onClose={() => setOpen(false)}
          title="Order details"
        >
          <p>Only sample data.</p>
          <button type="button">Last drawer action</button>
        </Drawer>
      </>
    );
  }

  it("uses a labelled modal, traps Tab, closes on Escape and restores trigger focus and scroll", () => {
    document.body.style.overflow = "auto";
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open order" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Order details" });
    expect(dialog).toHaveAttribute("open");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(document.body.style.overflow).toBe("hidden");
    const close = within(dialog).getByRole("button", {
      name: "Close Order details",
    });
    const last = within(dialog).getByRole("button", {
      name: "Last drawer action",
    });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("retains the title association across updates and restores scrolling on unmount", () => {
    const { rerender, unmount } = render(
      <Drawer open onClose={vi.fn()} title="Initial title">
        <input aria-label="Draft note" />
      </Drawer>,
    );
    const labelId = screen.getByRole("dialog").getAttribute("aria-labelledby");
    rerender(
      <Drawer open onClose={vi.fn()} title="Updated title" side="bottom">
        <input aria-label="Draft note" />
      </Drawer>,
    );
    expect(
      screen.getByRole("dialog", { name: "Updated title" }),
    ).toHaveAttribute("aria-labelledby", labelId);
    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
