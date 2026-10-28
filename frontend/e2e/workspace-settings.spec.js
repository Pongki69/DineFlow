import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function login(page, role) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(`${role}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Acceptance-Password-123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#main-content")).toBeVisible();
}

async function navigate(page, name) {
  let menu = page.locator(".app-sidebar");
  if (!(await menu.isVisible())) {
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    menu = page.locator(".mobile-nav-dialog");
  }
  await menu.getByRole("link", { name, exact: true }).click();
}

for (const role of [
  "customer",
  "rider",
  "kitchen_staff",
  "waiter",
  "cashier",
  "manager",
  "administrator",
]) {
  test(`${role} can save workspace preferences and access their account settings`, async ({
    page,
  }, testInfo) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/v1/notifications", (route) =>
      route.fulfill({ json: { data: [], unread_count: 12 } }),
    );
    await login(page, role);
    await navigate(page, "Settings");
    await expect(
      page.getByRole("heading", { name: "Settings", exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Start page", { exact: false })
      .selectOption("/settings");
    await page
      .getByRole("checkbox", { name: /Compact layout/ })
      .setChecked(true);
    await page
      .getByRole("checkbox", { name: /Reduce motion/ })
      .setChecked(true);
    await page
      .getByRole("checkbox", { name: /Unread notification badge/ })
      .setChecked(false);
    await page
      .getByRole("button", { name: "Save preferences", exact: true })
      .click();
    await expect(
      page.getByText("Preferences saved.", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".app-shell")).toHaveAttribute(
      "data-density",
      "compact",
    );
    await expect(page.locator(".app-shell")).toHaveAttribute(
      "data-motion",
      "reduced",
    );
    await expect(page.locator(".notification-count")).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole("checkbox", { name: /Compact layout/ }),
    ).toBeChecked();
    await expect(
      page.getByRole("checkbox", { name: /Unread notification badge/ }),
    ).not.toBeChecked();
    if (role === "rider")
      await expect(
        page.getByRole("combobox", { name: "Vehicle", exact: true }),
      ).toBeVisible();
    if (role === "administrator")
      await expect(
        page.getByRole("heading", { name: "Restaurant controls" }),
      ).toBeVisible();
    if (role === "kitchen_staff")
      await expect(
        page.getByRole("link", { name: "Business settings", exact: true }),
      ).toHaveCount(0);
    await page.locator(".workspace-security > summary").click();
    await expect(
      page.getByLabel("Current password", { exact: true }),
    ).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .include(".workspace-settings")
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.locator(".workspace-security > summary").click();
    if (["rider", "customer", "administrator"].includes(role)) {
      await page.evaluate(() => {
        document.activeElement?.blur();
        window.scrollTo({ top: 0, behavior: "instant" });
      });
      await page.screenshot({
        path: testInfo.outputPath(`${role}-settings.png`),
        fullPage: true,
      });
    }
    await page.goto("/login");
    await expect(page).toHaveURL(/\/settings$/);
    expect(errors).toEqual([]);
  });
}

test("rider dashboard, deliveries, offers and history share one GPS session", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    window.gpsWatches = 0;
    window.gpsStops = 0;
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        watchPosition(success) {
          window.gpsWatches += 1;
          setTimeout(
            () =>
              success({
                coords: { latitude: 14.6, longitude: 120.98, accuracy: 10 },
              }),
            0,
          );
          return 37;
        },
        clearWatch() {
          window.gpsStops += 1;
        },
      },
    });
  });
  await login(page, "rider");
  await page.goto("/settings");
  await page
    .getByRole("combobox", { name: "Vehicle", exact: true })
    .selectOption("motorcycle");
  await page
    .getByRole("button", { name: "Save rider details", exact: true })
    .click();
  await expect(
    page.getByText("Rider details saved.", { exact: true }),
  ).toBeVisible();
  await navigate(page, "Dashboard");
  await expect(page.getByRole("heading", { name: /Welcome,/ })).toBeVisible();
  await expect(page.locator(".rider-metrics")).toBeVisible();
  await page.getByRole("button", { name: "Go online", exact: true }).click();
  await expect(
    page.getByText("Online · GPS active", { exact: true }),
  ).toBeVisible();
  await navigate(page, "Delivery offers");
  await expect(
    page.getByRole("heading", { name: "Delivery offers", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Go offline", exact: true }),
  ).toBeVisible();
  await navigate(page, "My deliveries");
  await expect(
    page.getByRole("heading", { name: "My deliveries", exact: true }),
  ).toBeVisible();
  await navigate(page, "Delivery history");
  await expect(
    page.getByRole("heading", { name: "Delivery history", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.gpsWatches)).toBe(1);
  expect(await page.evaluate(() => window.gpsStops)).toBe(0);
  await page.getByRole("button", { name: "Go offline", exact: true }).click();
  await expect(page.getByText("You’re offline", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.gpsStops)).toBe(1);
  await navigate(page, "Dashboard");
  await expect(page.locator(".rider-metrics")).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .include("#main-content")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.screenshot({
    path: testInfo.outputPath("rider-dashboard.png"),
    fullPage: true,
  });
});
