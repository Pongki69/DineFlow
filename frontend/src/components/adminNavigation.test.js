import { describe, expect, it } from "vitest";
import { adminModuleForPath, adminNavigation } from "./adminNavigation";

const link = (path, label = path) => [label, "granted", path];
const allPaths = [
  "/admin/dashboard",
  "/dashboard",
  "/admin/tracking",
  "/admin/deliveries",
  "/admin/outlets",
  "/admin/orders",
  "/orders",
  "/admin/riders",
  "/admin/system-settings",
  "/admin/business-settings",
  "/admin/delivery",
  "/admin/payment-settings",
  "/admin/settings",
  "/settings",
  "/reports",
  "/payments",
  "/admin/users",
  "/admin/audit",
];

describe("consolidated admin navigation", () => {
  it("keeps one entry per module and exposes unique tools without duplicate aliases", () => {
    const result = adminNavigation(allPaths.map((path) => link(path)));
    expect(result.primary).toHaveLength(6);
    expect(result.tools.map(([, , path]) => path)).toEqual([
      "/reports",
      "/payments",
      "/admin/users",
      "/admin/audit",
    ]);
    expect(new Set(result.primary.map(({ path }) => path)).size).toBe(6);
  });

  it("uses the accessible legacy route when its newer module is not granted", () => {
    const result = adminNavigation([
      link("/dashboard"),
      link("/orders"),
      link("/reports"),
    ]);
    expect(result.primary.map(({ path }) => path)).toEqual([
      "/dashboard",
      "/orders",
    ]);
    expect(result.tools.map(([, , path]) => path)).toEqual(["/reports"]);
    expect(adminNavigation([])).toEqual({ primary: [], tools: [] });
  });

  it("connects legacy pages to their canonical module without granting another route", () => {
    const { primary } = adminNavigation(allPaths.map((path) => link(path)));
    expect(adminModuleForPath("/orders", primary)?.key).toBe("orders");
    expect(adminModuleForPath("/admin/deliveries", primary)?.key).toBe(
      "tracking",
    );
    expect(adminModuleForPath("/admin/delivery", primary)?.key).toBe(
      "settings",
    );
    expect(adminModuleForPath("/dashboard", primary)?.key).toBe("dashboard");
    expect(adminModuleForPath("/reports", primary)).toBeNull();
  });

  it("keeps newly granted supporting tools discoverable automatically", () => {
    const result = adminNavigation([
      link("/admin/future-tool", "Future tool"),
      link("/settings"),
    ]);
    expect(result.tools).toEqual([link("/admin/future-tool", "Future tool")]);
  });
});
