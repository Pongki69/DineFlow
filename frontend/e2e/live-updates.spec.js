import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

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
const order = (id) => ({
  id,
  order_number: `LIVE-${id}`,
  order_type: "delivery",
  status: "ready_to_serve",
  customer_name_snapshot: `Customer ${id}`,
  total: "450.00",
  items: [{ quantity: 1, item_name_snapshot: "Rice bowl" }],
  payment_summary: { paid: "0.00", balance_due: "450.00" },
});

test("date filters use a styled calendar with range bounds in both themes", async ({
  page,
}, info) => {
  await page.route("**/api/v1/orders?*", (route) =>
    route.fulfill({ json: { data: [order(1)] } }),
  );
  await login(page);
  await page.goto("/admin/orders");
  await page.getByRole("button", { name: "From", exact: true }).click();
  const calendar = page.getByRole("dialog", { name: "Choose from date" });
  await expect(calendar).toBeVisible();
  const bounds = await calendar.boundingBox();
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(
    page.viewportSize().height,
  );
  await expect(
    page.getByRole("button", { name: "From", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  let violations = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(violations.violations).toEqual([]);
  await page.screenshot({
    path: info.outputPath("date-picker-light.png"),
    fullPage: false,
  });
  await calendar.getByRole("button", { name: "Today", exact: true }).click();
  await page.getByRole("button", { name: "To", exact: true }).click();
  const end = page.getByRole("dialog", { name: "Choose to date" });
  await end.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await page.getByRole("button", { name: "To", exact: true }).click();
  await expect(end).toBeVisible();
  violations = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(violations.violations).toEqual([]);
  await page.screenshot({
    path: info.outputPath("date-picker-dark.png"),
    fullPage: false,
  });
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "To", exact: true }),
  ).toBeFocused();
});

test("WebSocket changes wait while scrolling and late responses never interrupt the view", async ({
  page,
}) => {
  const clients = new Set();
  await page.route("**/api/v1/realtime/config", (route) =>
    route.fulfill({
      json: {
        data: {
          key: "live-test-key",
          host: "127.0.0.1",
          port: 8095,
          scheme: "http",
        },
      },
    }),
  );
  await page.route("**/api/v1/broadcasting/auth", (route) =>
    route.fulfill({ json: { auth: "live-test-key:test-signature" } }),
  );
  await page.routeWebSocket(
    /ws:\/\/127\.0\.0\.1:8095\/app\/live-test-key/,
    (ws) => {
      ws.send(
        JSON.stringify({
          event: "pusher:connection_established",
          data: JSON.stringify({ socket_id: "123.456", activity_timeout: 120 }),
        }),
      );
      ws.onMessage((raw) => {
        const message = JSON.parse(String(raw));
        if (message.event === "pusher:subscribe") {
          ws.send(
            JSON.stringify({
              event: "pusher_internal:subscription_succeeded",
              channel: message.data.channel,
              data: "{}",
            }),
          );
          if (message.data.channel === "private-workspace") clients.add(ws);
        }
        if (message.event === "pusher:ping")
          ws.send(JSON.stringify({ event: "pusher:pong", data: "{}" }));
      });
      ws.onClose(() => clients.delete(ws));
    },
  );
  let rows = Array.from({ length: 20 }, (_, i) => order(i + 1)),
    reads = 0,
    release,
    hold = false;
  await page.route("**/api/v1/orders?*", async (route) => {
    reads++;
    if (hold) {
      hold = false;
      await new Promise((resolve) => {
        release = resolve;
      });
    }
    await route.fulfill({ json: { data: rows } });
  });
  const announce = () => {
    for (const ws of clients)
      ws.send(
        JSON.stringify({
          event: "workspace.updated",
          channel: "private-workspace",
          data: JSON.stringify({ topics: ["orders"] }),
        }),
      );
  };
  await login(page);
  await page.goto("/admin/orders");
  if (page.viewportSize().width <= 850) {
    // Phones apply live updates by themselves once the reader stops
    // scrolling, and the order being read keeps its place on screen.
    await expect(page.locator(".order-card")).toHaveCount(20);
    await expect(page.locator(".live-updates-bar")).toHaveCount(0);
    await expect.poll(() => clients.size).toBeGreaterThan(0);
    const reading = page.getByRole("article", {
      name: "Order LIVE-8",
      exact: true,
    });
    await reading.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    const readingBefore = (await reading.boundingBox()).y;
    rows = [order(21), ...rows];
    announce();
    await expect(page.getByText("LIVE-21", { exact: true })).toBeAttached();
    expect(
      Math.abs((await reading.boundingBox()).y - readingBefore),
    ).toBeLessThanOrEqual(2);
    return;
  }
  await expect(page.getByText("Live updates", { exact: true })).toBeVisible();
  await expect(page.locator(".order-card")).toHaveCount(20);
  await expect(
    page.getByRole("button", { name: "Up to date", exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(500);
  const idleReads = reads;
  await page.waitForTimeout(6000);
  expect(reads).toBe(idleReads);
  const anchor = page.getByRole("article", {
    name: "Order LIVE-8",
    exact: true,
  });
  await anchor.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => window.scrollY);
  const anchorBefore = (await anchor.boundingBox()).y;
  // Shared headers and live status scroll away instead of covering page content.
  for (const selector of [".admin-topbar, .app-topbar", ".live-updates-bar"]) {
    const bounds = await page.locator(selector).boundingBox();
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(0);
  }
  rows = [order(21), ...rows];
  announce();
  const apply = page.getByRole("button", {
    name: "Apply updates",
    exact: true,
  });
  await expect(apply).toBeVisible();
  expect(reads).toBe(idleReads);
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
  expect((await anchor.boundingBox()).y).toBe(anchorBefore);
  await expect(page.getByText("LIVE-21", { exact: true })).toHaveCount(0);
  await expect(
    page.locator('dialog[open], [role="dialog"]:visible'),
  ).toHaveCount(0);
  await apply.click();
  await expect(page.getByText("LIVE-21", { exact: true })).toBeAttached();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.waitForTimeout(100);
  const start = reads;
  rows = rows.map((row) =>
    row.id === 21
      ? { ...row, customer_name_snapshot: "Updated customer" }
      : row,
  );
  hold = true;
  announce();
  await expect.poll(() => reads).toBeGreaterThan(start);
  await anchor.scrollIntoViewIfNeeded();
  const y = await page.evaluate(() => window.scrollY);
  release();
  await expect(apply).toBeVisible();
  await expect(page.getByText("Updated customer", { exact: true })).toHaveCount(
    0,
  );
  expect(await page.evaluate(() => window.scrollY)).toBe(y);
  await apply.click();
  await expect(
    page.getByText("Updated customer", { exact: true }),
  ).toBeAttached();
});
