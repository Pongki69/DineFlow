import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function audit(page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

test("administrator sets up a missing outlet and its saved pin appears on tracking", async ({
  page,
}, info) => {
  // Simulate an unconfigured outlet for each viewport; writes go to the disposable acceptance database.
  await page.route("**/api/v1/admin/delivery-policy", (route) =>
    route.fulfill({
      json: { data: { location: [], policy: { radius_km: 8 } } },
    }),
  );
  await page.route("**/api/v1/maps/search?*", (route) =>
    route.fulfill({
      json: {
        data: [
          {
            label: "Demo pickup entrance, Los Baños",
            latitude: 14.186648,
            longitude: 121.231433,
          },
        ],
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
  await page.goto("/admin/outlets");
  const setup = page.getByRole("heading", {
    name: "Set up your restaurant outlet",
    exact: true,
  });
  await expect(setup).toBeVisible();
  await expect(page.locator(".admin-form-status")).toHaveText("Setup needed");
  await expect(page.locator(".admin-page-heading .admin-badge")).toHaveText(
    "Pickup location not configured",
  );
  await expect(page.locator(".restaurant-map-pin")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".admin-save-bar")).toHaveAttribute(
    "data-state",
    "setup",
  );
  await audit(page);
  await page.screenshot({
    path: info.outputPath("outlet-setup-empty.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Switch to dark mode", exact: true })
    .click();
  await audit(page);
  await page
    .getByRole("button", { name: "Switch to light mode", exact: true })
    .click();

  await page.getByLabel("Find outlet address").fill("Demo pickup entrance");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page
    .getByRole("option", {
      name: "Demo pickup entrance, Los Baños",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Store address", { exact: true })).toHaveValue(
    "Demo pickup entrance, Los Baños",
  );
  await expect(page.getByLabel("Latitude", { exact: true })).toHaveValue(
    "14.186648",
  );
  await expect(page.getByLabel("Longitude", { exact: true })).toHaveValue(
    "121.231433",
  );
  await expect(page.locator(".restaurant-map-pin")).toBeVisible();
  await page
    .getByLabel("Outlet name", { exact: true })
    .fill("Demo pickup outlet");
  await page.getByLabel("Delivery radius", { exact: false }).fill("5");
  await page.getByRole("switch", { name: /Accept delivery orders/ }).uncheck();

  await page.route(
    "**/api/v1/admin/outlet-config",
    (route) =>
      route.fulfill({
        status: 503,
        json: {
          message: "Outlet settings are temporarily unavailable. Try again.",
        },
      }),
    { times: 1 },
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByText("Outlet settings are temporarily unavailable. Try again.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Outlet name", { exact: true })).toHaveValue(
    "Demo pickup outlet",
  );
  await expect(page.locator(".admin-save-bar")).toHaveAttribute(
    "data-state",
    "error",
  );
  const response = page.waitForResponse(
    (result) =>
      result.url().endsWith("/admin/outlet-config") &&
      result.request().method() === "PUT",
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  expect((await response).ok()).toBe(true);
  await expect(setup).toHaveCount(0);
  await expect(page.locator(".admin-page-heading .admin-badge")).toHaveText(
    "Outlet offline",
  );
  await page.unroute("**/api/v1/admin/delivery-policy");
  await page.reload();
  await expect(page.getByLabel("Outlet name", { exact: true })).toHaveValue(
    "Demo pickup outlet",
  );
  await expect(page.getByLabel("Latitude", { exact: true })).toHaveValue(
    "14.186648",
  );
  await expect(
    page.getByLabel("Delivery radius", { exact: false }),
  ).toHaveValue("5");
  await expect(
    page.getByRole("switch", { name: /Accept delivery orders/ }),
  ).not.toBeChecked();
  await expect(page.locator(".restaurant-map-pin")).toBeVisible();
  await audit(page);
  await page.screenshot({
    path: info.outputPath("outlet-setup-saved.png"),
    fullPage: true,
  });
  await page.goto("/admin/tracking");
  await expect(page.locator(".restaurant-map-pin")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Demo pickup outlet", exact: true }),
  ).toBeVisible();
  await audit(page);
  await page.goto("/admin/dashboard");
  await expect(
    page.getByRole("heading", { name: "Demo pickup outlet", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "Configure restaurant outlet",
      exact: true,
    }),
  ).toHaveText("Manage outlet");
  await audit(page);
});
