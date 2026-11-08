import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("mobile deliveries keeps the map primary with icon panels underneath", async ({
  page,
}, info) => {
  const outlet = {
    id: 1,
    name: "Kuya Mario",
    address: "Los Baños, Laguna",
    latitude: 14.1869,
    longitude: 121.2318,
  };
  const deliveries = [1, 2].map((id) => ({
    id,
    status: "accepted",
    history: [],
    order: {
      id,
      order_number: `DF-MOBILE-${id}`,
      status: "ready_to_serve",
      total: 320,
      items: [{ quantity: 1, item_name_snapshot: "Rice bowl" }],
      pickup: outlet,
      destination: {
        latitude: 14.19 + id * 0.002,
        longitude: 121.24,
        address: `Customer address ${id}`,
        recipient_name: `Customer ${id}`,
        recipient_phone: "09171234567",
      },
    },
  }));
  await page.route("**/api/v1/restaurant/location", (route) =>
    route.fulfill({ json: { data: outlet } }),
  );
  await page.route("**/api/v1/rider/assignments?*", (route) =>
    route.fulfill({
      json: { data: deliveries, delivery_order: [1, 2], next_delivery_id: 1 },
    }),
  );
  await page.route("**/api/v1/rider/route-plan", (route) =>
    route.fulfill({
      json: {
        data: {
          stops: deliveries.map((d) => ({
            ...d.order.destination,
            kind: "dropoff",
            delivery_id: d.id,
            order_numbers: [d.order.order_number],
          })),
          stores: [outlet],
          legs: [],
          distance_km: 3,
          duration_minutes: 10,
          missing_locations: [],
          route_unavailable: false,
        },
      },
    }),
  );
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("rider@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Acceptance-Password-123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#main-content")).toBeVisible();
  await page.goto("/rider/deliveries");
  const map = page.locator(".rider-route-map");
  await expect(map).toBeVisible();
  await map.evaluate((el) => (el.dataset.preservedMap = "yes"));
  const dock = page.getByRole("navigation", { name: "Delivery map panels" });
  if (page.viewportSize().width > 850) {
    await expect(dock).toBeHidden();
    await expect(
      page.locator(".rider-delivery-support .rider-current-outlet"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Enter fullscreen", exact: true }),
    ).toHaveCount(1);
    const queueItem = page
      .locator(".rider-delivery-lower-grid .rider-queue-item")
      .first();
    const grip = await queueItem.locator(".rider-queue-handle").boundingBox();
    const stopNumber = await queueItem
      .locator(".rider-queue-number")
      .boundingBox();
    expect(grip.x + grip.width).toBeLessThan(stopNumber.x);
    await expect(
      map.getByRole("button", { name: "Show my live location", exact: true }),
    ).toBeVisible();
    const selectedTitle = page.locator(
      ".rider-selected-workbench .rider-card-order-title",
    );
    await expect(selectedTitle).toBeVisible();
    await expect(selectedTitle).toHaveText("Order DF-MOBILE-1");
    expect((await selectedTitle.boundingBox()).width).toBeGreaterThan(100);
    await page
      .getByRole("button", { name: "Route order", exact: true })
      .click();
    const itinerary = page.getByRole("region", {
      name: "Route details and stop order",
    });
    await expect(
      itinerary.getByRole("button", { name: "Apply route order" }),
    ).toHaveCount(0);
    const firstStop = itinerary.getByRole("button", {
      name: "Show DF-MOBILE-1 on map",
    });
    const secondStop = itinerary.getByRole("button", {
      name: "Show DF-MOBILE-2 on map",
    });
    await secondStop.scrollIntoViewIfNeeded();
    const source = await secondStop.boundingBox();
    const target = await firstStop.boundingBox();
    await page.mouse.move(
      source.x + source.width / 2,
      source.y + source.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      target.x + target.width / 2,
      target.y + target.height / 2,
      { steps: 12 },
    );
    await page.mouse.up();
    await expect(itinerary.locator("ol > li").first()).toContainText(
      "DF-MOBILE-2",
    );
    const apply = itinerary.getByRole("button", { name: "Apply route order" });
    await expect(apply).toBeEnabled();
    const lastStop = await itinerary.locator("ol > li").last().boundingBox();
    expect((await apply.boundingBox()).y).toBeGreaterThan(
      lastStop.y + lastStop.height,
    );
    await page.screenshot({
      path: info.outputPath("desktop-route-order.png"),
      animations: "disabled",
    });
    return;
  }
  await expect(dock).toBeVisible();
  // With active work, phones open on the Delivery panel with its next step.
  await expect(
    dock.getByRole("button", { name: "Delivery", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".rider-selected-primary-action")).toBeInViewport();
  // Tapping the open panel again gives the full map back.
  await dock.getByRole("button", { name: "Delivery", exact: true }).click();
  await expect(dock.getByRole("button", { pressed: true })).toHaveCount(0);
  await expect
    .poll(async () => (await map.boundingBox()).height)
    .toBeGreaterThanOrEqual(320);
  const bounds = await map.boundingBox();
  expect(bounds.height).toBeGreaterThanOrEqual(320);
  expect(bounds.y).toBeLessThan(330);
  await expect(
    page.getByRole("complementary", { name: "Current restaurant outlet" }),
  ).toBeHidden();
  // The panel sheet rises 20px over the map's bottom edge, but never higher.
  expect((await dock.boundingBox()).y).toBeGreaterThanOrEqual(
    bounds.y + bounds.height - 24,
  );
  await expect(
    page.getByRole("region", { name: "Route details and stop order" }),
  ).toBeHidden();
  // Delivery and Stops; reordering lives in Stops, live location on the map.
  await expect(dock.getByRole("button")).toHaveCount(2);
  await expect(
    map.getByRole("button", { name: "Show my live location", exact: true }),
  ).toBeVisible();
  await dock.getByRole("button", { name: /Stops/ }).click();
  await expect(
    page.getByRole("heading", { name: "Your delivery queue", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Reorder DF-MOBILE-1/ }),
  ).toBeVisible();
  await dock.getByRole("button", { name: "Delivery", exact: true }).click();
  await expect(page.locator(".rider-selected-workbench")).toBeVisible();
  await dock.getByRole("button", { name: /Stops/ }).click();
  await expect(
    page.getByRole("heading", { name: "Your delivery queue", exact: true }),
  ).toBeVisible();
  await expect(map).toBeVisible();
  await page.locator(".rider-delivery-queue-row").nth(1).click();
  await expect(
    dock.getByRole("button", { name: "Delivery", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".rider-selected-workbench")).toContainText(
    "DF-MOBILE-2",
  );
  await map
    .getByRole("button", { name: "Enter fullscreen map", exact: true })
    .click();
  await expect(page.locator(".rider-route-planner")).toHaveClass(/is-expanded/);
  // Fullscreen Stops uses the same stop list as the page.
  const fullscreen = page.getByRole("dialog", { name: "Route & tracking" });
  await fullscreen
    .getByRole("navigation", { name: "Delivery map panels" })
    .getByRole("button", { name: /Stops/ })
    .click();
  await expect(
    fullscreen.getByRole("button", { name: /^Reorder DF-MOBILE-1/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Exit fullscreen", exact: true })
    .click();
  await expect(page.locator(".rider-route-planner")).not.toHaveClass(
    /is-expanded/,
  );
  await expect(map).toHaveAttribute("data-preserved-map", "yes");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("mobile-map-light.png"),
    fullPage: true,
  });
  const appNav = page.getByRole("navigation", { name: "Rider app navigation" });
  await appNav.getByRole("link", { name: "Profile", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Rider profile shortcuts" })
    .getByRole("button", { name: "Switch to dark mode" })
    .click();
  await appNav.getByRole("link", { name: "Deliveries", exact: true }).click();
  await expect(map).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveAttribute(
    "data-theme",
    "dark",
  );
  await page.waitForTimeout(250);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(result.violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("mobile-map-dark.png"),
    fullPage: true,
  });
});
