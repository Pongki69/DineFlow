import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const [role, path] of [
  ["rider", "/rider/history"],
  ["customer", "/my-orders"],
  ["administrator", "/admin/dashboard"],
]) {
  test(`${role} uses the shared type and control scale across screen sizes`, async ({
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
    await expect(page.locator("#main-content h1").first()).toBeAttached();
    const titleSizes = [];
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const title = page.locator("#main-content h1").first();
      titleSizes.push(
        await title.evaluate((node) =>
          parseFloat(getComputedStyle(node).fontSize),
        ),
      );
      expect(titleSizes.at(-1)).toBeGreaterThanOrEqual(26);
      expect(titleSizes.at(-1)).toBeLessThanOrEqual(36);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const controls = await page
        .locator(
          "#main-content .ui-button:visible, #main-content .admin-button:visible",
        )
        .evaluateAll((nodes) =>
          nodes.map((node) => ({
            name: node.textContent.trim(),
            size: parseFloat(getComputedStyle(node).fontSize),
            height: node.getBoundingClientRect().height,
            wraps: node.scrollWidth <= node.clientWidth + 1,
          })),
        );
      // The admin desktop (1024px+, mouse) uses 40px controls; touch screens
      // and smaller viewports keep the 48px target.
      const minimumHeight = role === "administrator" && width >= 1024 ? 40 : 48;
      for (const control of controls) {
        expect(control.size, control.name).toBeGreaterThanOrEqual(14);
        expect(control.height, control.name).toBeGreaterThanOrEqual(
          minimumHeight,
        );
        expect(control.wraps, control.name).toBe(true);
      }
      await page.screenshot({
        path: info.outputPath(`${role}-${width}.png`),
        fullPage: false,
      });
    }
    expect(titleSizes[2]).toBeGreaterThan(titleSizes[0]);
    expect(
      (
        await new AxeBuilder({ page })
          .include("#main-content")
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  });
}
