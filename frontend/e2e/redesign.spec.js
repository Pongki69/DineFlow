import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function login(page, role = "customer") {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(`${role}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Acceptance-Password-123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#main-content")).toBeVisible();
}

async function audit(page, soft = false, context = "") {
  await expect(page.locator(".skeleton-grid")).toHaveCount(0);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  const assertion = soft ? expect.soft : expect;
  assertion(result.violations, context).toEqual([]);
  assertion(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

test("saved restaurant branding keeps light brand colors readable", async ({
  page,
}) => {
  await page.route("**/api/v1/restaurant/branding", (route) =>
    route.fulfill({
      json: { data: { name: "Bright Kitchen", brand_color: "#ffff00" } },
    }),
  );
  await login(page);
  await expect(
    page.getByRole("heading", { name: "Demo Noodle Bowl" }),
  ).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveAttribute(
    "style",
    /--primary:/,
  );
  await page.getByRole("button", { name: "Add to order", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Place order", exact: true }),
  ).toBeVisible();
  await audit(page);
});

test("redesigned customer pages are accessible and navigation works with a keyboard", async ({
  page,
}, testInfo) => {
  const failures = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await audit(page);
  await page.screenshot({
    path: testInfo.outputPath("sign-in.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await login(page);
  await expect(
    page.getByRole("heading", { name: "Demo Noodle Bowl" }),
  ).toBeVisible();
  await audit(page);
  await page.screenshot({
    path: testInfo.outputPath("menu.png"),
    fullPage: true,
  });
  const menu = page.getByRole("button", { name: "Open navigation" });
  if (await menu.isVisible()) {
    await menu.click();
    await expect(
      page.getByRole("dialog", { name: "Navigation" }),
    ).toBeVisible();
    await audit(page);
    await page.keyboard.press("Escape");
    await expect(menu).toBeFocused();
    await expect(
      page.getByRole("dialog", { name: "Navigation" }),
    ).not.toBeVisible();
  } else {
    await expect(
      page.getByRole("link", { name: "Browse menu", exact: true }),
    ).toHaveAttribute("aria-current", "page");
  }
  for (const path of ["/my-orders", "/reserve", "/account"]) {
    await page.goto(path);
    await expect(page.locator("#main-content h1")).toBeVisible();
    await audit(page);
    await page.screenshot({
      path: testInfo.outputPath(`${path.slice(1)}.png`),
      fullPage: true,
    });
  }
  expect(failures).toEqual([]);
});

test("menu loading, empty results and retry states are actionable", async ({
  page,
}) => {
  await login(page);
  await page.route("**/api/v1/menu/items?**", (route) =>
    route.fulfill({ json: { data: [] } }),
  );
  await page.goto("/menu");
  await expect(page.getByText("The menu is getting ready")).toBeVisible();
  await audit(page);
  await page.route("**/api/v1/menu/items?**", (route) =>
    route.fulfill({
      status: 503,
      json: { message: "The kitchen connection is unavailable." },
    }),
  );
  await page.getByRole("button", { name: "Refresh menu", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "The kitchen connection is unavailable.",
  );
  await page.unroute("**/api/v1/menu/items?**");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Demo Noodle Bowl" }),
  ).toBeVisible();
});

test("catalog editing uses accessible fields and structured options", async ({
  page,
}) => {
  await login(page, "administrator");
  await page.goto("/admin/menu");
  await expect(
    page.getByRole("button", { name: "Add dish", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Add dish", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "A new favorite" });
  await expect(editor).toBeVisible();
  await editor.getByLabel("Dish name", { exact: true }).fill("Garden bowl");
  await editor
    .getByLabel("Category", { exact: true })
    .selectOption({ label: "Mains" });
  await editor.getByLabel("Base price (₱)", { exact: true }).fill("185");
  await editor.getByRole("button", { name: "Add size", exact: true }).click();
  await editor.getByLabel("Sizes name 1", { exact: true }).fill("Large");
  await editor.getByLabel("Extra price 1 (₱)", { exact: true }).fill("40");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  const submitted = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/v1/menu/items") &&
      request.method() === "POST",
  );
  await page.route("**/api/v1/menu/items", async (route) => {
    if (route.request().method() === "POST")
      await route.fulfill({ status: 201, json: { data: { id: 999 } } });
    else await route.continue();
  });
  await editor.getByRole("button", { name: "Add dish", exact: true }).click();
  expect((await submitted).postDataJSON()).toMatchObject({
    name: "Garden bowl",
    base_price: "185",
    variants: [{ name: "Large", price_adjustment: "40", is_active: true }],
  });
  await expect(editor).not.toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    "Your new dish is on the menu.",
  );
});

test("staff workspace remains readable and accessible across core operational screens", async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  await login(page, "administrator");
  for (const path of [
    "/dashboard",
    "/orders",
    "/reservations",
    "/payments",
    "/admin/menu",
    "/admin/users",
    "/admin/floor-plan",
    "/service",
    "/reports",
    "/cashier/summary",
    "/admin/audit",
    "/admin/settings",
    "/admin/payment-settings",
    "/admin/delivery",
    "/admin/business-settings",
    "/admin/deliveries",
  ]) {
    await page.goto(path);
    await expect(page.locator("#main-content h1")).toBeVisible();
    await audit(page, true, path);
    if (path === "/dashboard")
      await page.screenshot({
        path: testInfo.outputPath("overview.png"),
        fullPage: true,
      });
  }
});
