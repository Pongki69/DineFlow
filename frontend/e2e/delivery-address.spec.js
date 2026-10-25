import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("delivery address guidance, pin confirmation and cancel work on desktop and mobile", async ({
  page,
}, testInfo) => {
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.route("**/api/v1/maps/search?*", (route) =>
    route.fulfill({
      json: {
        data: [
          {
            label: "123 Entrance Street, Manila",
            latitude: 14.6,
            longitude: 120.99,
          },
        ],
      },
    }),
  );
  await page.route("**/api/v1/delivery/quote", (route) =>
    route.fulfill({
      json: {
        data: {
          delivery_fee: 45,
          distance_km: 2.5,
          duration_minutes: 12,
          meets_minimum: true,
          minimum_order: 0,
        },
      },
    }),
  );
  // Exercise map layout without depending on external tile servers in acceptance tests.
  await page.route("https://*.tile.openstreetmap.org/**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e8eee4"/></svg>',
    }),
  );
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill("customer@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Acceptance-Password-123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#main-content")).toBeVisible();
  const browse = page.getByRole("link", { name: "Browse menu", exact: true });
  if (!(await browse.isVisible()))
    await page.getByRole("button", { name: "Open navigation" }).click();
  await browse.click();
  await page.getByRole("button", { name: "Add to order", exact: true }).click();
  await page.getByLabel("Order type", { exact: true }).selectOption("delivery");
  await page
    .getByRole("button", { name: "Choose delivery address", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Where should we deliver?" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("list", { name: "Delivery address steps" }),
  ).toBeVisible();
  const useAddress = dialog.getByRole("button", {
    name: "Use this address",
    exact: true,
  });
  await expect(useAddress).toBeDisabled();
  await dialog
    .getByLabel("Search address or landmark")
    .fill("Entrance Street Manila");
  await dialog.getByLabel("Search address or landmark").press("Enter");
  await dialog
    .getByRole("button", { name: "123 Entrance Street, Manila", exact: true })
    .click();
  await expect(
    dialog.getByLabel("Delivery address", { exact: true }),
  ).toHaveValue("123 Entrance Street, Manila");
  await dialog
    .getByRole("button", { name: "Confirm this drop-off pin" })
    .click();
  await dialog
    .getByLabel("Recipient", { exact: true })
    .fill("Portfolio Customer");
  await dialog.getByLabel("Phone", { exact: true }).fill("09123456789");
  await expect(useAddress).toBeEnabled();
  const accessibility = await new AxeBuilder({ page })
    .include(".delivery-destination-dialog")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  const bounds = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await dialog.locator(".delivery-destination-body").evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.screenshot({
    path: testInfo.outputPath("delivery-address.png"),
    fullPage: false,
  });
  await useAddress.click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".delivery-destination-card")).toContainText(
    "123 Entrance Street, Manila",
  );
  await page.getByRole("button", { name: "Change delivery address" }).click();
  await dialog
    .getByLabel("Delivery address", { exact: true })
    .fill("Discard this edit");
  await dialog.getByRole("button", { name: "Close delivery address" }).click();
  await expect(page.locator(".delivery-destination-card")).toContainText(
    "123 Entrance Street, Manila",
  );
  await expect(page.locator(".delivery-destination-card")).not.toContainText(
    "Discard this edit",
  );
  expect(browserErrors).toEqual([]);
});
