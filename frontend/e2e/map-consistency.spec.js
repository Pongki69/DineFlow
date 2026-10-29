import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const location = {
  name: "Demo restaurant",
  address: "Demo pickup entrance, Makati",
  latitude: 14.5547,
  longitude: 121.0244,
  is_active: true,
  opening_hours: {},
};

async function tileZoom(map) {
  return map.evaluate((element) => {
    const levels = [...element.querySelectorAll(".leaflet-tile-loaded")]
      .map((tile) => Number(tile.src.match(/\/(\d+)\/\d+\/\d+\.png/)?.[1]))
      .filter(Number.isFinite);
    return levels.length ? Math.max(...levels) : 0;
  });
}

async function waitForMapTiles(map) {
  await expect
    .poll(
      () =>
        map.evaluate((element) => {
          const tiles = [...element.querySelectorAll(".leaflet-tile")];
          return (
            tiles.length > 0 &&
            tiles.every(
              (tile) =>
                tile.classList.contains("leaflet-tile-loaded") &&
                getComputedStyle(tile).opacity === "1",
            )
          );
        }),
      { timeout: 15000 },
    )
    .toBe(true);
}

test("maps share storefront pins, wheel zoom, fullscreen and recenter controls", async ({
  page,
  context,
}, info) => {
  await page.route("**/api/v1/restaurant/location", (route) =>
    route.fulfill({ json: { data: location } }),
  );
  await page.route("**/api/v1/admin/delivery-policy", (route) =>
    route.fulfill({
      json: {
        data: {
          location,
          policy: {
            radius_km: 5,
            minimum_order: 0,
            base_fee: 40,
            per_km_fee: 5,
          },
        },
      },
    }),
  );
  await page.route("**/api/v1/admin/operations-overview", (route) =>
    route.fulfill({
      json: {
        data: {
          location,
          radius_km: 5,
          fleet: [
            {
              id: 77,
              name: "Demo Rider",
              status: "on_delivery",
              latitude: 14.56,
              longitude: 121.028,
              located_at: new Date().toISOString(),
              active_deliveries: 1,
            },
          ],
          deliveries: [],
          metrics: {
            active_orders: 0,
            available_riders: 0,
            active_deliveries: 0,
            delayed_deliveries: 0,
            awaiting_rider: 0,
            delivered_today: 0,
            average_minutes: null,
          },
          server_time: new Date().toISOString(),
        },
      },
    }),
  );
  await page.goto("/login");
  await page
    .getByLabel("Email", { exact: true })
    .fill("administrator@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Acceptance-Password-123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#main-content")).toBeVisible();
  for (const path of [
    "/admin/outlets",
    "/admin/dashboard",
    "/admin/tracking",
    "/admin/delivery",
    "/restaurant",
  ]) {
    if (path === "/restaurant") {
      await context.clearCookies();
      await page.goto("/login");
      await page
        .getByLabel("Email", { exact: true })
        .fill("customer@example.test");
      await page
        .getByLabel("Password", { exact: true })
        .fill("Acceptance-Password-123!");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page.locator("#main-content")).toBeVisible();
    }
    await page.goto(path);
    const map = page.locator(".leaflet-container.dineflow-map");
    await expect(map).toBeVisible();
    await expect(map.locator(".restaurant-map-pin svg")).toBeVisible();
    await expect(
      map.getByRole("button", { name: "Zoom in", exact: true }),
    ).toHaveCSS("width", "44px");
    const actions = map.locator(".dineflow-map-actions");
    await expect(actions.getByRole("button")).toHaveCount(2);
    await map.scrollIntoViewIfNeeded();
    if (path === "/admin/dashboard" || path === "/admin/tracking") {
      await waitForMapTiles(map);
      await page
        .locator(".admin-fleet-panel")
        .screenshot({
          path: info.outputPath(
            `${path.endsWith("dashboard") ? "dashboard" : "tracking"}-fleet-panel.png`,
          ),
        });
    }
    if (info.project.name === "desktop") {
      await expect
        .poll(() => tileZoom(map), { timeout: 15000 })
        .toBeGreaterThan(0);
      const before = await tileZoom(map);
      await map.hover({ position: { x: 150, y: 180 } });
      await page.mouse.wheel(0, -480);
      await expect
        .poll(() => tileZoom(map), { timeout: 15000 })
        .toBeGreaterThan(before);
      const zoomed = await tileZoom(map);
      await page.mouse.wheel(0, 480);
      await expect
        .poll(() => tileZoom(map), { timeout: 15000 })
        .toBeLessThan(zoomed);
    }
    const latitude = page.getByLabel("Latitude", { exact: true });
    const originalLatitude =
      path === "/admin/outlets" ? await latitude.inputValue() : null;
    const enter = map.getByRole("button", {
      name: "Enter fullscreen map",
      exact: true,
    });
    await enter.click();
    await expect
      .poll(() =>
        map.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return {
            width: Math.round(bounds.width - innerWidth),
            height: Math.round(bounds.height - innerHeight),
          };
        }),
      )
      .toEqual({ width: 0, height: 0 });
    await actions.getByRole("button").last().click();
    if (path === "/admin/outlets" || path === "/restaurant") {
      await waitForMapTiles(map);
      await page.screenshot({
        path: info.outputPath(
          `${path === "/restaurant" ? "restaurant" : "admin"}-fullscreen.png`,
        ),
      });
    }
    await page.keyboard.press("Escape");
    await expect(enter).toBeVisible();
    await expect(enter).toBeFocused();
    if (originalLatitude !== null)
      await expect(latitude).toHaveValue(originalLatitude);
    const audit = await new AxeBuilder({ page })
      .include(".leaflet-container")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(audit.violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  // Verify the same map UI also fills the viewport without the native fullscreen API.
  await page.evaluate(() =>
    Object.defineProperty(Element.prototype, "requestFullscreen", {
      configurable: true,
      value: undefined,
    }),
  );
  const enter = page.getByRole("button", {
    name: "Enter fullscreen map",
    exact: true,
  });
  await enter.click();
  const dialog = page.getByRole("dialog", {
    name: "Fullscreen map",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect
    .poll(() =>
      dialog.evaluate((element) =>
        Math.round(element.getBoundingClientRect().width - innerWidth),
      ),
    )
    .toBe(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(enter).toBeFocused();
});

test("customer tracking and rider route maps keep the same map controls and storefront pin", async ({
  page,
  context,
}, info) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const destination = {
    address: "Demo drop-off entrance",
    latitude: 14.56,
    longitude: 121.028,
    recipient_name: "Demo customer",
    phone: "09123456789",
  };
  await page.route("**/api/v1/my/deliveries/5", (route) =>
    route.fulfill({
      json: {
        data: {
          delivery_id: 5,
          order_number: "DEMO-MAP-5",
          status: "in_transit",
          order_status: "ready_to_serve",
          pickup: location,
          destination,
          history: [],
          order_history: [],
          tracking_stale: true,
        },
      },
    }),
  );
  await page.route("**/api/v1/rider/assignments*", (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: 5,
            status: "in_transit",
            proof_uploaded: false,
            history: [],
            order: {
              order_number: "DEMO-MAP-5",
              total: 100,
              status: "ready_to_serve",
              items: [],
              pickup: location,
              destination,
            },
          },
        ],
      },
    }),
  );
  await page.route("**/api/v1/rider/route-plan", (route) =>
    route.fulfill({
      json: {
        data: {
          stops: [],
          legs: [],
          missing_locations: [],
          route_unavailable: true,
        },
      },
    }),
  );
  await page.route("**/api/v1/rider/dispatch", (route) =>
    route.fulfill({
      json: {
        profile: { is_online: false },
        offers: [],
        enabled: true,
        server_time: new Date().toISOString(),
      },
    }),
  );
  for (const [role, path] of [
    ["customer", "/delivery/5/tracking"],
    ["rider", "/rider/deliveries"],
  ]) {
    await context.clearCookies();
    await page.goto("/login");
    await page
      .getByLabel("Email", { exact: true })
      .fill(`${role}@example.test`);
    await page
      .getByLabel("Password", { exact: true })
      .fill("Acceptance-Password-123!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator("#main-content")).toBeVisible();
    await page.goto(path);
    const map = page.locator(".leaflet-container.dineflow-map");
    await expect(map).toBeVisible();
    await expect(map.locator(".restaurant-map-pin svg")).toBeVisible();
    const enter = map.getByRole("button", {
      name: "Enter fullscreen map",
      exact: true,
    });
    await enter.click();
    await expect(map).toHaveAttribute("role", "dialog");
    await expect
      .poll(() =>
        map.evaluate((element) =>
          Math.round(element.getBoundingClientRect().width - innerWidth),
        ),
      )
      .toBe(0);
    await map.locator(".dineflow-map-actions button").last().click();
    await waitForMapTiles(map);
    await page.screenshot({ path: info.outputPath(`${role}-fullscreen.png`) });
    await map
      .getByRole("button", { name: "Exit fullscreen map", exact: true })
      .click();
    await expect(enter).toBeFocused();
    await expect(map).not.toHaveAttribute("role", "dialog");
  }
  expect(errors).toEqual([]);
});
