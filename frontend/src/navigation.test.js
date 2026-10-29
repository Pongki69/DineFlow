import { describe, expect, it } from "vitest";
import {
  visibleNavigation,
  navigationGroup,
  navigationContext,
} from "./navigation";

describe("role-driven navigation", () => {
  it("shows staff administration only when the API grants that permission", () => {
    expect(
      visibleNavigation(["dashboard.view", "users.manage"]).map(
        ([label]) => label,
      ),
    ).toContain("Team & access");
    expect(
      visibleNavigation(["dashboard.view"]).map(([label]) => label),
    ).not.toContain("Team & access");
  });

  it("keeps rider and customer navigation limited to granted capabilities", () => {
    expect(
      visibleNavigation(["deliveries.assigned"], ["rider"]).map(
        ([label]) => label,
      ),
    ).toEqual([
      "Dashboard",
      "My Deliveries",
      "Delivery offers",
      "Delivery history",
      "Ratings & reviews",
      "Settings",
    ]);
    expect(
      visibleNavigation(
        ["customer.account", "reservations.create"],
        ["customer"],
      ).map(([label]) => label),
    ).toEqual([
      "Browse menu",
      "Restaurant location",
      "Reserve a table",
      "My orders",
      "Settings",
    ]);
    expect(
      visibleNavigation(["customer.account"], ["administrator"]).map(
        ([label]) => label,
      ),
    ).toEqual(["Settings"]);
  });
});

describe("workspace structure", () => {
  it("separates current delivery work from records and account settings", () => {
    expect(navigationGroup("/rider/deliveries", ["rider"])).toBe(
      "Delivery work",
    );
    expect(navigationGroup("/rider/history", ["rider"])).toBe(
      "Records & feedback",
    );
    expect(navigationGroup("/settings", ["rider"])).toBe("Your account");
    expect(navigationGroup("/admin/deliveries", ["administrator"])).toBe(
      "Live operations",
    );
    expect(navigationGroup("/admin/delivery", ["administrator"])).toBe(
      "Restaurant setup",
    );
  });
  it("keeps delivery records connected to the accessible history page", () => {
    const links = visibleNavigation(["deliveries.assigned"], ["rider"]);
    expect(navigationContext("/rider/deliveries/42", links)).toEqual({
      title: "Delivery record",
      path: "/rider/history",
      parent: { title: "Delivery history", path: "/rider/history" },
    });
    expect(navigationContext("/rider/offers", links).parent).toBeUndefined();
  });
  it("never creates breadcrumbs to pages outside the granted navigation", () => {
    expect(navigationContext("/rider/deliveries/42", []).parent).toBeNull();
    const links = visibleNavigation(["customer.account"], ["customer"]);
    expect(navigationContext("/payments/42/receipt", links).parent.path).toBe(
      "/my-orders",
    );
    expect(navigationContext("/account", links).title).toBe(
      "Profile & security",
    );
  });
});
