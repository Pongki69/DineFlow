import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

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

test("rider status stays visible on every page and goes online only on request", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(90000);
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: 14.6,
    longitude: 120.98,
    accuracy: 10,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill("rider@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Acceptance-Password-123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const status = page.locator("#rider-presence-slot button");
  await expect(status).toHaveAccessibleName(
    "Rider status: Offline. Go online",
    { timeout: 12000 },
  );
  for (const name of [
    "My deliveries",
    "Delivery offers",
    "Delivery history",
    "Ratings & reviews",
    "Settings",
    "Dashboard",
  ]) {
    await navigate(page, name);
    await expect(status).toHaveAccessibleName(
      "Rider status: Offline. Go online",
    );
  }
  await page.getByRole("link", { name: "Your account", exact: true }).click();
  await expect(status).toBeVisible();
  await status.click();
  await expect(status).toHaveAccessibleName("Rider status: Online. Go offline");
  await navigate(page, "Settings");
  await expect(status).toHaveAccessibleName("Rider status: Online. Go offline");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(status).toBeInViewport();
  expect(
    (
      await new AxeBuilder({ page })
        .include(".app-topbar")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("rider-header-online.png"),
  });
  await status.click();
  await expect(status).toHaveAccessibleName("Rider status: Offline. Go online");
  await page.screenshot({
    path: testInfo.outputPath("rider-header-offline.png"),
  });
  expect(errors).toEqual([]);
});
