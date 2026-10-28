import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("customers manage presets before ordering and checkout loads their default", async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let orders = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/v1/orders"))
      orders++;
  });
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
        },
      },
    }),
  );
  await page.route("https://*.tile.openstreetmap.org/**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e8eee4"/></svg>',
    }),
  );
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("customer@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Acceptance-Password-123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#main-content")).toBeVisible();
  await page.goto("/account");
  const book = page.getByRole("region", {
    name: "Saved delivery addresses",
    exact: true,
  });
  const label = `Home ${testInfo.project.name}`;
  await book.getByRole("button", { name: "Add address", exact: true }).click();
  await book
    .getByLabel("Search address or landmark")
    .fill("Entrance Street Manila");
  await book.getByLabel("Search address or landmark").press("Enter");
  await book
    .getByRole("button", { name: "123 Entrance Street, Manila", exact: true })
    .click();
  await book.getByRole("button", { name: "Confirm this drop-off pin" }).click();
  await book.getByLabel("Address name", { exact: true }).fill(label);
  await book.getByLabel("Phone", { exact: true }).fill("09123456789");
  await book.getByLabel("Use as my default delivery address").check();
  await book
    .getByRole("button", { name: "Save address for next time" })
    .click();
  const card = book.getByRole("article", { name: `${label} delivery address` });
  await expect(card).toContainText("Default");
  expect(orders).toBe(0);
  await book
    .getByRole("button", { name: `Edit ${label}`, exact: true })
    .click();
  await expect(
    book.getByRole("button", { name: "Drop-off pin confirmed" }),
  ).toBeDisabled();
  await book
    .getByLabel("Drop-off instructions (optional)")
    .fill("Call at the blue gate");
  await book.getByRole("button", { name: "Update saved address" }).click();
  await expect(card).toContainText("Call at the blue gate");
  await page.reload();
  await expect(card).toContainText("Default");
  expect(
    (
      await new AxeBuilder({ page })
        .include("#delivery-addresses")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await book.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("saved-addresses.png") });
  await page.goto("/menu");
  await page.getByRole("button", { name: "Add to order", exact: true }).click();
  await page.getByLabel("Order type", { exact: true }).selectOption("delivery");
  await expect(page.locator(".delivery-destination-card")).toContainText(
    "123 Entrance Street, Manila",
  );
  await expect(page.locator(".delivery-destination-estimate")).toContainText(
    "45",
  );
  await expect(
    page.getByRole("button", { name: "Place order", exact: true }),
  ).toBeEnabled();
  expect(orders).toBe(0);
  await page.goto("/account");
  await book
    .getByRole("button", { name: `Delete ${label}`, exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Delete saved address?" });
  await dialog
    .getByRole("button", { name: "Delete address", exact: true })
    .click();
  await expect(card).toHaveCount(0);
  expect(errors).toEqual([]);
});
