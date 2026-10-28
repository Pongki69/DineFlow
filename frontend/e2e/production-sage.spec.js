import { test, expect } from "@playwright/test";
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

async function noOverflow(page) {
  const layout = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return {
      width,
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      overflowingText: [...document.querySelectorAll(".admin-shell *")]
        .filter(
          (node) =>
            node.childNodes.length &&
            [...node.childNodes].some(
              (child) =>
                child.nodeType === Node.TEXT_NODE && child.textContent.trim(),
            ),
        )
        .flatMap((node) =>
          [...node.childNodes]
            .filter(
              (child) =>
                child.nodeType === Node.TEXT_NODE && child.textContent.trim(),
            )
            .map((child) => {
              const range = document.createRange();
              range.selectNodeContents(child);
              return {
                class: node.getAttribute("class"),
                text: child.textContent.trim().slice(0, 70),
                right: range.getBoundingClientRect().right,
              };
            }),
        )
        .filter(({ right }) => right > width + 1)
        .slice(0, 12),
      offenders: [...document.querySelectorAll("body *")]
        .filter((node) => {
          const rect = node.getBoundingClientRect();
          return (
            rect.width > 0 &&
            rect.right > width + 1 &&
            getComputedStyle(node).position !== "fixed" &&
            !node.closest(".leaflet-pane,.admin-table-scroll")
          );
        })
        .slice(0, 12)
        .map((node) => ({
          tag: node.tagName,
          class: node.getAttribute("class"),
          right: node.getBoundingClientRect().right,
          width: node.getBoundingClientRect().width,
        })),
    };
  });
  expect(layout.scrollWidth <= layout.width + 1, JSON.stringify(layout)).toBe(
    true,
  );
}

async function audit(page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    result.violations.map(({ id, nodes }) => ({
      id,
      targets: nodes.map((node) => node.target),
    })),
  ).toEqual([]);
}

async function themeSettled(page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) => animation.effect?.getTiming().iterations !== Infinity,
        )
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
}

test("public landing reads restaurant data and preserves booking sign-in destination", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Less waiting/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Order Demo Noodle Bowl" }),
  ).toBeVisible();
  await expect(page.getByText("₱100.00").first()).toBeVisible();
  await expect(page.locator(".df-review-toolbar")).toHaveCount(0);
  await audit(page);
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath(`landing-${info.project.name}.png`),
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: /Switch to dark (mode|theme)/ })
    .click();
  await themeSettled(page);
  await audit(page);
  await noOverflow(page);
  await page
    .getByRole("button", { name: /Switch to light (mode|theme)/ })
    .click();
  await themeSettled(page);
  await page
    .getByRole("link", { name: "Book a table", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("customer@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Acceptance-Password-123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/reserve$/);
  await expect(page.locator("#main-content")).toBeVisible();
});

const roles = [
  ["administrator", "/admin/dashboard", ".admin-page"],
  ["manager", "/admin/dashboard", ".admin-page"],
  ["cashier", "/payments", ".sage-payments"],
  ["kitchen_staff", "/kitchen", ".sage-kitchen"],
  ["waiter", "/service", ".sage-service"],
  ["rider", "/rider", ".rider-sage-home"],
  ["customer", "/menu", ".customer-menu"],
];

for (const [role, path, selector] of roles) {
  test(`${role} uses the production Sage workspace with real permissions`, async ({
    page,
  }, info) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await login(page, role);
    await page.goto(path);
    await expect(page.locator(selector)).toBeVisible();
    await expect(page.locator("#main-content h1")).toBeVisible();
    await expect(page.locator(".app-shell,.admin-shell")).toHaveAttribute(
      "data-role",
      role,
    );
    await expect(page.locator(".app-shell,.admin-shell")).toHaveCSS(
      "background-color",
      "rgb(247, 249, 245)",
    );
    await expect(page.locator(".df-review-toolbar")).toHaveCount(0);
    await expect(
      page.locator(
        ".skeleton-grid:visible,.rider-skeleton:visible,.admin-map-loading:visible",
      ),
    ).toHaveCount(0);
    await audit(page);
    await noOverflow(page);
    await page.screenshot({
      path: info.outputPath(`${role}-${info.project.name}.png`),
      fullPage: true,
      animations: "disabled",
    });
    await page.getByRole("button", { name: "Switch to dark mode" }).click();
    await themeSettled(page);
    await expect(page.locator(".app-shell,.admin-shell")).toHaveAttribute(
      "data-theme",
      "dark",
    );
    await audit(page);
    await noOverflow(page);
    if (role === "manager") {
      await expect(
        page.getByRole("link", { name: "Restaurant outlets", exact: true }),
      ).toHaveCount(0);
      await page.goto("/admin/users");
      await expect(
        page.getByRole("heading", { name: "Not found", exact: true }),
      ).toBeVisible();
    }
    if (role === "kitchen_staff") {
      await expect(
        page.getByRole("link", { name: "Payments & refunds", exact: true }),
      ).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });
}

async function serverRequest(page, path, method = "GET", data) {
  const token = (await page.context().cookies()).find(
    (cookie) => cookie.name === "XSRF-TOKEN",
  )?.value;
  const response = await page.request.fetch(
    `http://127.0.0.1:8091/api/v1${path}`,
    {
      method,
      data,
      headers: {
        Accept: "application/json",
        Origin: new URL(page.url()).origin,
        Referer: page.url(),
        ...(token ? { "X-XSRF-TOKEN": decodeURIComponent(token) } : {}),
      },
    },
  );
  expect(response.ok(), `${method} ${path} returned ${response.status()}`).toBe(
    true,
  );
  return response.json();
}

test("real pickup order reaches kitchen and cash settlement through redesigned screens", async ({
  browser,
}, info) => {
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  try {
    const [customer, admin, kitchen, cashier] = await Promise.all(
      contexts.map((context) => context.newPage()),
    );
    await login(customer, "customer");
    const menu = await serverRequest(
      customer,
      "/menu/items?q=Demo%20Noodle%20Bowl",
    );
    const order = (
      await serverRequest(customer, "/orders", "POST", {
        order_type: "pickup",
        items: [{ menu_item_id: menu.data[0].id, quantity: 1, addon_ids: [] }],
      })
    ).data;
    await login(admin, "administrator");
    await serverRequest(admin, `/orders/${order.id}/status`, "PATCH", {
      status: "confirmed",
    });
    await login(kitchen, "kitchen_staff");
    await kitchen.goto("/kitchen");
    const ticket = kitchen.getByRole("article", {
      name: `Kitchen order ${order.order_number}`,
      exact: true,
    });
    await ticket
      .getByRole("button", { name: "Start preparing", exact: true })
      .click();
    await ticket
      .getByRole("button", { name: "Mark ready", exact: true })
      .click();
    await expect(ticket).toHaveCount(0);
    await expect(
      kitchen.getByRole("status").filter({ hasText: /ready for handoff/ }),
    ).toBeVisible();
    await login(cashier, "cashier");
    await cashier.goto("/payments");
    const bill = cashier
      .locator(".sage-bill-card")
      .filter({ hasText: order.order_number });
    await bill.getByRole("button", { name: "Review payment" }).click();
    const review = cashier.getByRole("dialog", {
      name: order.order_number,
      exact: true,
    });
    await expect(review).toBeVisible();
    await audit(cashier);
    await cashier.screenshot({
      path: info.outputPath(`cashier-payment-review-${info.project.name}.png`),
      fullPage: true,
    });
    await review
      .getByRole("button", { name: "Record cash", exact: true })
      .click();
    await expect(review).not.toBeVisible();
    await expect(
      cashier.getByRole("status").filter({ hasText: "Cash payment recorded" }),
    ).toBeVisible();
    const saved = await serverRequest(admin, `/orders/${order.id}`);
    expect(saved.data.status).toBe("ready_to_serve");
    expect(Number(saved.data.payment_summary.balance_due)).toBe(0);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test("sign-in return destinations stay inside permitted app routes", async ({
  page,
}) => {
  await page.goto("/login?next=https%3A%2F%2Fexample.com%2Fsteal");
  await page.getByLabel("Email", { exact: true }).fill("cashier@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Acceptance-Password-123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator(".app-shell")).toHaveAttribute(
    "data-role",
    "cashier",
  );
});
