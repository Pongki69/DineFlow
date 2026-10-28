const modules = [
  {
    key: "dashboard",
    label: "Dashboard",
    paths: ["/admin/dashboard", "/dashboard"],
  },
  {
    key: "tracking",
    label: "Live delivery tracking",
    paths: ["/admin/tracking", "/admin/deliveries"],
  },
  { key: "outlets", label: "Restaurant outlets", paths: ["/admin/outlets"] },
  {
    key: "orders",
    label: "Order management",
    paths: ["/admin/orders", "/orders"],
  },
  { key: "riders", label: "Rider fleet", paths: ["/admin/riders"] },
  {
    key: "settings",
    label: "System settings",
    paths: [
      "/admin/system-settings",
      "/admin/business-settings",
      "/admin/delivery",
      "/admin/payment-settings",
      "/admin/settings",
    ],
  },
];

// Use only routes already granted by the shared permission-based navigation.
export function adminNavigation(links) {
  const granted = new Set(links.map(([, , path]) => path));
  const primary = modules.flatMap((module) => {
    const path = module.paths.find((candidate) => granted.has(candidate));
    return path ? [{ ...module, path }] : [];
  });
  const consolidated = new Set(modules.flatMap((module) => module.paths));
  const tools = links.filter(
    ([, , path]) => !consolidated.has(path) && path !== "/settings",
  );
  return { primary, tools };
}

export function adminModuleForPath(pathname, primary) {
  return primary.find((module) => module.paths.includes(pathname)) || null;
}
