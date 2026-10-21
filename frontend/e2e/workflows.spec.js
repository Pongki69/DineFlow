import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) => {
    throw error;
  });
});

async function navigate(page, label) {
  const link = page.getByRole("link", { name: label, exact: true });
  if (!(await link.isVisible()))
    await page.getByRole("button", { name: "Open navigation" }).click();
  await link.click();
}

async function login(page, role = "customer") {
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill(`${role}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Acceptance-Password-123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#main-content")).toBeVisible();
}

test("sign-in is accessible and customers can place a pickup order and edit their profile", async ({
  page,
}) => {
  await page.goto("/");
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await login(page);
  await navigate(page, "Browse menu");
  await expect(
    page.getByRole("heading", { name: "Demo Noodle Bowl" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add to order", exact: true }).click();
  await page.getByRole("button", { name: "Place order", exact: true }).click();
  await expect(page.getByText(/Order DF.*placed/)).toBeVisible();
  await navigate(page, "My orders");
  await expect(
    page.getByText("Demo Noodle Bowl", { exact: false }).first(),
  ).toBeVisible();
  await navigate(page, "My account");
  await page
    .getByLabel("Name", { exact: true })
    .fill("Updated Portfolio Customer");
  await page.getByRole("button", { name: "Save account" }).click();
  await expect(page.getByRole("status")).toHaveText("Account updated.");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test("customers can reserve a table with the accessible two-dimensional view", async ({
  page,
}, testInfo) => {
  await login(page);
  await navigate(page, "Reserve a table");
  const date = new Date();
  date.setDate(date.getDate() + (testInfo.project.name === "mobile" ? 3 : 2));
  await page
    .getByLabel("Date", { exact: true })
    .fill(date.toISOString().slice(0, 10));
  await page.getByRole("button", { name: "Accessible 2D view" }).click();
  await page.getByRole("button", { name: "3D view", exact: true }).click();
  await expect(page.locator("canvas")).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Accessible 2D view" }).click();
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.getByRole("button", { name: /T1.*Seats 4/ }).click();
  await page
    .getByRole("button", { name: "Confirm reservation", exact: true })
    .click();
  await expect(page.locator(".reservation-confirmation")).toContainText(
    "confirmed",
  );
});

test("kitchen navigation does not expose financial or administrator workspaces", async ({
  page,
}) => {
  await login(page, "kitchen_staff");
  if (await page.getByRole("button", { name: "Open navigation" }).isVisible())
    await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("link", { name: "Kitchen queue" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Team & access" })).toHaveCount(
    0,
  );
  await page.goto("/admin/users");
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
});
