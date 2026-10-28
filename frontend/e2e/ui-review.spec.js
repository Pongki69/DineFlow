import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const stage = process.env.DINEFLOW_REVIEW_STAGE || "before";
if (!["before", "after"].includes(stage))
  throw new Error("Choose before or after for the UI review capture.");
const folder = fileURLToPath(
  new URL(`../../docs/ui-review/${stage}/`, import.meta.url),
);
const groups = [
  {
    role: null,
    scenes: [
      ["landing", "/", ".public-menu-grid"],
      ["login", "/login", "input[type=email]"],
    ],
  },
  {
    role: "administrator",
    scenes: [
      ["admin-dashboard", "/admin/dashboard", ".admin-freshness"],
      ["admin-tracking", "/admin/tracking", ".admin-freshness"],
      ["admin-orders", "/admin/orders", ".order-card"],
      ["admin-outlets", "/admin/outlets", ".admin-hours-day"],
      [
        "admin-settings",
        "/admin/system-settings",
        ".business-settings-actions",
      ],
    ],
  },
  {
    role: "manager",
    scenes: [["manager", "/admin/dashboard", ".admin-freshness"]],
  },
  { role: "cashier", scenes: [["cashier", "/payments", ".sage-bill-card"]] },
  {
    role: "kitchen_staff",
    scenes: [["kitchen", "/kitchen", ".sage-kds-ticket"]],
  },
  { role: "waiter", scenes: [["waiter", "/service", ".sage-table-card"]] },
  {
    role: "rider",
    scenes: [
      ["rider", "/rider", ".rider-next-identity"],
      ["rider-deliveries", "/rider/deliveries", ".rider-route-map"],
    ],
  },
  {
    role: "customer",
    scenes: [
      ["customer-menu", "/menu", ".dish-card"],
      ["customer-orders", "/my-orders", ".order-card"],
      ["customer-reservations", "/reserve", ".reservation-booking"],
    ],
  },
];

async function login(page, role) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(`${role}@example.test`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Acceptance-Password-123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#main-content")).toBeVisible();
}

test("screenshots and layout review of populated production pages", async ({
  browser,
}, info) => {
  await mkdir(folder, { recursive: true });
  const manifestPath = path.join(folder, `manifest-${info.project.name}.json`);
  const captures = JSON.parse(
    await readFile(manifestPath, "utf8").catch(() => "[]"),
  );
  const requestedRoles = process.env.DINEFLOW_REVIEW_ROLES?.split(",");
  const requestedScenes = process.env.DINEFLOW_REVIEW_SCENES?.split(",");
  for (const { role, scenes } of groups.filter(
    ({ role, scenes }) =>
      (!requestedRoles || requestedRoles.includes(role || "public")) &&
      (!requestedScenes ||
        scenes.some(([name]) => requestedScenes.includes(name))),
  )) {
    const context = await browser.newContext({
      ...info.project.use,
      geolocation: { latitude: 14.6, longitude: 120.985, accuracy: 15 },
      permissions: ["geolocation"],
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      if (role) await login(page, role);
      for (const [name, url, ready] of scenes.filter(
        ([name]) => !requestedScenes || requestedScenes.includes(name),
      )) {
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await expect(page.locator("h1").first()).toBeVisible();
        if (name === "landing")
          await expect(
            page.getByRole("link", { name: "Order Demo Noodle Bowl" }),
          ).toBeVisible();
        else if (name === "customer-reservations") {
          await page
            .getByRole("button", { name: "Accessible 2D view", exact: true })
            .click();
          await expect(page.locator("canvas")).toHaveCount(0);
        } else await expect(page.locator(ready).first()).toBeVisible();
        if (
          name.startsWith("admin-dashboard") ||
          name === "admin-tracking" ||
          name === "manager"
        )
          await expect(page.locator(".admin-freshness").first()).toContainText(
            "Updated",
          );
        await expect(
          page.locator(
            ".admin-map-loading:visible,.skeleton-grid:visible,.rider-screen-skeleton:visible",
          ),
        ).toHaveCount(0);
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(() => window.scrollTo(0, 0));
        if (stage === "after" && info.project.name === "mobile") {
          for (const width of [375, 430]) {
            await page.setViewportSize({ width, height: 844 });
            expect
              .soft(
                await page.evaluate(() => document.documentElement.scrollWidth),
                `${name} overflows at ${width}px`,
              )
              .toBeLessThanOrEqual(width + 1);
          }
          await page.setViewportSize({ width: 390, height: 844 });
        }
        await record(name);
        if (name === "cashier") {
          await page.locator(".sage-bill-card .sage-button").first().click();
          await expect(page.getByRole("dialog")).toBeVisible();
          await record("cashier-payment-sheet");
          await page.keyboard.press("Escape");
        }
        if (name === "customer-menu") {
          await page
            .locator(".dish-card")
            .first()
            .getByRole("button", { name: "Add to order", exact: true })
            .click();
          await expect(page.locator(".order-summary.has-items")).toBeVisible();
          await page.evaluate(() => window.scrollTo(0, 0));
          await record("customer-cart");
          const shortcut = page.locator(".customer-cart-shortcut button");
          if (await shortcut.isVisible()) await shortcut.click();
          else await page.locator(".order-summary").scrollIntoViewIfNeeded();
          await record("customer-checkout");
        }
        if (stage === "after" && name === "admin-tracking") {
          await page
            .getByRole("button", { name: "Enter fullscreen map", exact: true })
            .click();
          await expect(
            page.getByRole("dialog", { name: "Fullscreen delivery map" }),
          ).toBeVisible();
          await expect(
            page.locator(
              ".admin-map--fullscreen .leaflet-tile:not(.leaflet-tile-loaded)",
            ),
          ).toHaveCount(0, { timeout: 15000 });
          await record("admin-map-fullscreen");
          await page
            .getByRole("button", { name: "Exit fullscreen map", exact: true })
            .click();
        }
        if (
          stage === "after" &&
          ["admin-dashboard", "rider", "customer-menu"].includes(name)
        ) {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page
            .getByRole("button", { name: "Switch to dark mode", exact: true })
            .click();
          await record(`${name}-dark`);
          await page
            .getByRole("button", { name: "Switch to light mode", exact: true })
            .click();
          if (info.project.name === "mobile") {
            const open = page.getByRole("button", {
              name: "Open navigation",
              exact: true,
            });
            await open.click();
            await record(`${name}-navigation`);
            await page
              .getByRole("button", { name: "Close navigation", exact: true })
              .click();
            await expect(open).toBeFocused();
          }
        }
        expect(errors).toEqual([]);
      }
    } finally {
      await context.close();
    }
    async function record(name) {
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      await page.waitForFunction(
        () =>
          [...document.querySelectorAll(".leaflet-tile")]
            .filter((tile) => tile.getClientRects().length)
            .every((tile) => tile.complete),
        null,
        { timeout: 15000 },
      );
      const filename = `${name}-${info.project.name}`;
      const metrics = await page.evaluate(() => {
        const rect = (selector) => {
          const node = document.querySelector(selector);
          if (!node) return null;
          const box = node.getBoundingClientRect();
          return {
            x: Math.round(box.x),
            y: Math.round(box.y),
            width: Math.round(box.width),
            height: Math.round(box.height),
          };
        };
        return {
          viewport: { width: innerWidth, height: innerHeight },
          pageWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          heading: document.querySelector("h1")?.textContent,
          headingBox: rect("h1"),
          header: rect(".app-topbar,.admin-topbar,.public-header"),
          firstTicket: rect(".sage-kds-ticket"),
          firstTable: rect(".sage-table-card"),
          firstDish: rect(".dish-card"),
          firstAdd: rect(".dish-card form button"),
          firstCashierAction: rect(".sage-bill-card .sage-button"),
          paymentSheet: rect(".sage-payment-review[open]"),
          nextDelivery: rect(".rider-next-delivery"),
          cart: rect(".order-summary"),
          cartBar: rect(".customer-cart-shortcut"),
        };
      });
      await page.screenshot({
        path: path.join(folder, `${filename}.png`),
        fullPage: false,
        animations: "disabled",
      });
      await page.screenshot({
        path: path.join(folder, `${filename}-full.png`),
        fullPage: true,
        animations: "disabled",
      });
      let violations = [];
      if (stage === "after") {
        const result = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        violations = result.violations.map(({ id, nodes }) => ({
          id,
          targets: nodes.map((node) => node.target),
        }));
      }
      const previous = captures.findIndex((capture) => capture.name === name);
      if (previous !== -1) captures.splice(previous, 1);
      captures.push({
        name,
        device: info.project.name,
        ...metrics,
        violations,
      });
      await writeFile(manifestPath, JSON.stringify(captures, null, 2));
      if (stage === "after") {
        expect
          .soft(metrics.pageWidth, `${name} has horizontal overflow`)
          .toBeLessThanOrEqual(metrics.clientWidth + 1);
        expect
          .soft(violations, `${name} has accessibility violations`)
          .toEqual([]);
        if (["rider", "rider-deliveries"].includes(name)) {
          expect
            .soft(metrics.header.height, `${name} header is too tall`)
            .toBeLessThanOrEqual(100);
          expect
            .soft(metrics.headingBox.y, `${name} title is hidden by the header`)
            .toBeGreaterThanOrEqual(metrics.header.y + metrics.header.height);
        }
      }
      console.log(`${stage}: ${name} ${info.project.name}`);
    }
  }
});
