import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("saved outlet stays linked across rider and customer workspaces", async ({
  page,
  context,
}, info) => {
  let outlet = {
    name: "Linked Bay Outlet",
    address: "Demo pickup entrance, Bay, Laguna",
    latitude: 14.190892,
    longitude: 121.2811701,
    is_active: true,
    opening_hours: {},
  };
  await page.route("**/api/v1/restaurant/location", (route) =>
    route.fulfill({ json: { data: outlet, location_version: outlet.name } }),
  );
  await page.route("**/api/v1/rider/assignments?*", (route) =>
    route.fulfill({ json: { data: [], delivery_order: [] } }),
  );
  await page.route("**/api/v1/rider/route-plan", (route) =>
    route.fulfill({
      json: {
        data: {
          stores: [{ ...outlet, key: "saved-outlet", is_primary: true }],
          stops: [],
          legs: [],
          missing_locations: [],
          distance_km: null,
          duration_minutes: null,
          return_to_store: true,
        },
      },
    }),
  );
  await page.route("**/api/v1/rider/dispatch", (route) =>
    route.fulfill({ json: { data: { is_online: false, offers: [] } } }),
  );
  async function login(email) {
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page
      .getByLabel("Password", { exact: true })
      .fill("Acceptance-Password-123!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator("#main-content")).toBeVisible();
  }
  await login("rider@example.test");
  await page.goto("/rider/deliveries");
  const card = page.getByRole("complementary", {
    name: "Current restaurant outlet",
  });
  await expect(card).toContainText(outlet.name);
  await expect(card.getByRole("link")).toHaveAttribute(
    "href",
    /14\.190892,121\.2811701/,
  );
  await expect(
    page.locator('.restaurant-map-pin[title="Linked Bay Outlet"]'),
  ).toBeVisible();
  outlet = {
    ...outlet,
    name: "Updated Bay Outlet",
    address: "Updated demo entrance, Bay, Laguna",
    latitude: 14.192,
    longitude: 121.283,
  };
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(card).toContainText(outlet.name);
  await expect(card.getByRole("link")).toHaveAttribute(
    "href",
    /14\.192,121\.283/,
  );
  await expect(
    page.locator('.restaurant-map-pin[title="Updated Bay Outlet"]'),
  ).toBeVisible();
  await expect(
    page.locator('.restaurant-map-pin[title="Linked Bay Outlet"]'),
  ).toHaveCount(0);
  const audit = await new AxeBuilder({ page })
    .include(".rider-current-outlet")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("rider-linked-outlet.png"),
    fullPage: true,
  });
  await context.clearCookies();
  await page.goto("/");
  await expect(
    page.getByText(outlet.address, { exact: true }).first(),
  ).toBeVisible();
  await login("customer@example.test");
  await page.goto("/restaurant");
  await expect(
    page.getByRole("heading", { name: outlet.name, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Get directions" }),
  ).toHaveAttribute("href", /14\.192,121\.283/);
  await expect(
    page.locator('.restaurant-map-pin[title="Updated Bay Outlet"]'),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("customer-linked-outlet.png"),
    fullPage: true,
  });
});
