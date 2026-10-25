import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("riders can review a timed offer, accept it and navigate to pickup", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let offered = true,
    accepted = false;
  await page.route("**/api/v1/rider/dispatch", (route) =>
    route.fulfill({
      json: {
        profile: { user_id: 3, is_online: false },
        server_time: new Date().toISOString(),
        enabled: true,
        offers: offered
          ? [
              {
                id: 75,
                delivery_id: 5,
                order_number: "DF-DISPATCH",
                pickup: "Restaurant entrance",
                destination: "Customer home",
                eta_minutes: 4,
                expires_at: new Date(Date.now() + 25000).toISOString(),
              },
            ]
          : [],
      },
    }),
  );
  await page.route("**/api/v1/rider/offers/75/respond", async (route) => {
    expect(route.request().postDataJSON()).toEqual({ response: "accept" });
    offered = false;
    accepted = true;
    await route.fulfill({ json: { data: { id: 5 } } });
  });
  await page.route("**/api/v1/rider/assignments*", (route) =>
    route.fulfill({
      json: {
        data: accepted
          ? [
              {
                id: 5,
                status: "accepted",
                history: [],
                order: {
                  order_number: "DF-DISPATCH",
                  total: 100,
                  status: "preparing",
                  items: [],
                  pickup: {
                    address: "Restaurant entrance",
                    latitude: 14.6,
                    longitude: 120.98,
                  },
                  destination: {
                    address: "Customer home",
                    latitude: 14.61,
                    longitude: 120.98,
                    recipient_name: "Customer",
                    phone: "09123456789",
                  },
                },
              },
            ]
          : [],
      },
    }),
  );
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill("rider@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Acceptance-Password-123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#main-content")).toBeVisible();
  await page.goto("/settings");
  await page
    .getByRole("combobox", { name: "Vehicle", exact: true })
    .selectOption("motorcycle");
  await page
    .getByRole("button", { name: "Save rider details", exact: true })
    .click();
  await expect(
    page.getByText("Rider details saved.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Vehicle", exact: true }),
  ).toHaveValue("motorcycle");
  await page.goto("/rider/offers");
  const offer = page.locator(".dispatch-offer-card");
  await expect(offer).toContainText("DF-DISPATCH");
  await expect(offer).toContainText("s to respond");
  expect(
    (
      await new AxeBuilder({ page })
        .include(".rider-dispatch-panel")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await offer.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("rider-offer.png") });
  await page
    .getByRole("button", { name: "Accept delivery offer", exact: true })
    .click();
  await page.goto("/rider/deliveries");
  await expect(
    page.getByRole("link", { name: "Navigate to pickup", exact: true }),
  ).toHaveAttribute("href", /destination=14.6,120.98/);
  await expect(offer).toHaveCount(0);
  expect(errors).toEqual([]);
});
