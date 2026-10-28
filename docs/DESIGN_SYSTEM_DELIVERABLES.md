# DineFlow design-system deliverables and working guide

**Production update — 28 October 2026:** the design is now applied to the real application at `http://localhost:5173/`, including the public landing and all seven role workspaces. Read [PRODUCTION_SAGE_ROLLOUT.md](PRODUCTION_SAGE_ROLLOUT.md) for real routes, API integration and validation. The design lab described below remains a separate reference deliverable.

This handoff contains the four requested deliverables as complete local source, specifications, and runnable reference layouts. The design lab is a separate Vite HTML entry using the existing React, JSX, plain CSS, Lucide, Vitest, and Playwright stack. It does not require a signed-in account, call production APIs, create payments, request GPS, or change the restaurant's saved policies. Its persistent fixture label and USD formatting identify the demonstration data.

Start with the [24 captured responsive layouts](design-system/previews/index.html) and the [completed verification record](DESIGN_SYSTEM_VALIDATION.md). Source, specifications, full component examples and mock data are linked below.

The production app remains at `index.html`; the reference experience is `design-lab.html`. Both are declared in the existing Vite build configuration. A build can therefore include the reference page; `noindex, nofollow` discourages indexing but is not access control. Deploy only the production entry or protect/exclude the reference page if that page is not intended to be reachable in the deployed build.

## 1. Atomic design tokens

| File                                                                                      | Delivered content                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`frontend/src/design-tokens.css`](../frontend/src/design-tokens.css)                     | Complete namespaced raw/semantic palette, light and dark themes, major-third typography, 4/8px spacing, geometry, elevations, touch sizes, layering, motion, and reduced-motion tokens. |
| [`DESIGN_TOKENS.md`](DESIGN_TOKENS.md)                                                    | Token meaning, approved color pairs, exact requested palette, usage rules, sample import, migration sequence, and scope limits.                                                         |
| [`frontend/scripts/check-design-tokens.mjs`](../frontend/scripts/check-design-tokens.mjs) | Dependency-free relative-luminance checker and reproducible evidence generation.                                                                                                        |
| [`design-token-contrast.json`](design-token-contrast.json)                                | Source hash, measurement method, 60 measured foreground/background pairs, thresholds, and raw-palette comparisons.                                                                      |

The exact requested sage/forest primitives are preserved. The semantic secondary text and badge foregrounds are strengthened to target **7:1 normal-text contrast**. The brief's `#5A6B63`, amber, teal, terracotta, and olive values cannot all serve as AAA normal text on white. The specification records this conflict rather than labeling an unmeasured palette compliant. Focus indicators and essential input boundaries target their applicable **3:1 non-text** threshold.

The project uses Tailwind CSS 4 already; the CSS Variables option avoids adding a competing legacy Tailwind configuration. Import these tokens into an opt-in `.df-theme` root and consume `--df-*` variables. They do not alias or override the existing live app's design tokens.

## 2. Design-system and heuristics audit

Read [`DESIGN_SYSTEM_AUDIT.md`](DESIGN_SYSTEM_AUDIT.md) for the source-based review of information architecture, Gestalt grouping, progressive disclosure, visual hierarchy, keyboard/focus behavior, contrast, feedback states, responsiveness, CSS debt, and permission boundaries. It distinguishes the operational app, newly delivered reference components, and proposed workflows.

The audit's accessibility matrix is an assessment and verification plan, not an AAA certification. Token measurements and automated axe scans cannot establish every WCAG criterion. Manual review must still cover screen readers, keyboard order, zoom/text spacing, reflow, focus under sticky elements, error prevention, timing, interruption, and applicable content/media criteria. Source links allow each finding to be checked against implementation.

The audit also separates product requirements from current backend behavior:

- Cashier shift reconciliation requires a real shift ledger and audit/approval rules; the reference drawer is a local comparison tool.
- Staff mobile order creation requires guest/session attribution and server authorization; the waiter wizard does not submit a kitchen order.
- Browser GPS is not guaranteed background tracking, and the rider diagram is not turn-by-turn voice navigation.
- Automatic per-guest deposit refunds and new USD pricing tiers are business-policy changes, not style changes.
- The current restaurant configuration is one primary outlet; the brief does not itself implement independent multi-branch operations.

## 3. High-fidelity responsive layouts

Read [`RESPONSIVE_LAYOUTS.md`](RESPONSIVE_LAYOUTS.md) for complete component breakdowns, priorities, grid behavior, navigation, drawers, and state handling at **desktop 1280px+**, **tablet 768–1024px**, and **mobile 375–430px**. The executable layouts live in [`DesignLab.jsx`](../frontend/src/design-lab/DesignLab.jsx) with [`designLab.css`](../frontend/src/design-lab/designLab.css); their role/view models live in [`model.js`](../frontend/src/design-lab/model.js).

Start the existing frontend development server from `frontend/`:

```text
npm run dev -- --host 127.0.0.1 --port 5192 --strictPort
```

Open `http://127.0.0.1:5192/design-lab.html`. The same path works on a different Vite port if one is selected intentionally. Use the **Screen** selector or these query values:

| View           | URL path                              | Main layout and interactions                                                                                                    |
| -------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Public landing | `/design-lab.html?view=landing`       | Editorial hero, menu entry, dish customization, reservation wizard, delivery-policy preview, and responsive cart summary.       |
| Administrator  | `/design-lab.html?view=administrator` | Exceptions/metrics, illustrative delivery coverage, service pulse, searchable/filterable orders, detail drawer, and pagination. |
| Manager        | `/design-lab.html?view=manager`       | Operations metrics, dining-room context, delivery attention, and order queue with operational task navigation.                  |
| Cashier        | `/design-lab.html?view=cashier`       | Outstanding bills, totals, bill-review drawer, sample payment controls, and proposed reconciliation drawer.                     |
| Kitchen Staff  | `/design-lab.html?view=kitchen_staff` | Readable ticket grid, elapsed times, item/options grouping, priority state, and local mark-ready interaction.                   |
| Waiter         | `/design-lab.html?view=waiter`        | Area filters, table occupancy cards, guest/session context, and proposed table-order wizard.                                    |
| Delivery Rider | `/design-lab.html?view=rider`         | Simulated online toggle, current delivery, pickup/drop-off context, progress steps, and coverage expansion.                     |
| Customer       | `/design-lab.html?view=customer`      | Category filters, dish search, variants/add-ons, local bag, reservation entry, and a mobile cart bar.                           |

These are eight reviewable page templates, not eight alternate authentication modes. The role selector changes the specimen only; it cannot grant live access. Secondary task buttons identify contextual destinations through a drawer; the corresponding live routes and implementation boundaries are documented in the responsive specification instead of pretending every destination has been rebuilt in this preview.

The review toolbar also provides **Populated, Loading, Empty, and Error** states plus a **light/dark** toggle. Administrator and Manager expose a **128-row stress test**. Use the table search, status filter, optional payment filter, page controls, and rows-per-page selector to test list behavior. The source four-order fixture stays unchanged; volume mode creates 128 explicitly synthetic `sample_0001`–`sample_0128` records with unique IDs.

On smaller layouts, global navigation moves into a modal drawer. Orders become contained definition-list cards when the content container cannot support the full table. Cashier/bill and detail drawers adapt to mobile height and safe areas. Kitchen tickets reduce columns; rider actions remain within the narrow-screen workflow. Test the real CSS at the requested widths rather than scaling a desktop screenshot down.

## 4. Reusable components and integrated mock data

| File                                                                                            | Purpose                                                                                |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [`frontend/src/mocks/productionTestData.js`](../frontend/src/mocks/productionTestData.js)       | All supplied restaurant, users, menu items, tables, and orders.                        |
| [`frontend/src/design-lab/types.d.ts`](../frontend/src/design-lab/types.d.ts)                   | Explicit TypeScript interfaces for fixtures and component props.                       |
| [`frontend/src/design-lab/components.jsx`](../frontend/src/design-lab/components.jsx)           | Strictly checked JSDoc React implementations.                                          |
| [`frontend/src/design-lab/components.css`](../frontend/src/design-lab/components.css)           | Namespaced responsive component styles and states.                                     |
| [`frontend/src/design-lab/components.test.jsx`](../frontend/src/design-lab/components.test.jsx) | Pagination, badge, table/state, and modal behavior tests.                              |
| [`frontend/src/design-lab/model.test.js`](../frontend/src/design-lab/model.test.js)             | View selection, fixture preservation, synthetic-volume behavior, and formatting tests. |

The supplied Markdown-form image strings are normalized to actual HTTPS URL strings so `<img src>` can render them. Menu/user/order values and original IDs otherwise remain the provided fixtures. Images are external preview assets and have loading/failure handling; they are not bundled production-owned food photography.

`productionTestData.js` is the requested filename, not a claim that these records are production data. Its currency is **USD**, while the live application's order calculation currently uses **PHP**. No currency conversion, policy migration, payment creation, or database seeding occurs. Item `price` fields and existing order totals are preserved because their unit-versus-line meaning is inconsistent; the audit records these ambiguities. No authoritative order total is recalculated from those ambiguous historical lines.

### Component contracts

| Export                | Props and behavior                                                                                                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Pagination`          | Controlled `page`, `pageSize`, `total`, `onPageChange`, `onPageSizeChange`; clamps invalid/stale pages, shows total range and page labels, disables unavailable moves, and uses ellipses for larger ranges. The caller slices the records. |
| `ResponsiveDataTable` | `orders`, `onView`, optional `loading`, `error`, `onRetry`; real desktop table semantics, mobile record cards, explicit money/time labels, and loading/empty/error handling.                                                               |
| `StatusBadge`         | `status`; normalizes display wording, provides text plus a semantic icon, and maps to the approved semantic pair.                                                                                                                          |
| `Drawer`              | Controlled `open`, `onClose`, `title`, `children`, optional `side` (`right`, `left`, or `bottom`); native modal dialog, label association, keyboard containment, Escape, scroll locking, and return of focus.                              |
| `StatePanel`          | `state` (`loading`, `empty`, `error`, `success`), optional title/description/retry; visible copy plus appropriate status or alert semantics.                                                                                               |

### Complete controlled example

The following component can be saved as `frontend/src/design-lab/OrdersExample.jsx` and rendered from an existing React root. It imports the real delivered components and fixture data, starts on page two, supports search and page size, opens selected-order details, and uses a bottom-sheet drawer. No additional dependency or API server is required. The example deliberately displays preserved fixture totals instead of inventing payment logic.

```jsx
// @ts-check
import { useId, useMemo, useState } from "react";
import "../design-tokens.css";
import "./components.css";
import {
  Drawer,
  Pagination,
  ResponsiveDataTable,
  StatusBadge,
} from "./components";
import { MOCK_ORDERS, MOCK_RESTAURANT_INFO } from "../mocks/productionTestData";

/** @typedef {import("./types").MockOrder} MockOrder */

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: MOCK_RESTAURANT_INFO.currency,
});

export function OrdersExample() {
  const searchId = useId();
  const headingId = useId();
  const [page, setPage] = useState(2);
  const [pageSize, setPageSize] = useState(2);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(
    /** @type {MockOrder | null} */ (null),
  );
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return MOCK_ORDERS.filter((order) =>
      `${order.id} ${order.customerName} ${order.tableNumber || ""}`
        .toLowerCase()
        .includes(term),
    );
  }, [query]);
  const lastPage = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, lastPage);
  const visible = filtered.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  return (
    <section
      className="df-theme"
      data-df-theme="light"
      aria-labelledby={headingId}
      style={{
        background: "var(--df-canvas)",
        color: "var(--df-text)",
        fontFamily: "var(--df-font-family)",
        lineHeight: "var(--df-leading-normal)",
        padding: "var(--df-space-4)",
        minWidth: 0,
      }}
    >
      <header>
        <h1 id={headingId}>Orders in focus</h1>
        <p style={{ color: "var(--df-text-secondary)" }}>
          Four supplied USD fixtures. All actions stay in this preview.
        </p>
      </header>

      <label htmlFor={searchId}>Search order, guest, or table</label>
      <input
        id={searchId}
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setPage(1);
        }}
        style={{
          display: "block",
          width: "100%",
          maxWidth: "32rem",
          minHeight: "var(--df-target-size)",
          marginBlock: "var(--df-space-2) var(--df-space-6)",
          padding: "var(--df-space-3)",
          border: "1px solid var(--df-color-control-border)",
          borderRadius: "var(--df-radius-sm)",
          background: "var(--df-surface)",
          color: "var(--df-text)",
          font: "inherit",
        }}
      />

      <ResponsiveDataTable orders={visible} onView={setSelected} />
      <Pagination
        page={safePage}
        pageSize={pageSize}
        total={filtered.length}
        onPageChange={setPage}
        onPageSizeChange={(nextSize) => {
          setPageSize(nextSize);
          setPage(1);
        }}
      />

      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? `Order details · ${selected.id}` : "Order details"}
        side="bottom"
      >
        {selected && (
          <article>
            <h3>{selected.customerName}</h3>
            <p>
              {selected.orderType}
              {selected.tableNumber ? ` · ${selected.tableNumber}` : ""}
            </p>
            <p>
              <StatusBadge status={selected.status} />{" "}
              <StatusBadge status={selected.paymentStatus} />
            </p>
            <ul>
              {selected.items.map((item, index) => (
                <li key={`${item.name}-${index}`}>
                  <strong>
                    {item.qty} × {item.name}
                  </strong>
                  <p>
                    {item.variant}
                    {item.addOns.length
                      ? ` · ${item.addOns.join(", ")}`
                      : " · No add-ons"}
                  </p>
                </li>
              ))}
            </ul>
            <dl>
              <dt>Subtotal (USD)</dt>
              <dd>{currency.format(selected.subtotal)}</dd>
              {selected.serviceCharge !== undefined && (
                <>
                  <dt>Service charge</dt>
                  <dd>{currency.format(selected.serviceCharge)}</dd>
                </>
              )}
              {selected.deliveryFee !== undefined && (
                <>
                  <dt>Delivery fee</dt>
                  <dd>{currency.format(selected.deliveryFee)}</dd>
                </>
              )}
              <dt>Tax</dt>
              <dd>{currency.format(selected.tax)}</dd>
              <dt>Total (USD)</dt>
              <dd>
                <strong>{currency.format(selected.total)}</strong>
              </dd>
            </dl>
            <p style={{ color: "var(--df-text-secondary)" }}>
              This drawer preserves the supplied order totals. No cash, checkout
              session, or refund is created.
            </p>
          </article>
        )}
      </Drawer>
    </section>
  );
}
```

The heading and input use React `useId` so multiple mounted examples do not repeat label IDs. For live adoption, map the server's order DTO into a production component contract with the correct currency, avoid importing fixture records into an operational page, and continue to enforce ownership and permissions on the server.

## Verification commands and evidence boundaries

Run these commands from `frontend/`:

| Command                                | Checks                                                                                                                                                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check:design`                 | Strict JSDoc/TypeScript checking of design-lab source and fixture interfaces, then token contrast evidence freshness and thresholds.                                                                  |
| `npm run test:design`                  | Focused component and view-model unit tests.                                                                                                                                                          |
| `npm run test:design:e2e`              | Desktop/tablet/mobile browser checks for all eight templates, light/dark automated accessibility, overflow, screenshots, filtering/pagination, modal focus return, and menu/reservation interactions. |
| `npm run lint`                         | Existing project's ESLint checks.                                                                                                                                                                     |
| `npm run build`                        | Existing app and design-lab Vite production entries.                                                                                                                                                  |
| `node scripts/check-design-tokens.mjs` | Regenerate the contrast evidence after changing tokens.                                                                                                                                               |

The browser configuration is [`playwright.design-lab.config.js`](../frontend/playwright.design-lab.config.js). It uses representative **1440×1000 desktop**, **834×1112 tablet**, and **390×844 mobile** projects. The layout specification additionally calls for checks at range boundaries, including 375px and 430px; a representative viewport is not proof of every intervening width. The configuration accepts `PLAYWRIGHT_CHROMIUM_EXECUTABLE` for an already installed compatible Chromium binary if the default Playwright installation is unavailable. It starts its own local Vite server at port 5192 and does not start Laravel or seed a database.

Browser artifacts are written to `frontend/test-results/design-lab/`, including full-page screenshots and retained failure traces. Unit tests exercise behavior; screenshots support visual inspection. Axe checks are valuable automated evidence but cannot assess the complete WCAG conformance claim. The final task report records which commands actually completed in the working environment; this command table is a reproducible verification guide rather than an assertion that every check has already passed.

The final run passed 34 browser checks (with two duplicate boundary sweeps intentionally skipped), 32 focused unit/regression tests, lint, build and 60 contrast-pair checks. All eight templates were additionally checked at 375/430/768/1024/1280px. Run `node scripts/export-design-previews.mjs` after the full browser suite to regenerate the 24-file static library. The mobile rider capture uses the viewport to make its bottom action dock visible; other captures are full-page. See the verification record for limits and manual work still required.

## Review and implementation sequence

1. Open all eight specimens in both themes at the documented viewport sizes. Review exception priority, names, totals, wrapping, table/card equivalence, and the placement of primary actions.
2. Exercise populated, loading, empty, error/retry, filtered-zero, two-page, and 128-record states. Open drawers with the keyboard; confirm Escape, focus containment, close, and return of focus.
3. Resolve the documented policy contradictions with the business owner before changing production calculations or authorization. In particular, establish currency, tax base, item unit/line semantics, per-guest deposit basis, refund eligibility, and delivery-fee rounding.
4. Migrate one production component's complete token/state set, retain its API and permission boundaries, and run the relevant operational regression tests before expanding to other roles.

Namespaced reference code makes the deliverables reviewable and reusable while keeping mock workflows and unapproved financial policy changes out of live operations.
