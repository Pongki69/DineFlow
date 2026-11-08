import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const pages = [
  ["dashboard", "/admin/dashboard"],
  ["tracking", "/admin/tracking"],
  ["outlets", "/admin/outlets"],
  ["orders", "/admin/orders"],
  ["system-settings", "/admin/system-settings"],
  ["dispatch", "/admin/deliveries"],
  ["reports", "/reports"],
  ["reserve", "/reserve"],
  ["my-reservations", "/my-reservations"],
  ["reservations", "/reservations"],
  ["floor-plan", "/admin/floor-plan"],
  ["menu", "/admin/menu"],
  ["kitchen", "/kitchen"],
  ["service", "/service"],
  ["payments", "/payments"],
  ["daily-transactions", "/cashier/summary"],
  ["team", "/admin/users"],
  ["customers", "/admin/customers"],
  ["audit", "/admin/audit"],
  ["activity", "/activity"],
  ["preferences", "/settings"],
  ["reservation-settings", "/admin/settings"],
  ["payment-settings", "/admin/payment-settings"],
  ["delivery-settings", "/admin/delivery"],
  ["restaurant-overview", "/dashboard"],
  ["account", "/account"],
];

async function login(page) {
  await page.goto("/login");
  await page
    .getByLabel("Email", { exact: true })
    .fill("administrator@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Acceptance-Password-123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".admin-shell")).toBeVisible();
}

async function loaded(page) {
  await expect(page.locator("#main-content h1").first()).toBeVisible();
  await expect(
    page.locator(
      ".skeleton-grid:visible,.admin-map-loading:visible,.loading:visible,.admin-value-skeleton:visible",
    ),
  ).toHaveCount(0);
  await page.evaluate(() => {
    for (const animation of document.getAnimations())
      if (animation.effect?.getTiming().iterations !== Infinity)
        animation.finish();
  });
}

// Two frames of the same page can differ by one colour step where a rounded
// corner sits on a fractional pixel. A styling change moves pixels or shifts
// colours by far more, so up to two steps per channel still counts as equal.
async function sameScreenshot(page, a, b) {
  if (a.equals(b)) return true;
  const scratch = await page.context().newPage();
  try {
    return await scratch.evaluate(
      async ([first, second]) => {
        const load = (data) =>
          new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = reject;
            image.src = "data:image/png;base64," + data;
          });
        const pixels = (image) => {
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext("2d");
          context.drawImage(image, 0, 0);
          return context.getImageData(0, 0, image.width, image.height).data;
        };
        const [one, two] = await Promise.all([load(first), load(second)]);
        if (one.width !== two.width || one.height !== two.height) return false;
        const x = pixels(one);
        const y = pixels(two);
        for (let index = 0; index < x.length; index += 1)
          if (Math.abs(x[index] - y[index]) > 2) return false;
        return true;
      },
      [a.toString("base64"), b.toString("base64")],
    );
  } finally {
    await scratch.close();
  }
}

async function fitsViewport(page) {
  const widths = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(widths[0]).toBeLessThanOrEqual(widths[1] + 1);
}

test("administrator uses the full desktop workspace at 1080p and 1440p", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "Checks large desktop resolutions.",
  );
  test.setTimeout(90000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await login(page);
  const columns = [];
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 2560, height: 1440 },
  ]) {
    await page.setViewportSize(viewport);
    for (const name of ["dashboard", "menu", "tracking"]) {
      await page.goto(pages.find(([key]) => key === name)[1]);
      await loaded(page);
      await fitsViewport(page);
      const content = await page.locator(".admin-content").boundingBox();
      const body = await page.locator(".admin-body").boundingBox();
      expect(content.width).toBeGreaterThanOrEqual(body.width - 1);
      if (name === "menu")
        columns.push(
          await page
            .locator(".catalog-list")
            .evaluate(
              (list) =>
                getComputedStyle(list).gridTemplateColumns.split(" ").length,
            ),
        );
      await page.screenshot({
        path: info.outputPath(
          name + "-" + viewport.width + "x" + viewport.height + ".png",
        ),
        animations: "disabled",
      });
    }
  }
  expect(columns[1]).toBeGreaterThan(columns[0]);
  // Lists and forms stop at a readable width, centred in the wide column.
  for (const name of ["team", "reservations"]) {
    await page.goto(pages.find(([key]) => key === name)[1]);
    await loaded(page);
    const { width, left, right } = await page
      .locator("#main-content > section")
      .first()
      .evaluate((section) => {
        const box = section.getBoundingClientRect();
        const column = section.parentElement.getBoundingClientRect();
        return {
          width: box.width,
          left: box.left - column.left,
          right: column.right - box.right,
        };
      });
    expect(width).toBeLessThanOrEqual(1441);
    expect(Math.abs(left - right)).toBeLessThanOrEqual(2);
  }
});

test("administrator desktop pages share a usable layout across the captured workspace", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "Desktop capture covers the specified breakpoint.",
  );
  test.setTimeout(240000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page);
  for (const [name, path] of pages) {
    await test.step(name, async () => {
      await page.goto(path);
      await loaded(page);
      await expect(page.locator("#main-content")).not.toContainText(
        "Not found",
      );
      await fitsViewport(page);
      await page.screenshot({
        path: info.outputPath(name + "-desktop.png"),
        fullPage: true,
        animations: "disabled",
      });
    });
  }
  await page.setViewportSize({ width: 1024, height: 900 });
  for (const name of [
    "dashboard",
    "tracking",
    "orders",
    "menu",
    "team",
    "preferences",
  ]) {
    await page.goto(pages.find(([key]) => key === name)[1]);
    await loaded(page);
    await fitsViewport(page);
    await page.screenshot({
      path: info.outputPath(name + "-1024.png"),
      animations: "disabled",
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  for (const name of ["dashboard", "orders", "menu", "preferences"]) {
    await page.goto(pages.find(([key]) => key === name)[1]);
    await loaded(page);
    await fitsViewport(page);
    const audit = await new AxeBuilder({ page })
      .include("#main-content")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      audit.violations.map(({ id, nodes }) => ({
        id,
        targets: nodes.map(({ target }) => target),
      })),
    ).toEqual([]);
    await page.screenshot({
      path: info.outputPath(name + "-dark.png"),
      fullPage: true,
      animations: "disabled",
    });
  }
  expect(errors).toEqual([]);
});

test("administrator redesign leaves viewports below 1024 visually identical", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "One context checks the exact viewport boundary.",
  );
  test.setTimeout(240000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await login(page);
  const desktopStyles = (disabled) =>
    page.evaluate((disabled) => {
      const styles = [
        ...document.querySelectorAll("style[data-vite-dev-id]"),
      ].filter((node) =>
        /adminDesktop[.]css|adminOverviewDesktop[.]css|adminToolsDesktop[.]css/.test(
          node.dataset.viteDevId,
        ),
      );
      if (styles.length < 3)
        throw new Error("Desktop stylesheets were not loaded.");
      for (const style of styles) style.sheet.disabled = disabled;
    }, disabled);
  for (const width of [390, 850, 1023]) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of [
      "dashboard",
      "tracking",
      "outlets",
      "orders",
      "menu",
      "kitchen",
      "service",
      "payments",
      "team",
      "preferences",
    ]) {
      await page.goto(pages.find(([key]) => key === name)[1]);
      await loaded(page);
      await expect(
        page.getByRole("navigation", { name: "Workspace tools" }),
      ).toHaveCount(0);
      await expect(page.locator(".admin-page-context")).toHaveCount(0);
      // Maps load tiles, timers tick and the live-updates status changes on
      // its own schedule: mask those so only styling can differ.
      const capture = () =>
        page.screenshot({
          animations: "disabled",
          mask: [
            page.locator(
              ".leaflet-container, [role='timer'], .live-updates-bar, .admin-freshness",
            ),
          ],
        });
      const before = await capture();
      await desktopStyles(true);
      const withoutDesktopStyles = await capture();
      await desktopStyles(false);
      expect(
        await sameScreenshot(page, before, withoutDesktopStyles),
        "Desktop styles changed the " + name + " page at " + width + "px",
      ).toBe(true);
    }
  }
});
