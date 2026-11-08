import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { switchToDarkMode, switchToLightMode } from "./theme.js";

async function login(page) {
  await page.goto("/login");
  await page
    .getByLabel("Email", { exact: true })
    .fill("administrator@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Acceptance-Password-123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#main-content")).toBeVisible();
}
async function audit(page) {
  await page.evaluate(() =>
    Promise.race([
      Promise.allSettled(
        document
          .getAnimations()
          .filter(
            (animation) =>
              animation.playState === "running" &&
              animation.effect?.getTiming().iterations !== Infinity,
          )
          .map((animation) => animation.finished),
      ),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]),
  );
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
}
test("audit history paginates through server records and retains readable event details", async ({
  page,
}, info) => {
  // /admin/audit is the team activity feed: entries come from /admin/activity.
  const pages = [];
  await page.route("**/api/v1/admin/activity/people", (route) =>
    route.fulfill({ json: { data: [] } }),
  );
  await page.route("**/api/v1/admin/activity?*", (route) => {
    const query = new URL(route.request().url()).searchParams;
    const p = Number(query.get("page"));
    pages.push(p);
    return route.fulfill({
      json: {
        current_page: p,
        last_page: 2,
        total: 21,
        from: p === 1 ? 1 : 21,
        to: p === 1 ? 20 : 21,
        data: Array.from({ length: p === 1 ? 20 : 1 }, (_, i) => ({
          id: (p - 1) * 20 + i + 1,
          area: p === 1 ? "settings" : "account",
          summary:
            p === 1
              ? "Updated the business settings"
              : "Signed out of DineFlow",
          created_at: "2026-10-30T04:00:00Z",
          actor:
            p === 1
              ? { name: "Administrator Demo", role: "Administrator" }
              : { name: "Cashier Demo", role: "Cashier" },
        })),
      },
    });
  });
  await login(page);
  await page.goto("/admin/audit");
  await expect(
    page.getByText("Showing 1–20 of 21", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(
    page.getByText("Showing 21–21 of 21", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Signed out of DineFlow", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Cashier Demo", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Next page", exact: true }),
  ).toBeDisabled();
  expect(pages).toContain(2);
  await audit(page);
  await page.screenshot({
    path: info.outputPath("audit-history.png"),
    fullPage: true,
  });
  await switchToDarkMode(page);
  await audit(page);
});

test("reservation cards and calendar have useful details and a single filtered empty state", async ({
  page,
}, info) => {
  await page.route("**/api/v1/reservations?*", (route) =>
    route.fulfill({ json: { data: [] } }),
  );
  await page.route("**/api/v1/reservations", (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: 1,
            reference: "RSV-TEST",
            status: "completed",
            guest_count: 2,
            starts_at: "2026-10-30T10:00:00Z",
            table: { table_number: "Table 1" },
          },
        ],
      },
    }),
  );
  await login(page);
  await page.goto("/my-reservations");
  await expect(
    page.getByRole("article", { name: "Reservation RSV-TEST" }),
  ).toBeVisible();
  await audit(page);
  await page.screenshot({
    path: info.outputPath("my-reservations.png"),
    fullPage: true,
  });
  await switchToDarkMode(page);
  await audit(page);
  await switchToLightMode(page);
  await page.goto("/reservations");
  await expect(
    page.getByText("No reservations in this period", { exact: true }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Previous period", exact: true })
    .click();
  // Phones pick the status from a select; larger screens use status chips.
  const statusSelect = page.getByRole("combobox", {
    name: "Reservation status",
    exact: true,
  });
  if (await statusSelect.isVisible())
    await statusSelect.selectOption("confirmed");
  else
    await page
      .getByRole("group", { name: "Reservation status", exact: true })
      .getByRole("button", { name: /^Confirmed/ })
      .click();
  await expect(
    page.getByRole("button", { name: "Calendar date", exact: true }),
  ).toBeVisible();
  await audit(page);
  await page.screenshot({
    path: info.outputPath("calendar.png"),
    fullPage: true,
  });
  await switchToDarkMode(page);
  await audit(page);
});

test("floor objects shrink with zoom, snap to blocks, and show adjacent properties in 2D and 3D", async ({
  page,
}, info) => {
  const table = {
    id: 11,
    table_id: 1,
    object_type: "table",
    label: "Table 1",
    position: { x: 1.3, z: 2.4 },
    rotation: { y: 0 },
    dimensions: { width: 1.45, depth: 1.45 },
    properties: { table_shape: "short", capacity: 2 },
    table: {
      id: 1,
      table_number: "Table 1",
      capacity: 2,
      operational_status: "available",
    },
  };
  const panel = {
    id: 12,
    object_type: "flooring",
    label: "Floor panel",
    position: { x: 0, z: 0 },
    rotation: { y: 0 },
    dimensions: { width: 8, depth: 8 },
    properties: {},
  };
  let floor = {
    id: 1,
    name: "Floor 1",
    is_published: false,
    objects: [panel, table],
  };
  await page.route("**/api/v1/admin/floor-plan/floors", (route) =>
    route.fulfill({ json: { data: [floor] } }),
  );
  await page.route("**/api/v1/admin/floor-plan/presets", (route) =>
    route.fulfill({ json: { data: [] } }),
  );
  await page.route("**/api/v1/admin/floor-plan/floors/1/layout", (route) => {
    floor = {
      ...floor,
      objects: route
        .request()
        .postDataJSON()
        .objects.map((object) =>
          object.id === 11 ? { ...object, table: table.table } : object,
        ),
    };
    return route.fulfill({ json: { data: floor } });
  });
  await login(page);
  await page.goto("/admin/floor-plan");
  const board = page.locator(".floor-editor .editor-board"),
    inspector = page.getByRole("region", { name: "Selected object settings" });
  const object = board.locator('[data-object-key="11"]');
  await expect(object).toBeVisible();
  await expect
    .poll(() => object.evaluate((el) => el.getBoundingClientRect().width))
    .toBeGreaterThan(20);
  const initial = await object.boundingBox();
  await page
    .getByRole("slider", { name: "Canvas zoom", exact: true })
    .fill("0.55");
  await expect
    .poll(async () => (await object.boundingBox()).width)
    .toBeLessThan(initial.width * 0.7);
  expect(
    await board.evaluate((el) => getComputedStyle(el, "::after").content),
  ).toBe("none");
  await page
    .getByRole("button", { name: "Align objects", exact: true })
    .click();
  await object.click();
  await expect(inspector.getByLabel("Position X", { exact: true })).toHaveValue(
    "1",
  );
  await expect(inspector.getByLabel("Position Z", { exact: true })).toHaveValue(
    "2",
  );
  const canvasBounds = await board.boundingBox(),
    propertyBounds = await inspector.boundingBox();
  if (page.viewportSize().width >= 1100) {
    expect(propertyBounds.x).toBeGreaterThanOrEqual(
      canvasBounds.x + canvasBounds.width,
    );
    expect(Math.abs(propertyBounds.y - canvasBounds.y)).toBeLessThan(3);
  }
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByText("Draft saved. Publish when the preview looks right.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("floor-editor-2d.png"),
    fullPage: true,
  });
  await switchToDarkMode(page);
  await audit(page);
  await page.getByRole("button", { name: "Preview 3D", exact: true }).click();
  await expect(page.locator(".floor-scene canvas")).toBeVisible();
  await expect(inspector).toBeVisible();
  if (page.viewportSize().width >= 1100) {
    const scene = await page
      .locator(".floor-editor > .floor-scene")
      .boundingBox();
    const props = await inspector.boundingBox();
    expect(props.x).toBeGreaterThanOrEqual(scene.x + scene.width);
  }
  await page.screenshot({
    path: info.outputPath("floor-editor-3d.png"),
    fullPage: true,
  });
});
