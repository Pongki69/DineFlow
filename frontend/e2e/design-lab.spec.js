import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const views = [
  "landing",
  "administrator",
  "manager",
  "cashier",
  "kitchen_staff",
  "waiter",
  "rider",
  "customer",
];

async function assertNoPageOverflow(page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    ),
  ).toBe(true);
}

for (const view of views) {
  test(`${view} responsive layout, light/dark accessibility and screenshot`, async ({
    page,
  }, testInfo) => {
    const failures = [];
    page.on("pageerror", (error) => failures.push(error.message));
    await page.goto(`/design-lab.html?view=${view}`);
    await expect(page.locator("h1")).toBeVisible();
    await expect(
      page.getByText("Fixture data · local actions only"),
    ).toBeVisible();
    await assertNoPageOverflow(page);
    const light = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag2aaa"])
      .analyze();
    expect(
      light.violations.map(({ id, nodes }) => ({
        id,
        targets: nodes.map((node) => node.target),
      })),
    ).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath(`${view}-${testInfo.project.name}.png`),
      fullPage: !(view === "rider" && testInfo.project.name === "mobile"),
      animations: "disabled",
    });
    await page.getByRole("button", { name: "Switch to dark theme" }).click();
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter(
            (animation) =>
              animation.effect?.getTiming().iterations !== Infinity,
          )
          .map((animation) => animation.finished.catch(() => undefined)),
      ),
    );
    const dark = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag2aaa"])
      .analyze();
    expect(
      dark.violations.map(({ id, nodes }) => ({
        id,
        targets: nodes.map((node) => node.target),
      })),
    ).toEqual([]);
    await assertNoPageOverflow(page);
    expect(failures).toEqual([]);
  });
}

test("table filters, pagination, volume, recovery and keyboard drawer", async ({
  page,
}) => {
  await page.goto("/design-lab.html?view=administrator");
  await expect(
    page.getByRole("navigation", { name: "Order pagination" }),
  ).toContainText("1–2 of 4 orders");
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(
    page.getByRole("navigation", { name: "Order pagination" }),
  ).toContainText("3–4 of 4 orders");
  await page.getByRole("checkbox", { name: "128-row stress test" }).check();
  await expect(
    page.getByRole("navigation", { name: "Order pagination" }),
  ).toContainText("of 128 orders");
  await page.getByRole("textbox", { name: "Search orders" }).fill("sample 128");
  await expect(
    page.getByRole("navigation", { name: "Order pagination" }),
  ).toContainText("1–1 of 1 orders");
  await page.getByRole("textbox", { name: "Search orders" }).fill("no results");
  await expect(
    page.getByRole("navigation", { name: "Order pagination" }),
  ).toContainText("0–0 of 0 orders");
  await page.getByRole("textbox", { name: "Search orders" }).fill("");
  await page.getByLabel("State", { exact: true }).selectOption("error");
  await page.getByRole("button", { name: /try again/i }).click();
  await expect(page.getByLabel("State", { exact: true })).toHaveValue("ready");
  await page.getByRole("checkbox", { name: "128-row stress test" }).uncheck();
  const detail = page
    .getByRole("button", { name: /view.*ord_1001/i })
    .filter({ visible: true });
  await detail.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag2aaa"])
    .analyze();
  expect(scan.violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(detail).toBeFocused();
  await assertNoPageOverflow(page);
});

test("menu customization, local bag and reservation wizard", async ({
  page,
}) => {
  await page.goto("/design-lab.html?view=customer");
  await page
    .getByRole("button", { name: "Customize Truffle Mushroom Risotto" })
    .click();
  await page.getByRole("radio", { name: /Large Portion/ }).check();
  await page.getByRole("checkbox", { name: /Extra Truffle Oil/ }).check();
  await page.getByRole("button", { name: /Add to bag · \$33.00/ }).click();
  await page.getByRole("button", { name: "Review bag" }).click();
  await expect(page.getByRole("dialog")).toContainText("$33.00");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Book a table", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("radio", { name: /T-01/ }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Finish booking preview" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "No booking or payment was created" }),
  ).toBeVisible();
  await assertNoPageOverflow(page);
});

test("cashier modal feedback, wizard focus and scoped notifications", async ({
  page,
}) => {
  await page.goto("/design-lab.html?view=cashier");
  await page
    .getByRole("button", { name: "Review bill", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Record cash preview" }).click();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText(
    "No payment was recorded",
  );
  await page.keyboard.press("Escape");
  await page.goto("/design-lab.html?view=waiter");
  await page
    .getByRole("button", { name: "New table order", exact: true })
    .click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /Step 2 of 3/ }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await page.goto("/design-lab.html?view=customer");
  await page.getByRole("button", { name: "Preview notifications" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Customer workspace update",
  );
  await expect(page.getByRole("dialog")).not.toContainText("Sophia");
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag2aaa"])
    .analyze();
  expect(scan.violations).toEqual([]);
});

test("all templates reflow at the requested viewport boundaries", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "Boundary checks run once, independently of device emulation.",
  );
  test.setTimeout(90000);
  for (const width of [375, 430, 768, 1024, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const view of views) {
      await page.goto(`/design-lab.html?view=${view}`, {
        waitUntil: "domcontentloaded",
      });
      await expect(page.locator("h1")).toBeVisible();
      await assertNoPageOverflow(page);
      const smallButtons = await page
        .locator("button:visible")
        .evaluateAll((buttons) =>
          buttons
            .map((button) => ({
              label: button.getAttribute("aria-label") || button.textContent,
              rect: button.getBoundingClientRect(),
            }))
            .filter(({ rect }) => rect.width < 47.5 || rect.height < 47.5)
            .map(({ label }) => label),
        );
      expect(
        smallButtons,
        `${view} at ${width}px has undersized controls`,
      ).toEqual([]);
    }
  }
});
