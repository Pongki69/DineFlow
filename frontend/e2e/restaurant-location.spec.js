import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("restaurant location presents directions, contacts and a readable weekly schedule", async ({
  page,
  context,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.route("**/api/v1/restaurant/location", (route) =>
    route.fulfill({
      json: {
        data: {
          name: "Kuya Mario",
          address:
            "23 Hilario T. Apolinario Street, Los Baños, Laguna, Philippines",
          latitude: 14.184,
          longitude: 121.232,
          phone: "09850865725",
          contact_email: "panisales.alfonso.arc@gmail.com",
          opening_hours: {
            sunday: { closed: true },
            saturday: { closed: true },
            friday: { open: "08:00", close: "17:00" },
            monday: { open: "08:00", close: "17:00" },
            tuesday: { open: "08:00", close: "17:00" },
            wednesday: { open: "08:00", close: "17:00" },
            thursday: { open: "08:00", close: "17:00" },
          },
        },
      },
    }),
  );
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("customer@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Acceptance-Password-123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#main-content")).toBeVisible();
  await page.goto("/restaurant");
  await expect(
    page.getByRole("heading", { name: "Kuya Mario", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Get directions", exact: true }),
  ).toHaveAttribute("href", /destination=14.184,121.232/);
  await expect(page.getByRole("link", { name: /09850865725/ })).toHaveAttribute(
    "href",
    "tel:09850865725",
  );
  await expect(
    page.getByRole("link", { name: /panisales.alfonso.arc@gmail.com/ }),
  ).toHaveAttribute("href", "mailto:panisales.alfonso.arc@gmail.com");
  await expect(page.locator(".visit-hours dt")).toHaveText([
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ]);
  await expect(page.locator(".visit-hours dd").first()).toHaveText(
    "8:00 AM – 5:00 PM",
  );
  await page.getByRole("button", { name: "Copy address", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Address copied." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Center restaurant", exact: true })
    .click();
  expect(
    (
      await new AxeBuilder({ page })
        .include(".restaurant-visit")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.locator(".visit-map .leaflet-tile-loaded").first(),
  ).toBeVisible({ timeout: 10000 });
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.screenshot({
    path: testInfo.outputPath("restaurant-location.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("restaurant details recover from errors and handle a missing pin", async ({
  page,
}) => {
  let failed = true;
  await page.route("**/api/v1/restaurant/location", (route) =>
    failed
      ? route.fulfill({
          status: 503,
          json: { message: "Restaurant details unavailable." },
        })
      : route.fulfill({ json: { data: {} } }),
  );
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("customer@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Acceptance-Password-123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#main-content")).toBeVisible();
  await page.goto("/restaurant");
  await expect(
    page.getByText("Restaurant details unavailable.", { exact: true }),
  ).toBeVisible();
  failed = false;
  await page.getByRole("button", { name: /try again/i }).click();
  await expect(
    page.getByRole("heading", { name: "Location pin coming soon" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Get directions" })).toHaveCount(
    0,
  );
});
