import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function signIn(page, remember) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("customer@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Acceptance-Password-123!");
  if (remember) await page.getByLabel("Remember me", { exact: true }).check();
  const request = page.waitForRequest((request) =>
    request.url().endsWith("/api/v1/login"),
  );
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  expect((await request).postDataJSON().remember).toBe(remember);
  await expect(page.locator("#main-content")).toBeVisible();
}

test("remembered access survives a lost session and sign-out removes it", async ({
  page,
  context,
}) => {
  await signIn(page, true);
  const cookies = await context.cookies();
  const remembered = cookies.find((cookie) =>
    cookie.name.startsWith("remember_web_"),
  );
  expect(remembered).toBeDefined();
  expect(remembered.httpOnly).toBe(true);
  expect(remembered.expires).toBeGreaterThan(Date.now() / 1000 + 29 * 86400);
  await context.clearCookies({ name: "dineflow_session" });
  await page.reload();
  await expect(page.locator("#main-content")).toBeVisible();
  const signOut = page.getByRole("button", { name: "Sign out", exact: true });
  if (!(await signOut.isVisible()))
    await page.getByRole("button", { name: "Open navigation" }).click();
  await signOut.click();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  expect(
    (await context.cookies()).some((cookie) =>
      cookie.name.startsWith("remember_web_"),
    ),
  ).toBe(false);
  await context.clearCookies({ name: "dineflow_session" });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
});

test("ordinary login has no persistent remember cookie and the controls are accessible", async ({
  page,
  context,
}) => {
  await page.goto("/login");
  await expect(
    page.getByLabel("Remember me", { exact: true }),
  ).not.toBeChecked();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  await signIn(page, false);
  expect(
    (await context.cookies()).some((cookie) =>
      cookie.name.startsWith("remember_web_"),
    ),
  ).toBe(false);
  await context.clearCookies({ name: "dineflow_session" });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
});
