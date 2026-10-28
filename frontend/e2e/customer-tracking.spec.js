import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("completed orders stay compact with keyboard-accessible progress, map and timeline", async ({
  page,
}, testInfo) => {
  const at = new Date().toISOString();
  await page.route("**/api/v1/my/deliveries/5", (route) =>
    route.fulfill({
      json: {
        data: {
          delivery_id: 5,
          order_number: "DF-COMPACT",
          status: "delivered",
          order_status: "completed",
          rider: { name: "Alex Rider" },
          rating: 5,
          pickup: {
            address: "Restaurant entrance",
            latitude: 14.6,
            longitude: 120.98,
          },
          destination: {
            address: "Customer home",
            latitude: 14.61,
            longitude: 120.99,
          },
          history: [{ id: 1, status: "delivered", at }],
          order_history: [{ id: 1, status: "completed", at }],
        },
      },
    }),
  );
  await page.route("**/api/v1/notifications", (route) =>
    route.fulfill({ json: { data: [] } }),
  );
  await page.route("https://*.tile.openstreetmap.org/**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e8eee9"/></svg>',
    }),
  );
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("customer@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Acceptance-Password-123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#main-content")).toBeVisible();
  await page.goto("/delivery/5/tracking");
  const rider = page.getByRole("region", { name: "Your rider", exact: true });
  await expect(rider.getByRole("status")).toHaveText("Delivered");
  await expect(rider).toContainText("Delivered by Alex Rider.");
  await expect(
    page.locator(".customer-progress-steps").first(),
  ).not.toBeVisible();
  await expect(page.locator(".customer-order-timeline ol")).not.toBeVisible();
  await expect(page.locator(".leaflet-container")).toHaveCount(0);
  for (const card of await page
    .locator(".customer-progress-grid .customer-progress-card")
    .all()) {
    expect((await card.boundingBox()).height).toBeLessThan(230);
  }
  expect(
    (
      await new AxeBuilder({ page })
        .include(".customer-tracking")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.screenshot({
    path: testInfo.outputPath("compact-order.png"),
    fullPage: true,
  });
  const progress = rider.locator("summary");
  await progress.focus();
  await page.keyboard.press("Enter");
  await expect(rider.locator(".customer-progress-steps")).toBeVisible();
  await page.locator(".customer-completed-map summary").click();
  await expect(
    page.getByRole("region", { name: "Completed delivery map" }),
  ).toBeVisible();
  await page.locator(".customer-order-timeline summary").click();
  await expect(page.locator(".customer-order-timeline ol")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("customers follow kitchen and rider progress without refreshing", async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const now = new Date().toISOString();
  const data = {
    delivery_id: 5,
    order_number: "DF-TRACKING",
    status: "accepted",
    order_status: "preparing",
    prep_ready_at: now,
    tracking_stale: false,
    rider: { id: 3, name: "Alex Rider" },
    pickup: {
      address: "Restaurant entrance",
      latitude: 14.6,
      longitude: 120.98,
    },
    destination: {
      address: "Customer home",
      latitude: 14.61,
      longitude: 120.99,
    },
    location: { latitude: 14.599, longitude: 120.981, recorded_at: now },
    history: [{ id: 1, status: "accepted", at: now }],
    order_history: [{ id: 1, status: "preparing", at: now }],
  };
  await page.route("**/api/v1/orders?*", (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: 12,
            order_number: data.order_number,
            order_type: "delivery",
            status: "preparing",
            total: 100,
            items: [],
            delivery: { id: 5, status: "accepted" },
            payment_summary: { paid: 100, balance_due: 0, pending: 0 },
          },
        ],
      },
    }),
  );
  await page.route("**/api/v1/my/deliveries/5", (route) =>
    route.fulfill({ json: { data } }),
  );
  await page.route("**/api/v1/notifications", (route) =>
    route.fulfill({ status: 503, json: { message: "Unavailable" } }),
  );
  await page.route("https://*.tile.openstreetmap.org/**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e8eee9"/></svg>',
    }),
  );
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("customer@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Acceptance-Password-123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#main-content")).toBeVisible();
  await page.goto("/my-orders");
  await page
    .getByRole("link", { name: "Track order & rider", exact: true })
    .click();
  const food = page.getByRole("region", { name: "Your food", exact: true });
  const rider = page.getByRole("region", { name: "Your rider", exact: true });
  await expect(food.getByRole("status")).toHaveText(
    "Kitchen is preparing your food",
  );
  await expect(rider.getByRole("status")).toHaveText(
    "Rider confirmed · heading to restaurant",
  );
  await expect(
    page.getByRole("img", { name: "Your delivery destination", exact: true }),
  ).toBeVisible();
  data.status = "arrived_at_restaurant";
  data.history.push({ id: 2, status: data.status, at: now });
  await expect(rider.getByRole("status")).toHaveText(
    "Rider arrived at the restaurant",
    { timeout: 8000 },
  );
  await expect(food.getByRole("status")).toHaveText(
    "Kitchen is preparing your food",
  );
  data.order_status = "ready_to_serve";
  data.order_history.push({ id: 2, status: data.order_status, at: now });
  await expect(food.getByRole("status")).toHaveText(
    "Food ready for rider pickup",
    { timeout: 8000 },
  );
  await expect(rider).toContainText("The rider will confirm pickup shortly.");
  expect(
    (
      await new AxeBuilder({ page })
        .include(".customer-tracking")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("customer-tracking.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  for (const [status, label] of [
    ["picked_up", "Rider picked up your food"],
    ["in_transit", "Rider is on the way"],
    ["delivered", "Delivered"],
  ]) {
    data.status = status;
    data.history.push({ id: data.history.length + 1, status, at: now });
    if (status === "delivered") {
      data.order_status = "completed";
      data.location = null;
    }
    await expect(rider.getByRole("status")).toHaveText(label, {
      timeout: 8000,
    });
  }
  await expect(food.getByRole("status")).toHaveText("Order completed");
  expect(errors).toEqual([]);
});
