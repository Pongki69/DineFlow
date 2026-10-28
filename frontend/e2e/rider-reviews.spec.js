import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function login(page, role) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(`${role}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Acceptance-Password-123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#main-content")).toBeVisible();
}

test("short notes and instructions have no read-more action, and overflow is rechecked after resize", async ({
  page,
}) => {
  let text = "Use the blue gate.";
  await page.route("**/api/v1/rider/deliveries/*", async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    json.data.order.customer_notes = text;
    json.data.order.delivery_instructions = text;
    await route.fulfill({ response, json });
  });
  await page.route("**/api/v1/rider/deliveries/*/route", (route) =>
    route.fulfill({ status: 503, json: { message: "Unavailable" } }),
  );
  await login(page, "rider");
  await page.goto("/rider/history");
  await page.getByRole("link", { name: "DF-REVIEW-DEMO", exact: true }).click();
  await expect(
    page.locator(".rider-customer-note .rider-note-preview"),
  ).toHaveText(text);
  await expect(
    page.getByRole("button", { name: "Read full note", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Read full instructions", exact: true }),
  ).toHaveCount(0);
  text = "Use the blue gate and call when you arrive. ".repeat(60);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Read full note", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Read full instructions", exact: true }),
  ).toBeVisible();
  text =
    "Please leave the delivery beside the blue gate and call the recipient before handing over the order. Keep the food upright and the sauce separate.";
  await page.reload();
  await expect(
    page.locator(".rider-customer-note .rider-note-preview"),
  ).toHaveText(text);
  for (const width of [1280, 375, 900]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [selector, action] of [
      [".rider-customer-note", "Read full note"],
      [".rider-instruction-note", "Read full instructions"],
    ]) {
      await expect
        .poll(async () => {
          const overflows = await page
            .locator(`${selector} .rider-note-measure`)
            .evaluate(
              (node) =>
                node.getBoundingClientRect().height >
                parseFloat(getComputedStyle(node).lineHeight) * 3 + 1,
            );
          const visible = await page
            .getByRole("button", { name: action, exact: true })
            .isVisible();
          return visible === overflows;
        })
        .toBe(true);
    }
  }
});

test("rider history opens private order details and offers use a compact empty state", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === "desktop")
    await page.setViewportSize({ width: 1920, height: 1080 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let routeFails = true;
  await page.route("**/api/v1/rider/deliveries/*/route", (route) =>
    route.fulfill(
      routeFails
        ? { status: 503, json: { message: "Route unavailable" } }
        : {
            json: {
              data: {
                geometry: [
                  [120.98, 14.6],
                  [120.983, 14.604],
                  [120.985, 14.607],
                  [120.99, 14.61],
                ],
                kind: "suggested_route",
              },
            },
          },
    ),
  );
  await page.route("**/api/v1/rider/deliveries/*", async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    json.data.order.customer_notes =
      "Please keep the sauce separate and pack the food carefully. ".repeat(
        120,
      );
    json.data.order.delivery_instructions =
      "Use the blue gate, then call the recipient before entering. ".repeat(
        120,
      );
    json.data.items[0].description =
      "Noodles with vegetables and a savory broth.";
    json.data.items[0].image_url = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="360"><rect width="600" height="360" fill="#edf4e7"/><ellipse cx="300" cy="200" rx="150" ry="70" fill="#d7bb7d"/></svg>')}`;
    await route.fulfill({ response, json });
  });
  await login(page, "rider");
  await page.goto("/rider/history");
  await page.getByRole("link", { name: "DF-REVIEW-DEMO", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Order DF-REVIEW-DEMO", exact: true }),
  ).toBeVisible();
  if (testInfo.project.name === "desktop") {
    const available = await page
      .locator("#main-content")
      .evaluate(
        (node) =>
          node.clientWidth -
          parseFloat(getComputedStyle(node).paddingLeft) -
          parseFloat(getComputedStyle(node).paddingRight),
      );
    expect(
      (await page.locator(".rider-order-details").boundingBox()).width,
    ).toBeCloseTo(available, 0);
  }
  await expect(
    page.getByText("1 × Demo Noodle Bowl", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Rider availability", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("#rider-presence-slot button")).toBeVisible();
  const itemButton = page.getByRole("button", {
    name: "View item details: Demo Noodle Bowl",
    exact: true,
  });
  const itemTextSize = await itemButton
    .locator(".rider-order-item-copy > strong")
    .evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
  expect(itemTextSize).toBeGreaterThanOrEqual(
    testInfo.project.name === "desktop" ? 18 : 16,
  );
  expect(
    await itemButton
      .locator(".rider-order-item-amount > strong")
      .evaluate((node) => parseFloat(getComputedStyle(node).fontSize)),
  ).toBe(itemTextSize);
  await itemButton.click();
  const modal = page.getByRole("dialog", {
    name: "Demo Noodle Bowl",
    exact: true,
  });
  await expect(modal).toBeVisible();
  await expect(
    modal.getByText("Noodles with vegetables and a savory broth.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    modal.getByRole("img", { name: "Demo Noodle Bowl", exact: true }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .include(".editor-modal")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("order-item-modal.png") });
  await page.keyboard.press("Escape");
  await expect(modal).not.toBeVisible();
  await expect(itemButton).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "Delivery timeline" }),
  ).toBeVisible();
  await expect(page.locator(".rider-order-events time").first()).toHaveText(
    /^[A-Z][a-z]+ \d{1,2}, \d{4} · \d{1,2}:\d{2} [AP]M$/,
  );
  await expect(page.locator(".rider-order-receipt > time")).toHaveText(
    /^[A-Z][a-z]+ \d{1,2}, \d{4} ·/,
  );
  if (testInfo.project.name === "desktop") {
    const wideType = await page
      .locator(".rider-order-events")
      .evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
    await page.setViewportSize({ width: 375, height: 900 });
    const mobileType = await page
      .locator(".rider-order-events")
      .evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
    expect(mobileType).toBeGreaterThanOrEqual(14);
    expect(
      await itemButton
        .locator(".rider-order-item-copy > strong")
        .evaluate((node) => parseFloat(getComputedStyle(node).fontSize)),
    ).toBeGreaterThanOrEqual(16);
    expect(wideType).toBeGreaterThan(mobileType);
    expect(
      await page
        .locator(".rider-order-events time")
        .first()
        .evaluate((node) => parseFloat(getComputedStyle(node).fontSize)),
    ).toBeGreaterThanOrEqual(12);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.setViewportSize({ width: 1920, height: 1080 });
  }
  const notePreview = page.locator(".rider-customer-note .rider-note-preview");
  expect(
    await notePreview.evaluate(
      (node) =>
        node.clientHeight <=
        parseFloat(getComputedStyle(node).lineHeight) * 3 + 1,
    ),
  ).toBe(true);
  const cardHeight = (await page.locator(".rider-delivery-info").boundingBox())
    .height;
  if (testInfo.project.name === "desktop") {
    const timelineHeight = (
      await page
        .locator(".rider-record-grid > .workspace-card")
        .nth(1)
        .boundingBox()
    ).height;
    expect(Math.abs(timelineHeight - cardHeight)).toBeLessThan(1);
  }
  const instructionsPreview = page.locator(
    ".rider-instruction-note .rider-note-preview",
  );
  expect(
    await instructionsPreview.evaluate(
      (node) =>
        node.clientHeight <=
        parseFloat(getComputedStyle(node).lineHeight) * 3 + 1,
    ),
  ).toBe(true);
  const readInstructions = page.getByRole("button", {
    name: "Read full instructions",
    exact: true,
  });
  await readInstructions.click();
  const instructionsDialog = page.getByRole("dialog", {
    name: "Drop-off instructions",
    exact: true,
  });
  await expect(instructionsDialog).toBeVisible();
  expect(
    await page
      .getByRole("region", { name: "Full drop-off instructions", exact: true })
      .evaluate((node) => node.scrollHeight > node.clientHeight),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Close drop-off instructions", exact: true })
    .click();
  await expect(instructionsDialog).not.toBeVisible();
  await expect(readInstructions).toBeFocused();
  const readNote = page.getByRole("button", {
    name: "Read full note",
    exact: true,
  });
  await notePreview.click();
  const noteDialog = page.getByRole("dialog", {
    name: "Order note",
    exact: true,
  });
  await expect(noteDialog).toBeVisible();
  const fullNote = page.getByRole("region", {
    name: "Full order note",
    exact: true,
  });
  expect(
    await fullNote.evaluate((node) => node.scrollHeight > node.clientHeight),
  ).toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .include(".editor-modal[open]")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("long-order-note.png") });
  await page.keyboard.press("Escape");
  await expect(noteDialog).not.toBeVisible();
  await expect(readNote).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(noteDialog).toBeVisible();
  await page
    .getByRole("button", { name: "Close order note", exact: true })
    .click();
  await expect(noteDialog).not.toBeVisible();
  expect(
    (await page.locator(".rider-delivery-info").boundingBox()).height,
  ).toBe(cardHeight);
  await expect(
    page.getByRole("button", { name: "Retry route", exact: true }),
  ).toBeVisible();
  routeFails = false;
  await page.getByRole("button", { name: "Retry route", exact: true }).click();
  await expect(page.locator(".delivery-suggested-road-route")).toBeVisible();
  await expect(
    page.getByRole("region", {
      name: "Map of store and drop-off",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Store location", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Drop-off location", exact: true }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .include(".rider-order-details")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.screenshot({
    path: testInfo.outputPath("rider-order-details.png"),
    fullPage: true,
  });
  await page.goto("/rider");
  await page
    .getByRole("link", {
      name: "View customer ratings and reviews",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Ratings & reviews", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Rating summary", exact: true }),
  ).toBeVisible();
  await page.goto("/rider/offers");
  await expect(
    page.getByRole("heading", { name: "Ready when you are", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".offers-help p")).not.toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .include(".rider-dispatch-panel")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.screenshot({
    path: testInfo.outputPath("rider-offers-clean.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("customers review verified riders with tags comments and editable name visibility", async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "customer");
  await page.goto("/my-orders");
  const order = page
    .locator(".staff-list article")
    .filter({ hasText: "DF-REVIEW-DEMO" });
  await order
    .getByRole("link", { name: "Track order & rider", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Order DF-REVIEW-DEMO", exact: true }),
  ).toBeVisible();
  const trackingUrl = page.url();
  await expect(page.locator(".rider-vehicle-badge")).toHaveText("Motorcycle");
  if (
    await page.getByRole("button", { name: "Edit review", exact: true }).count()
  )
    await page
      .getByRole("button", { name: "Edit review", exact: true })
      .click();
  await page.getByRole("radio", { name: "5 stars", exact: true }).check();
  await page
    .getByRole("checkbox", { name: "On-time delivery", exact: true })
    .setChecked(true);
  await page
    .getByRole("checkbox", { name: "Careful handling", exact: true })
    .setChecked(true);
  await page
    .getByRole("textbox", { name: /Comment/ })
    .fill("Arrived on time and handled the order carefully.");
  await page.getByRole("checkbox", { name: /Show my name/ }).setChecked(false);
  expect(
    (
      await new AxeBuilder({ page })
        .include(".rider-review-form")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page
    .locator(".rider-review-form")
    .screenshot({ path: testInfo.outputPath("review-form.png") });
  await page
    .getByRole("button", { name: /^(Submit review|Save review)$/ })
    .click();
  await expect(
    page.getByRole("button", { name: "Edit review", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "View rider profile", exact: true })
    .click();
  const profileUrl = page.url();
  await expect(page.locator(".rider-vehicle-badge")).toHaveText("Motorcycle");
  await expect(
    page.getByRole("heading", { name: "Rider profile", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".review-card").first()).toContainText("Cu*****r");
  await expect(page.locator(".review-card").first()).toContainText(
    "Arrived on time and handled the order carefully.",
  );
  expect(
    (
      await new AxeBuilder({ page })
        .include(".rider-public-profile")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.screenshot({
    path: testInfo.outputPath("rider-profile.png"),
    fullPage: true,
  });
  await page.goto(trackingUrl);
  await page.getByRole("button", { name: "Edit review", exact: true }).click();
  await page.getByRole("checkbox", { name: /Show my name/ }).check();
  await page.getByRole("button", { name: "Save review", exact: true }).click();
  await expect(
    page.getByText("Your name is visible", { exact: true }),
  ).toBeVisible();
  await page.goto(profileUrl);
  await expect(page.locator(".review-card").first()).toContainText(
    "Customer Demo",
  );
  await page.goto(trackingUrl);
  await page.getByRole("button", { name: "Edit review", exact: true }).click();
  await page.getByRole("checkbox", { name: /Show my name/ }).uncheck();
  await page.getByRole("button", { name: "Save review", exact: true }).click();
  await expect(
    page.getByText("Your name is masked", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
