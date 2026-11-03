import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("rider mobile app navigation reaches work, activity and profile without desktop chrome", async ({
  page,
}, info) => {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("rider@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Acceptance-Password-123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#main-content")).toBeVisible();
  await page.goto("/rider");
  const nav = page.getByRole("navigation", { name: "Rider app navigation" });
  if (page.viewportSize().width > 850) {
    await expect(nav).toBeHidden();
    await expect(page.locator(".app-sidebar")).toBeVisible();
    return;
  }
  await expect(nav).toBeVisible();
  await expect(nav.getByRole("link")).toHaveCount(5);
  await expect(
    nav.getByRole("link", { name: "Home", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  expect(
    (await page.locator(".app-topbar").boundingBox()).height,
  ).toBeLessThanOrEqual(64);
  await expect(
    page.getByRole("button", { name: "Open navigation", exact: true }),
  ).toBeHidden();
  await expect(page.locator(".app-footer")).toBeHidden();
  await nav.getByRole("link", { name: "Offers", exact: true }).click();
  await expect(page).toHaveURL(/\/rider\/offers$/);
  await expect(
    nav.getByRole("link", { name: "Offers", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("heading", { name: "Nearby delivery offers", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("mobile-offers.png"),
    fullPage: false,
  });
  // Past deliveries open from Deliveries; Activity is no longer a tab.
  await nav.getByRole("link", { name: "Deliveries", exact: true }).click();
  await page.getByRole("link", { name: "Past deliveries" }).click();
  await expect(
    page.getByRole("heading", { name: "Delivery history", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("searchbox")).toBeVisible();
  await nav.getByRole("link", { name: "Profile", exact: true }).click();
  const shortcuts = page.getByRole("navigation", {
    name: "Rider profile shortcuts",
  });
  await expect(shortcuts).toBeVisible();
  // Sign out is its own full-width button in the profile card.
  await expect(
    page
      .getByRole("region", { name: "Your profile" })
      .getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
  // The page scrolls, and its last control clears the bottom nav.
  await page.evaluate(() =>
    window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }),
  );
  const signOut = await page
    .getByRole("region", { name: "Your profile" })
    .getByRole("button", { name: "Sign out", exact: true })
    .boundingBox();
  const bottom = await nav.boundingBox();
  expect(signOut.y + signOut.height).toBeLessThanOrEqual(bottom.y + 1);
  await shortcuts
    .getByRole("link", { name: "Account & security", exact: true })
    .click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(
    nav.getByRole("link", { name: "Profile", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await nav.getByRole("link", { name: "Profile", exact: true }).click();
  await shortcuts.getByRole("button", { name: "Switch to dark mode" }).click();
  await page.waitForTimeout(250);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("mobile-profile.png"),
    fullPage: false,
  });
});
