import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("customer can view and hide the delivery photo after completion", async ({
  page,
}) => {
  const photo =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=";
  await page.route("**/api/v1/my/deliveries/5", (route) =>
    route.fulfill({
      json: {
        data: {
          delivery_id: 5,
          order_number: "DF-PHOTO",
          status: "delivered",
          order_status: "completed",
          proof_available: true,
          rating: 5,
          history: [],
          order_history: [],
        },
      },
    }),
  );
  await page.route("**/api/v1/deliveries/5/proof", (route) =>
    route.fulfill({ json: { data: { image: photo } } }),
  );
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill("customer@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Acceptance-Password-123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#main-content")).toBeVisible();
  await page.goto("/delivery/5/tracking");
  await page
    .getByRole("button", { name: "View delivery photo", exact: true })
    .click();
  const image = page.getByRole("img", {
    name: "Photo of your delivered order",
    exact: true,
  });
  await expect(image).toHaveAttribute("src", photo);
  await page
    .getByRole("button", { name: "Hide delivery photo", exact: true })
    .click();
  await expect(image).toHaveCount(0);
});

test("rider must upload a photo successfully before marking delivered", async ({
  page,
}, testInfo) => {
  let uploaded = false,
    delivered = false,
    attempts = 0;
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/v1/rider/assignments*", (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: 5,
            status: delivered ? "delivered" : "in_transit",
            proof_uploaded: uploaded,
            order: {
              order_number: "DF-PHOTO",
              total: 100,
              status: "ready_to_serve",
              items: [],
              pickup: { address: "Restaurant" },
              destination: {
                address: "Customer home",
                recipient_name: "Customer",
                phone: "09123456789",
              },
            },
          },
        ],
      },
    }),
  );
  await page.route("**/api/v1/rider/dispatch", (route) =>
    route.fulfill({
      json: {
        profile: { is_online: false },
        offers: [],
        enabled: true,
        server_time: new Date().toISOString(),
      },
    }),
  );
  await page.route("**/api/v1/rider/deliveries/5/proof", async (route) => {
    attempts += 1;
    expect(route.request().headers()["content-type"]).toContain(
      "multipart/form-data",
    );
    expect(route.request().postDataBuffer().length).toBeLessThan(1024 * 1024);
    if (attempts === 1)
      return route.fulfill({
        status: 503,
        json: { message: "Upload unavailable. Please try again." },
      });
    uploaded = true;
    await route.fulfill({ json: { data: { uploaded: true } } });
  });
  await page.route("**/api/v1/rider/deliveries/5/status", (route) => {
    expect(uploaded).toBe(true);
    expect(route.request().postDataJSON()).toEqual({ status: "delivered" });
    delivered = true;
    return route.fulfill({ json: { data: { id: 5, status: "delivered" } } });
  });
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill("rider@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Acceptance-Password-123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#main-content")).toBeVisible();
  await page.goto("/rider/deliveries");
  const blocked = page.getByRole("button", {
    name: "Upload a photo before marking delivered",
    exact: true,
  });
  await expect(blocked).toBeDisabled();
  const input = page.getByLabel("Take or choose a delivery photo", {
    exact: true,
  });
  await input.setInputFiles({
    name: "invalid.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("invalid"),
  });
  await expect(page.getByRole("alert")).toContainText(
    "Choose a JPG, PNG or WebP photo.",
  );
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const context = canvas.getContext("2d");
    context.fillStyle = "#dedac4";
    context.fillRect(0, 0, 640, 480);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await input.setInputFiles({
    name: "dropoff.png",
    mimeType: "image/png",
    buffer: Buffer.from(encoded, "base64"),
  });
  await expect(
    page.getByRole("img", { name: "Delivery photo preview", exact: true }),
  ).toBeVisible();
  await expect(blocked).toBeDisabled();
  await page
    .getByRole("button", { name: "Upload delivery photo", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Upload unavailable.");
  await expect(blocked).toBeDisabled();
  await page
    .getByRole("button", { name: "Upload delivery photo", exact: true })
    .click();
  const complete = page.getByRole("button", {
    name: "Mark delivered",
    exact: true,
  });
  await expect(complete).toBeEnabled();
  const panel = page.getByRole("region", {
    name: "Delivery photo",
    exact: true,
  });
  expect(
    (
      await new AxeBuilder({ page })
        .include(".delivery-proof")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("delivery-photo.png") });
  await complete.click();
  await expect(page.locator(".rider-delivery-card")).toHaveCount(0);
  expect(delivered).toBe(true);
  expect(errors).toEqual([]);
});
