import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("customer can confirm deletion in settings and loses access after deleting", async ({
  page,
}, info) => {
  const email = `delete-account-${info.project.name}@example.test`;
  const password = "Delete-Account-123!";
  await page.goto("/register");
  await page
    .getByLabel("Name", { exact: true })
    .fill("Disposable Deletion Test");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create customer account", exact: true })
    .click();
  await expect(page.locator("#main-content")).toBeVisible();
  await page.goto("/settings");
  const trigger = page.getByRole("button", {
    name: "Delete my account",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Delete your account?" });
  await expect(dialog).toBeVisible();
  await expect
    .poll(() =>
      dialog.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return Math.max(
          Math.abs(
            bounds.x +
              bounds.width / 2 -
              document.documentElement.clientWidth / 2,
          ),
          Math.abs(bounds.y + bounds.height / 2 - innerHeight / 2),
        );
      }),
    )
    // Native dialog positioning can include a reserved desktop scroll gutter.
    .toBeLessThan(16);
  const remove = dialog.getByRole("button", {
    name: "Permanently delete account",
    exact: true,
  });
  await expect(remove).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByLabel("Current password").fill("Incorrect-Password-123!");
  await dialog.getByRole("checkbox").check();
  await remove.click();
  await expect(
    dialog
      .getByText("Your current password is incorrect.", { exact: true })
      .last(),
  ).toBeVisible();
  await expect(dialog.getByLabel("Current password")).toHaveValue("");
  for (const theme of ["light", "dark"]) {
    if (theme === "dark") {
      await dialog.getByRole("button", { name: "Keep my account" }).click();
      await page.getByRole("button", { name: "Switch to dark mode" }).click();
      await trigger.click();
    }
    const result = await new AxeBuilder({ page })
      .include(".account-deletion-dialog")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      result.violations.map(({ id, nodes }) => ({
        id,
        targets: nodes.map((node) => node.target),
        details: nodes.map((node) => node.failureSummary),
      })),
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`${theme}-delete-account.png`),
      animations: "disabled",
    });
  }
  await dialog.getByLabel("Current password").fill(password);
  await dialog.getByRole("checkbox").check();
  await remove.click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByText("Your account has been deleted.", { exact: true }),
  ).toBeVisible();
  const me = await page.request.get("http://127.0.0.1:8091/api/v1/me");
  expect(me.status()).toBe(401);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByText("The provided credentials are incorrect.", { exact: true }),
  ).toBeVisible();
});
