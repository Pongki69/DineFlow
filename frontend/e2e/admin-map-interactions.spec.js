import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const outlet = {
  name: "Demo outlet",
  address: "Demo pickup address",
  latitude: 14.555,
  longitude: 121.025,
  opening_hours: {},
  is_active: true,
};
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
test("pin lookup fills the outlet address, protects manual edits, and keeps a manual fallback", async ({
  page,
}) => {
  await page.route("**/api/v1/admin/delivery-policy", (route) =>
    route.fulfill({
      json: { data: { location: outlet, policy: { radius_km: 5 } } },
    }),
  );
  let call = 0,
    release;
  const delayed = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/maps/reverse?*", async (route) => {
    call += 1;
    if (call === 2) {
      await delayed;
      return route
        .fulfill({ json: { data: { label: "Late address" } } })
        .catch(() => {});
    }
    if (call > 2)
      return route.fulfill({
        status: 503,
        json: { message: "Lookup unavailable" },
      });
    return route.fulfill({
      json: { data: { label: "Automatically found demo street" } },
    });
  });
  await login(page);
  await page.goto("/admin/outlets");
  const map = page.locator(".leaflet-container");
  await expect(map).toBeVisible();
  await map.click({ position: { x: 150, y: 190 } });
  const address = page.getByLabel("Store address", { exact: true });
  await expect(address).toHaveValue("Automatically found demo street");
  await map.click({ position: { x: 170, y: 210 } });
  await expect.poll(() => call).toBe(2);
  await address.fill("Manual entrance details");
  release();
  await expect(address).toHaveValue("Manual entrance details");
  await map.click({ position: { x: 180, y: 220 } });
  await expect(page.locator("#admin-outlet-address-status")).toContainText(
    "Address lookup is unavailable",
  );
  await address.fill("Manual address after failed lookup");
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(address).toHaveValue(outlet.address);
});

test("searchable fleet list focuses latest GPS, follows updates and navigates back from map edges", async ({
  page,
}, info) => {
  let reads = 0;
  const remote = {
    id: 41,
    name: "Alfonso Demo",
    status: "on_delivery",
    active_deliveries: 2,
    latitude: 14.186648,
    longitude: 121.231433,
    located_at: new Date().toISOString(),
    is_active: true,
    vehicle_type: "motorcycle",
  };
  const fleet = [
    remote,
    {
      ...remote,
      id: 42,
      name: "Jamie Demo",
      status: "available",
      latitude: 14.556,
      longitude: 121.026,
      active_deliveries: 0,
    },
    {
      ...remote,
      id: 43,
      name: "Offline Demo",
      status: "offline",
      latitude: null,
      longitude: null,
    },
  ];
  await page.route("**/api/v1/admin/operations-overview", (route) => {
    reads += 1;
    return route.fulfill({
      json: {
        data: {
          fleet,
          location: outlet,
          radius_km: 5,
          deliveries: [],
          metrics: {
            active_orders: 0,
            available_riders: 1,
            average_minutes: null,
            delayed_deliveries: 0,
            active_deliveries: 2,
            awaiting_rider: 0,
            delivered_today: 0,
          },
          server_time: new Date().toISOString(),
        },
      },
    });
  });
  await login(page);
  await page.goto("/admin/riders");
  const roster = page.getByRole("complementary", { name: "Map rider list" });
  await expect(roster).toBeVisible();
  await page
    .getByRole("button", { name: "Focus on Alfonso Demo", exact: true })
    .click();
  await expect(
    roster.getByRole("checkbox", { name: "Follow Alfonso Demo", exact: true }),
  ).toBeChecked();
  const map = page.locator(".leaflet-container");
  await expect(map.locator(".admin-rider-focus-ring")).toHaveCount(1);
  await roster
    .getByRole("searchbox", { name: "Search map riders" })
    .fill("Jamie");
  await expect(
    roster.getByRole("button", { name: /Alfonso Demo/ }),
  ).toHaveCount(0);
  await expect(
    roster.getByRole("button", { name: /Jamie Demo/ }),
  ).toBeVisible();
  await roster.getByRole("searchbox").fill("Nobody");
  await expect(roster.getByText("No riders match your search.")).toBeVisible();
  await roster.getByRole("searchbox").clear();
  await expect(
    roster.getByRole("button", { name: /Offline Demo/ }),
  ).toBeDisabled();
  const before = reads;
  const marker = map.locator('[title="Alfonso Demo"]');
  const oldPosition = await marker.getAttribute("style");
  remote.latitude += 0.01;
  await expect.poll(() => reads, { timeout: 10000 }).toBeGreaterThan(before);
  await expect(marker).not.toHaveAttribute("style", oldPosition);
  await map.scrollIntoViewIfNeeded();
  const bounds = await map.boundingBox();
  await page.mouse.move(bounds.x + 90, bounds.y + 190);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 200, bounds.y + 260, { steps: 8 });
  await page.mouse.up();
  await expect(
    roster.getByRole("checkbox", { name: "Follow Alfonso Demo", exact: true }),
  ).not.toBeChecked();
  await roster.getByRole("button", { name: /Alfonso Demo/ }).click();
  await expect(
    roster.getByRole("checkbox", { name: "Follow Alfonso Demo", exact: true }),
  ).toBeChecked();
  await page.screenshot({
    path: info.outputPath("fleet-navigation.png"),
    fullPage: true,
  });
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
