import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const initialPassword = "Feedback-Password-123!";
async function defaultBrand(page) {
  await page.route("**/api/v1/restaurant/branding", (route) =>
    route.fulfill({
      json: { data: { name: "DineFlow", brand_color: "#245440" } },
    }),
  );
}
async function audit(page, info, name) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth + 1),
  );
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    result.violations.map(({ id, nodes }) => ({
      id,
      targets: nodes.map((node) => node.target),
    })),
  ).toEqual([]);
  await page.screenshot({
    path: info.outputPath(`${name}-${info.project.name}.png`),
    fullPage: true,
    animations: "disabled",
  });
}
async function register(page, info, suffix) {
  await page.goto("/register");
  await page
    .getByLabel("Name", { exact: true })
    .fill("Password Feedback Preview");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`password-feedback-${suffix}-${info.project.name}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill(initialPassword);
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill(initialPassword);
  await page
    .getByRole("button", { name: "Create customer account", exact: true })
    .click();
  await expect(page.locator("#main-content")).toBeVisible();
}

test("registration checks missing requirements and changing confirmation before creating an account", async ({
  page,
}, info) => {
  await defaultBrand(page);
  const submissions = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname.endsWith("/register")
    )
      submissions.push(request);
  });
  await page.goto("/register");
  await page
    .getByLabel("Name", { exact: true })
    .fill("Signup Feedback Preview");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`password-feedback-signup-${info.project.name}@example.test`);
  const password = page.getByLabel("Password", { exact: true });
  const confirmation = page.getByLabel("Confirm password", { exact: true });
  await password.fill("LongPassword123");
  await confirmation.fill("LongPassword123");
  await expect(page.locator(".password-live-status")).toContainText(
    "a symbol or space",
  );
  await page
    .getByRole("button", { name: "Create customer account", exact: true })
    .click();
  expect(submissions).toHaveLength(0);
  await password.fill(initialPassword);
  await expect(
    page.getByText("Passwords do not match.", { exact: true }),
  ).toBeVisible();
  await audit(page, info, "registration-mismatch");
  await confirmation.fill(initialPassword);
  await expect(
    page.getByText("Passwords match.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".password-live-status")).toHaveText(
    "Password meets all requirements.",
  );
  await page
    .getByRole("button", { name: "Create customer account", exact: true })
    .click();
  await expect(page.locator("#main-content")).toBeVisible();
  expect(submissions).toHaveLength(1);
  if (info.project.name === "desktop")
    await expect(
      page.locator(".app-sidebar .workspace-restaurant"),
    ).toHaveCount(0);
  else {
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    await expect(
      page.locator(".mobile-nav-dialog .workspace-restaurant"),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Close navigation", exact: true })
      .click();
  }
});

test("account changes allow name-only saves and validate password changes with current-password protection", async ({
  page,
}, info) => {
  await defaultBrand(page);
  await register(page, info, "account");
  await page.goto("/account");
  const patches = [];
  page.on("request", (request) => {
    if (
      request.method() === "PATCH" &&
      new URL(request.url()).pathname.endsWith("/me")
    )
      patches.push(request);
  });
  await page
    .getByLabel("Name", { exact: true })
    .fill("Updated Feedback Preview");
  await page.getByRole("button", { name: "Save account", exact: true }).click();
  await expect(
    page.getByText("Account updated.", { exact: true }),
  ).toBeVisible();
  expect(patches).toHaveLength(1);
  const password = page.getByLabel("New password", { exact: true });
  const confirmation = page.getByLabel("Confirm new password", { exact: true });
  await password.fill("Changed-Password-456!");
  await confirmation.fill("Different-Password-456!");
  await expect(
    page.getByText("Passwords do not match.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save account", exact: true }).click();
  expect(patches).toHaveLength(1);
  await confirmation.fill("Changed-Password-456!");
  await page.getByRole("button", { name: "Save account", exact: true }).click();
  expect(patches).toHaveLength(1);
  await expect(
    page.getByLabel("Current password", { exact: true }),
  ).toBeFocused();
  await audit(page, info, "account-matching");
  await page
    .getByRole("button", { name: "Switch to dark mode", exact: true })
    .click();
  await audit(page, info, "account-matching-dark");
  await page
    .getByRole("button", { name: "Switch to light mode", exact: true })
    .click();
  await page
    .getByLabel("Current password", { exact: true })
    .fill(initialPassword);
  const response = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      new URL(response.url()).pathname.endsWith("/me"),
  );
  await page.getByRole("button", { name: "Save account", exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(password).toHaveValue("");
  await expect(confirmation).toHaveValue("");
  await expect(page.getByText("Passwords match.", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByLabel("Current password", { exact: true }),
  ).not.toHaveAttribute("required", "");
});

test("staff creation shares live checks and the admin sidebar omits the duplicate brand box", async ({
  page,
}, info) => {
  await defaultBrand(page);
  await page.goto("/login");
  await page
    .getByLabel("Email", { exact: true })
    .fill("administrator@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Acceptance-Password-123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#main-content")).toBeVisible();
  await page.goto("/admin/users");
  await expect(
    page.getByRole("heading", { name: "Team & access", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".admin-workspace-tag")).toHaveCount(0);
  const form = page.locator(".staff-form");
  await form
    .getByLabel("Name", { exact: true })
    .fill(`Password Preview ${info.project.name}`);
  await form
    .getByLabel("Email", { exact: true })
    .fill(`password-feedback-staff-${info.project.name}@example.test`);
  await form
    .getByLabel("Temporary password", { exact: true })
    .fill(initialPassword);
  await form
    .getByLabel("Confirm password", { exact: true })
    .fill("Mismatch-Password-123!");
  await expect(
    page.getByText("Passwords do not match.", { exact: true }),
  ).toBeVisible();
  await form.getByLabel("Role", { exact: true }).selectOption("rider");
  await audit(page, info, "staff-mismatch");
  await form
    .getByLabel("Confirm password", { exact: true })
    .fill(initialPassword);
  await expect(
    page.getByText("Passwords match.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create staff account", exact: true })
    .click();
  await expect(
    page.getByText("Staff account created.", { exact: true }),
  ).toBeVisible();
  await expect(
    form.getByLabel("Temporary password", { exact: true }),
  ).toHaveValue("");
});

test("password reset gives the same feedback while invalid reset tokens remain rejected by the server", async ({
  page,
}, info) => {
  await page.goto(
    "/reset-password?token=invalid-preview-token&email=customer%40example.test",
  );
  await page.getByLabel("Password", { exact: true }).fill(initialPassword);
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("Mismatch-Password-123!");
  await expect(
    page.getByText("Passwords do not match.", { exact: true }),
  ).toBeVisible();
  await audit(page, info, "reset-mismatch");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill(initialPassword);
  await expect(
    page.getByText("Passwords match.", { exact: true }),
  ).toBeVisible();
  const response = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith("/reset-password") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  expect((await response).status()).toBe(422);
  await expect(page.getByRole("alert")).toBeVisible();
});
