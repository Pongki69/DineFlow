import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function login(page) {
  await page.goto("/login");
  await page
    .getByLabel("Email", { exact: true })
    .fill("administrator@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Acceptance-Password-123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#main-content")).toBeVisible();
  await page.goto("/admin/dashboard");
  await expect(
    page.getByRole("heading", { name: "Operations overview", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Updated .*refreshes every 15s/)).toBeVisible();
}

async function navigate(page, name) {
  const menu = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await menu.isVisible()) {
    await menu.click();
    await page
      .getByRole("dialog", { name: "Navigation", exact: true })
      .getByRole("link", { name, exact: true })
      .click();
  } else
    await page
      .locator(".admin-sidebar")
      .getByRole("link", { name, exact: true })
      .click();
}

async function audit(page, fullscreen = false) {
  await expect(page.locator(".admin-map-loading")).toHaveCount(0);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(result.violations).toEqual([]);
  expect(
    await page.evaluate((expanded) => {
      const map = document.querySelector(".admin-map--fullscreen");
      return expanded
        ? map.scrollWidth <= map.clientWidth
        : document.documentElement.scrollWidth <= window.innerWidth;
    }, fullscreen),
  ).toBe(true);
}

async function readableDisabledButton(button) {
  await expect(button).toBeDisabled();
  await expect(button).toHaveCSS("opacity", "1");
  const contrast = await button.evaluate((element) => {
    const style = getComputedStyle(element);
    const luminance = (color) => {
      const channels = color
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map(Number)
        .map((channel) => {
          const value = channel / 255;
          return value <= 0.04045
            ? value / 12.92
            : ((value + 0.055) / 1.055) ** 2.4;
        });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const foreground = luminance(style.color),
      background = luminance(style.backgroundColor);
    return (
      (Math.max(foreground, background) + 0.05) /
      (Math.min(foreground, background) + 0.05)
    );
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
}

test("admin dashboard, dark mode, profile drawer and fleet work across screen sizes", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page);
  for (const [name, path] of [
    ["Dashboard", "/admin/dashboard"],
    ["Live delivery tracking", "/admin/tracking"],
    ["Restaurant outlets", "/admin/outlets"],
    ["Order management", "/admin/orders"],
    ["Rider fleet", "/admin/riders"],
    ["System settings", "/admin/system-settings"],
  ]) {
    await expect(
      page
        .locator(".admin-sidebar")
        .getByRole("link", { name, exact: true, includeHidden: true }),
    ).toHaveAttribute("href", path);
  }
  await expect(page.locator(".admin-sidebar .admin-navigation a")).toHaveCount(
    6,
  );
  const mobileMenu = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await mobileMenu.isVisible()) await mobileMenu.click();
  await page
    .getByRole("button", { name: "More restaurant tools", exact: true })
    .click();
  const tools = page.getByRole("dialog", {
    name: "Restaurant tools",
    exact: true,
  });
  await expect(tools).toBeVisible();
  await tools.getByRole("searchbox").fill("reports");
  await expect(
    tools.getByRole("link", { name: "Reports", exact: true }),
  ).toHaveAttribute("href", "/reports");
  await page.keyboard.press("Escape");
  await expect(tools).not.toBeVisible();
  await audit(page);
  await page.screenshot({
    path: info.outputPath("admin-dashboard.png"),
    fullPage: true,
  });
  const collapse = page.getByRole("button", { name: "Collapse sidebar" });
  if (await collapse.isVisible()) {
    await collapse.click();
    await expect(page.locator(".admin-shell")).toHaveClass(
      /admin-shell--collapsed/,
    );
    await page.getByRole("button", { name: "Expand sidebar" }).click();
  }
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator(".admin-shell")).toHaveAttribute(
    "data-theme",
    "dark",
  );
  await audit(page);
  await page.screenshot({
    path: info.outputPath("admin-dark.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Your account", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Your workspace", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Your account", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await navigate(page, "Rider fleet");
  await expect(
    page.getByRole("heading", { name: "Rider fleet", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await audit(page);
  await page.screenshot({
    path: info.outputPath("admin-fleet.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("active fleet filtering, delivery search and refresh failures retain usable data", async ({
  page,
}, info) => {
  const now = new Date().toISOString();
  const payload = {
    data: {
      metrics: {
        active_orders: 27,
        available_riders: 1,
        average_minutes: 18.5,
        delayed_deliveries: 1,
        active_deliveries: 2,
        awaiting_rider: 1,
        delivered_today: 34,
      },
      location: {
        name: "DineFlow · Main outlet",
        address: "Manila restaurant",
        latitude: 14.5995,
        longitude: 120.9842,
        is_active: true,
      },
      radius_km: 5,
      fleet: [
        {
          id: 101,
          name: "Alex Rivera",
          status: "available",
          latitude: 14.609,
          longitude: 120.985,
          located_at: now,
          active_deliveries: 0,
        },
        {
          id: 102,
          name: "Sam Reyes",
          status: "on_delivery",
          latitude: 14.59,
          longitude: 120.992,
          located_at: now,
          active_deliveries: 1,
        },
      ],
      deliveries: [
        {
          id: 901,
          status: "in_transit",
          rider: { name: "Sam Reyes" },
          estimated_arrival_at: new Date(Date.now() + 600000).toISOString(),
          order: {
            order_number: "DF-901",
            customer_name_snapshot: "Jamie Cruz",
            total: 450,
          },
        },
        {
          id: 902,
          status: "pending_assignment",
          rider: null,
          estimated_arrival_at: null,
          order: {
            order_number: "DF-902",
            customer_name_snapshot: "Robin Santos",
            total: 275,
          },
        },
      ],
      server_time: now,
    },
  };
  let failRefresh = false;
  await page.route("**/api/v1/admin/operations-overview", (route) =>
    failRefresh
      ? route.fulfill({
          status: 503,
          json: { message: "Updates temporarily unavailable" },
        })
      : route.fulfill({ json: payload }),
  );
  await login(page);
  await expect(page.locator(".admin-map-marker--available")).toHaveCount(1);
  await expect(page.locator(".admin-map-marker--on_delivery")).toHaveCount(1);
  await expect(
    page.getByRole("cell", { name: "DF-901", exact: true }),
  ).toBeVisible();
  await audit(page);
  await page.screenshot({
    path: info.outputPath("admin-active-operations.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "On delivery", exact: true }).click();
  await expect(page.locator(".admin-map-marker--available")).toHaveCount(0);
  await expect(page.locator(".admin-map-marker--on_delivery")).toHaveCount(1);
  await page
    .getByRole("searchbox", { name: "Search active deliveries" })
    .fill("DF-902");
  await expect(
    page.getByRole("cell", { name: "DF-901", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("cell", { name: "DF-902", exact: true }),
  ).toBeVisible();
  await navigate(page, "Live delivery tracking");
  await expect(
    page.getByRole("heading", { name: "Live delivery tracking", exact: true }),
  ).toBeVisible();
  const trackingMap = await page.locator(".admin-map").boundingBox();
  const trackingMetrics = await page.locator(".admin-metrics").boundingBox();
  expect(trackingMap.y).toBeLessThan(trackingMetrics.y);
  expect(trackingMap.height).toBeGreaterThanOrEqual(340);
  await expect(
    page.getByRole("link", { name: "Review dispatch", exact: true }),
  ).toHaveAttribute("href", "/admin/deliveries");
  await audit(page);
  await page.screenshot({
    path: info.outputPath("admin-live-tracking.png"),
    fullPage: true,
  });
  failRefresh = true;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(
    page.getByText("Updates interrupted · showing last loaded data"),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "DF-902", exact: true }),
  ).toBeVisible();
});

test("outlet coordinates, radius, hours and online status persist together", async ({
  page,
}, info) => {
  await login(page);
  await navigate(page, "Restaurant outlets");
  await expect(
    page.getByRole("heading", { name: "Restaurant outlets", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Outlet name", { exact: true })
    .fill("DineFlow · Main branch");
  await page
    .getByLabel("Store address", { exact: true })
    .fill("Manila restaurant entrance");
  await page.getByLabel("Latitude", { exact: true }).fill("14.5995");
  await page.getByLabel("Longitude", { exact: true }).fill("120.9842");
  await page.getByLabel("Delivery radius", { exact: false }).fill("5");
  await page
    .getByRole("combobox", { name: "monday schedule", exact: true })
    .selectOption("custom");
  await page.getByLabel("monday opening time", { exact: true }).fill("09:30");
  await page.getByLabel("monday closing time", { exact: true }).fill("21:15");
  await page
    .getByRole("combobox", { name: "sunday schedule", exact: true })
    .selectOption("closed");
  await expect(page.locator(".admin-save-bar")).toHaveAttribute(
    "data-state",
    "dirty",
  );
  await page.getByRole("button", { name: "Preview coverage" }).click();
  await page.getByRole("switch", { name: /Accept delivery orders/ }).uncheck();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Outlet settings saved" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeDisabled();
  await page.reload();
  await expect(page.getByLabel("Outlet name", { exact: true })).toHaveValue(
    "DineFlow · Main branch",
  );
  await expect(page.locator(".admin-save-bar")).toHaveAttribute(
    "data-pinned",
    "false",
  );
  await expect(page.locator(".admin-save-bar")).toHaveCSS("position", "static");
  await expect(
    page.getByLabel("Delivery radius", { exact: false }),
  ).toHaveValue("5");
  await expect(
    page.getByLabel("monday opening time", { exact: true }),
  ).toHaveValue("09:30");
  await expect(
    page.getByLabel("monday closing time", { exact: true }),
  ).toHaveValue("21:15");
  await expect(
    page.getByRole("combobox", { name: "sunday schedule", exact: true }),
  ).toHaveValue("closed");
  await expect(
    page.getByRole("switch", { name: /Accept delivery orders/ }),
  ).not.toBeChecked();
  await audit(page);
  await page.screenshot({
    path: info.outputPath("admin-outlets.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", {
      name: "Apply Monday’s hours to all days",
      exact: true,
    })
    .click();
  await expect(
    page.getByLabel("tuesday opening time", { exact: true }),
  ).toHaveValue("09:30");
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "tuesday schedule", exact: true }),
  ).toHaveValue("all_day");
  await expect(
    page.getByRole("combobox", { name: "sunday schedule", exact: true }),
  ).toHaveValue("closed");
  await page.getByRole("switch", { name: /Accept delivery orders/ }).check();
  await page
    .getByRole("combobox", { name: "monday schedule", exact: true })
    .selectOption("all_day");
  await page
    .getByRole("combobox", { name: "sunday schedule", exact: true })
    .selectOption("all_day");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Outlet settings saved" }),
  ).toBeVisible();
});

test("order management keeps preparation and payment controls inside responsive cards", async ({
  page,
}, info) => {
  const rows = [
    {
      id: 610,
      order_number: "DF-UI-610",
      order_type: "delivery",
      status: "pending",
      customer_name_snapshot: "Alexandra Rivera · Office reception",
      total: "610.00",
      created_at: new Date().toISOString(),
      prep_minutes: 15,
      delivery_vehicle_class: "motorcycle",
      items: [
        {
          quantity: 2,
          item_name_snapshot: "Chicken rice bowl",
          special_instructions: "Please pack the sauce separately",
        },
      ],
      payment_summary: { paid: "0.00", balance_due: "610.00", pending: "0.00" },
    },
  ];
  await page.route("**/api/v1/orders?*", (route) =>
    route.fulfill({ json: { data: rows } }),
  );
  await login(page);
  await navigate(page, "Order management");
  const card = page.getByRole("article", {
    name: "Order DF-UI-610",
    exact: true,
  });
  await expect(
    card.getByRole("button", { name: /Record cash.*610\.00/ }),
  ).toBeVisible();
  await card
    .getByRole("spinbutton", { name: "Prep time for DF-UI-610" })
    .fill("18");
  await card
    .getByRole("combobox", { name: "Vehicle needed for DF-UI-610" })
    .selectOption("car");
  expect(
    await card.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return [
        ...element.querySelectorAll(
          "button, input, select, .order-card-workbench",
        ),
      ].every((control) => {
        const box = control.getBoundingClientRect();
        return box.left >= bounds.left && box.right <= bounds.right + 1;
      });
    }),
  ).toBe(true);
  if (info.project.name === "desktop") {
    for (const filter of await page
      .locator(".order-filters input, .order-filters select")
      .all()) {
      expect((await filter.boundingBox()).width).toBeLessThanOrEqual(200);
    }
  }
  await audit(page);
  await page.screenshot({
    path: info.outputPath("admin-order-management.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await audit(page);
  await page.screenshot({
    path: info.outputPath("admin-order-management-dark.png"),
    fullPage: true,
  });
});

test("system settings has readable disabled actions, contextual links and a persistent save flow", async ({
  page,
}, info) => {
  await login(page);
  await navigate(page, "System settings");
  const name = page.getByRole("textbox", {
    name: "Restaurant name",
    exact: true,
  });
  await expect(name).toBeVisible();
  const originalName = await name.inputValue();
  const save = page.getByRole("button", {
    name: "Save business settings",
    exact: true,
  });
  await expect(page.locator(".business-settings-actions")).toHaveAttribute(
    "data-pinned",
    "false",
  );
  await expect(page.locator(".business-settings-actions")).toHaveCSS(
    "position",
    "static",
  );
  await readableDisabledButton(save);
  await expect(
    page.getByRole("link", { name: /Delivery settings/ }),
  ).toHaveAttribute("href", "/admin/delivery");
  await audit(page);
  await page.screenshot({
    path: info.outputPath("admin-system-settings.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await readableDisabledButton(save);
  await audit(page);
  await page.screenshot({
    path: info.outputPath("admin-system-settings-dark.png"),
    fullPage: true,
  });
  await name.fill(`${originalName} · Draft`);
  await expect(save).toBeEnabled();
  await expect(page.locator(".business-settings-actions")).toHaveAttribute(
    "data-pinned",
    "true",
  );
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(name).toHaveValue(originalName);
  await readableDisabledButton(save);
  await name.fill(`${originalName} · Updated`);
  await save.click();
  await expect(
    page.getByRole("status").filter({ hasText: "Business settings saved" }),
  ).toBeVisible();
  await page.reload();
  await expect(name).toHaveValue(`${originalName} · Updated`);
  await name.fill(originalName);
  await save.click();
  await expect(
    page.getByRole("status").filter({ hasText: "Business settings saved" }),
  ).toBeVisible();
});

for (const fallback of [false, true]) {
  test(`admin map fullscreen supports controls, Escape and outlet editing${fallback ? " without native fullscreen" : ""}`, async ({
    page,
  }, info) => {
    if (fallback) {
      await page.addInitScript(() => {
        Object.defineProperty(Element.prototype, "requestFullscreen", {
          value: undefined,
          configurable: true,
        });
      });
    }
    await login(page);
    const enter = page.getByRole("button", {
      name: "Enter fullscreen map",
      exact: true,
    });
    const dialog = page.getByRole("dialog", {
      name: "Fullscreen delivery map",
      exact: true,
    });
    await enter.click();
    await expect(dialog).toBeVisible();
    await page.screenshot({ path: info.outputPath("fullscreen-sizing.png") });
    await expect
      .poll(() =>
        dialog.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          const map = element
            .querySelector(".leaflet-container")
            .getBoundingClientRect();
          return {
            viewportWidth: Math.round(
              bounds.width - document.documentElement.clientWidth,
            ),
            viewportHeight: Math.round(
              bounds.height - document.documentElement.clientHeight,
            ),
            mapWidth: Math.round(map.width - bounds.width),
            mapHeight: Math.round(map.height - bounds.height),
          };
        }),
      )
      .toEqual({
        viewportWidth: 0,
        viewportHeight: 0,
        mapWidth: 0,
        mapHeight: 0,
      });
    if (fallback)
      expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
    await dialog
      .getByRole("button", { name: "Recenter on restaurant coverage" })
      .click();
    await dialog.getByRole("button", { name: "Zoom in", exact: true }).click();
    await page.screenshot({
      path: info.outputPath("admin-map-fullscreen.png"),
    });
    await audit(page, true);
    await dialog
      .getByRole("button", { name: "Exit fullscreen map", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(enter).toBeFocused();
    await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
    await enter.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(enter).toBeFocused();
    await navigate(page, "Restaurant outlets");
    await page
      .getByLabel("Outlet name", { exact: true })
      .fill("Fullscreen draft outlet");
    await enter.click();
    await expect(dialog).toBeVisible();
    await dialog
      .locator(".leaflet-container")
      .click({ position: { x: 160, y: 180 } });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByLabel("Outlet name", { exact: true })).toHaveValue(
      "Fullscreen draft outlet",
    );
    await expect(page.getByLabel("Latitude", { exact: true })).not.toHaveValue(
      "",
    );
    await expect(page.getByLabel("Longitude", { exact: true })).not.toHaveValue(
      "",
    );
    await expect(
      page.getByRole("button", { name: "Save changes", exact: true }),
    ).toBeEnabled();
  });
}
