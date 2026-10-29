import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("typed address suggestions overlay the map and support keyboard selection", async ({
  page,
}, info) => {
  await page.route("**/api/v1/admin/delivery-policy", (route) =>
    route.fulfill({
      json: { data: { location: [], policy: { radius_km: 8 } } },
    }),
  );
  await page.route("**/api/v1/maps/search?*", (route) =>
    route.fulfill({
      json: {
        data: [
          {
            label: "Bay, Laguna, Philippines",
            latitude: 14.18,
            longitude: 121.28,
          },
          {
            label: "Bay Municipal Hall, Bay, Laguna",
            latitude: 14.181,
            longitude: 121.282,
          },
        ],
      },
    }),
  );
  await page.goto("/login");
  await page
    .getByLabel("Email", { exact: true })
    .fill("administrator@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Acceptance-Password-123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#main-content")).toBeVisible();
  await page.goto("/admin/outlets");
  const input = page.getByRole("combobox", { name: "Find outlet address" });
  const map = page.locator(".leaflet-container");
  await expect(map).toBeVisible();
  await input.scrollIntoViewIfNeeded();
  const top = (await map.boundingBox()).y;
  await input.fill("bay laguna");
  const list = page.getByRole("listbox", { name: "Matching addresses" });
  await expect(list.getByRole("option")).toHaveCount(2);
  expect(Math.abs((await map.boundingBox()).y - top)).toBeLessThan(1);
  expect(
    await page.locator(".admin-place-results").evaluate((element) => {
      const box = element.getBoundingClientRect();
      const mapBox = document
        .querySelector(".leaflet-container")
        .getBoundingClientRect();
      const x = box.left + box.width / 2,
        y = Math.max(mapBox.top + 1, box.top + 1);
      return (
        box.bottom > mapBox.top &&
        element.contains(document.elementFromPoint(x, y))
      );
    }),
  ).toBe(true);
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
  await page.screenshot({ path: info.outputPath("address-dropdown.png") });
  await input.press("ArrowDown");
  await input.press("ArrowDown");
  await expect(
    list.getByRole("option", {
      name: "Bay Municipal Hall, Bay, Laguna",
      exact: true,
    }),
  ).toHaveAttribute("aria-selected", "true");
  await input.press("Enter");
  await expect(list).toHaveCount(0);
  await expect(page.getByLabel("Store address", { exact: true })).toHaveValue(
    "Bay Municipal Hall, Bay, Laguna",
  );
  await expect(page.getByLabel("Latitude", { exact: true })).toHaveValue(
    "14.181",
  );
  await expect(page.getByLabel("Longitude", { exact: true })).toHaveValue(
    "121.282",
  );
  await expect(input).toBeFocused();
  await input.fill("bay laguna");
  await expect(list).toBeVisible();
  await input.press("Escape");
  await expect(list).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
