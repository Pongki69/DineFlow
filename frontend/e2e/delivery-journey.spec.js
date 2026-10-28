import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const recorded of [true, false]) {
  test(`delivery map shows arrival times and ${recorded ? "recorded GPS trail" : "clearly labelled suggested route"}`, async ({
    page,
  }, testInfo) => {
    const errors = [];
    let routeCalls = 0;
    page.on("pageerror", (error) => errors.push(error.message));
    const times = {
      restaurant: "2026-10-23T06:00:00Z",
      picked_up: "2026-10-23T06:05:00Z",
      delivered: "2026-10-23T06:08:00Z",
    };
    const geometry = [
      [121.232, 14.184],
      [121.2315, 14.1835],
      [121.2315, 14.183],
      [121.2305, 14.1825],
      [121.23, 14.182],
    ];
    await page.route("**/api/v1/my/deliveries/5", (route) =>
      route.fulfill({
        json: {
          data: {
            delivery_id: 5,
            order_number: "DF-JOURNEY",
            status: "delivered",
            order_status: "completed",
            rating: 5,
            arrival_times: times,
            pickup: {
              address: "Restaurant entrance",
              latitude: 14.184,
              longitude: 121.232,
            },
            destination: {
              address: "Customer drop-off",
              latitude: 14.182,
              longitude: 121.23,
            },
            recorded_path: recorded
              ? geometry.map(([longitude, latitude], index) => ({
                  latitude,
                  longitude,
                  recorded_at: new Date(
                    new Date(times.picked_up).getTime() + index * 15000,
                  ).toISOString(),
                }))
              : [],
            history: [],
            order_history: [],
          },
        },
      }),
    );
    await page.route("**/api/v1/my/deliveries/5/route", (route) => {
      routeCalls += 1;
      return route.fulfill({
        json: { data: { kind: "suggested_route", geometry } },
      });
    });
    await page.route("**/api/v1/notifications", (route) =>
      route.fulfill({ json: { data: [] } }),
    );
    await page.goto("/login");
    await page
      .getByLabel("Email", { exact: true })
      .fill("customer@example.test");
    await page
      .getByLabel("Password", { exact: true })
      .fill("Acceptance-Password-123!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator("#main-content")).toBeVisible();
    await page.goto("/delivery/5/tracking");
    const details = page.locator(".customer-completed-map");
    await details.locator("summary").click();
    await expect(
      details.locator('time[datetime="2026-10-23T06:00:00Z"]'),
    ).toBeVisible();
    await expect(
      details.locator('time[datetime="2026-10-23T06:08:00Z"]'),
    ).toBeVisible();
    const map = page.getByRole("region", { name: "Completed delivery map" });
    await expect(map).toBeVisible();
    expect((await map.boundingBox()).height).toBeGreaterThanOrEqual(
      testInfo.project.name === "mobile" ? 360 : 480,
    );
    await expect(
      map.locator(
        recorded ? ".recorded-delivery-path" : ".suggested-delivery-path",
      ),
    ).toBeVisible();
    await expect(map.locator(".leaflet-tooltip")).toHaveCount(2);
    if (recorded) {
      expect(routeCalls).toBe(0);
      await expect(details).toContainText("Recorded rider GPS trail");
    } else {
      expect(routeCalls).toBe(1);
      await expect(details).toContainText(
        "not a record of the path actually taken",
      );
    }
    expect(
      (
        await new AxeBuilder({ page })
          .include(".customer-completed-map")
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await details.screenshot({
      path: testInfo.outputPath("delivery-journey.png"),
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}
