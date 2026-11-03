import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("customer cart sits above the app tabs and still opens checkout", async ({
  page,
}) => {
  test.skip(page.viewportSize().width > 850, "Mobile cart layout");
  await page.route("**/api/v1/menu/items?*", (route) =>
    route.fulfill({
      json: {
        data: Array.from({ length: 4 }, (_, i) => ({
          id: 900 + i,
          name: `Mobile bowl ${i + 1}`,
          base_price: 120,
          description: "Freshly prepared rice bowl.",
          is_available: true,
          variants: [],
          addons: [],
          category: { id: 1, name: "Meals" },
        })),
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
  await page.goto("/menu");
  await expect(page.locator(".customer-service-strip")).toBeHidden();
  await expect(
    page.getByRole("textbox", { name: "Search dishes" }),
  ).toBeInViewport();
  await page
    .getByRole("button", { name: "Add to order", exact: true })
    .first()
    .click();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  // The cart is a round bubble above the tabs; tapping it opens the order.
  const cart = page.getByRole("button", { name: /^Open your order: 1 item/ });
  await expect(cart).toBeVisible();
  const cartBox = await cart.boundingBox(),
    tabs = await page
      .getByRole("navigation", { name: "App navigation", exact: true })
      .boundingBox();
  expect(cartBox.y + cartBox.height).toBeLessThanOrEqual(tabs.y - 8);
  await cart.click();
  const order = page.getByRole("complementary", {
    name: "Your order",
    exact: true,
  });
  await expect(order).toBeInViewport();
  await expect(
    order.getByRole("button", { name: /Place order/ }),
  ).toBeInViewport();
  // Swipe down, tap outside or Escape closes the sheet.
  await page.keyboard.press("Escape");
  await expect(order).toBeHidden();
});

for (const [role, path, label] of [
  ["administrator", "/admin/dashboard", "Home"],
  ["manager", "/admin/dashboard", "Home"],
  ["cashier", "/payments", "Collect"],
  ["kitchen_staff", "/kitchen", "Kitchen"],
  ["waiter", "/service", "Tables"],
  ["customer", "/menu", "Menu"],
]) {
  test(`${role} has a mobile task bar and searchable tools without losing desktop navigation`, async ({
    page,
  }, info) => {
    await page.goto("/login");
    await page
      .getByLabel("Email", { exact: true })
      .fill(`${role}@example.test`);
    await page
      .getByLabel("Password", { exact: true })
      .fill("Acceptance-Password-123!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator("#main-content")).toBeVisible();
    await page.goto(path);
    const nav = page.getByRole("navigation", {
      name: "App navigation",
      exact: true,
    });
    if (page.viewportSize().width > 850) {
      await expect(nav).toBeHidden();
      await expect(page.locator(".admin-sidebar,.app-sidebar")).toBeVisible();
      return;
    }
    await expect(nav).toBeVisible();
    await expect(
      nav.getByRole("link", { name: label, exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByRole("button", { name: "Open navigation", exact: true }),
    ).toBeHidden();
    await expect(page.locator(".admin-footer,.app-footer")).toBeHidden();
    expect(
      (await page.locator(".admin-topbar,.app-topbar").boundingBox()).height,
    ).toBeLessThanOrEqual(64);
    await expect(page.locator(".skeleton-grid")).toHaveCount(0);
    if (["administrator", "manager"].includes(role))
      await expect(page.locator(".admin-freshness")).toContainText("Updated");
    await page.screenshot({
      path: info.outputPath(`${role}-mobile.png`),
      fullPage: false,
    });
    if (["customer", "kitchen_staff", "waiter", "cashier"].includes(role)) {
      // These roles use the rider app layout: alerts and profile in the bar.
      await expect(
        nav.getByRole("button", { name: /alerts|notifications/i }),
      ).toBeVisible();
      await nav.getByRole("link", { name: "Profile", exact: true }).click();
      await expect(page).toHaveURL(/\/settings$/);
      const profile = page.getByRole("region", { name: "Your profile" });
      await expect(
        profile.getByRole("button", { name: "Sign out", exact: true }),
      ).toBeVisible();
      await profile
        .getByRole("link", { name: "Account & security", exact: true })
        .click();
      await expect(page).toHaveURL(/\/account$/);
      await expect(nav).toBeVisible();
      return;
    }
    await nav
      .getByRole("button", { name: "More tools and account", exact: true })
      .click();
    const menu = page.getByRole("dialog", {
      name: "Your workspace",
      exact: true,
    });
    await expect(menu).toBeVisible();
    const toolLinks = menu.getByRole("navigation", {
      name: "All workspace tools",
    });
    const primaryLinks = await nav
      .getByRole("link")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    for (const path of primaryLinks) {
      await expect(toolLinks.locator(`a[href="${path}"]`)).toHaveCount(0);
    }
    await menu
      .getByRole("searchbox", { name: "Find a tool", exact: true })
      .fill("Settings");
    await expect(
      menu
        .getByRole("navigation", { name: "All workspace tools" })
        .getByRole("link", { name: "Settings", exact: true }),
    ).toBeVisible();
    if (role !== "administrator")
      await expect(
        menu.getByRole("link", { name: "Team & access", exact: true }),
      ).toHaveCount(0);
    await menu.getByRole("searchbox").clear();
    await menu
      .getByRole("button", { name: "Switch to dark mode", exact: true })
      .click();
    await page.waitForTimeout(250);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`${role}-tools.png`),
      fullPage: false,
    });
    await menu
      .getByRole("button", { name: "Close workspace menu", exact: true })
      .click();
    await expect(menu).not.toBeVisible();
    await expect(
      nav.getByRole("button", { name: "More tools and account", exact: true }),
    ).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await nav
      .getByRole("button", { name: "More tools and account", exact: true })
      .click();
    await menu
      .getByRole("link", { name: "Account & security", exact: true })
      .click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(nav).toBeVisible();
  });
}

test("guest mobile navigation keeps menu, bookings and sign-in in thumb reach", async ({
  page,
}, info) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", {
    name: "Restaurant quick navigation",
  });
  if (page.viewportSize().width > 850) {
    await expect(nav).toBeHidden();
    return;
  }
  await expect(nav).toBeVisible();
  await expect(nav.getByRole("link")).toHaveCount(3);
  await nav.getByRole("link", { name: "Menu", exact: true }).click();
  await expect(page).toHaveURL(/#public-menu$/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("guest-mobile-menu.png"),
    fullPage: false,
  });
});
