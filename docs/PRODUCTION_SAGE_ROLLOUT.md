# DineFlow — Sage design in the live application

Implemented 28 October 2026. The new design now runs through `frontend/index.html` and `src/App.jsx` with the existing Laravel API. `design-lab.html` remains a separate reference specimen; it is no longer the only implementation of the design.

## Live application

The running local app is **http://localhost:5173/**. Its configured API is **http://localhost:8081/api/v1**. The public landing page opens at `/`; sign-in is `/login`. An unauthenticated menu or booking link retains the intended destination through sign-in. External return URLs and role-ineligible destinations are rejected.

The live server's public menu currently returns zero published items and zero categories. The landing page therefore shows its designed empty state. No demonstration dishes, customers, financial rules or USD records were added to the restaurant database. The integration tests use a separate disposable SQLite database at `.local/acceptance.sqlite`.

## Applied pages and behavior

| Role / surface         | Real route                                                                                                          | Production integration                                                                                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public restaurant      | `/`                                                                                                                 | Real public branding, restaurant location/hours, menu category/search/pagination and photos/prices in PHP. Booking and ordering enter the existing authenticated flows. A shared theme control is available publicly.                                               |
| Administrator          | `/admin/dashboard`, `/admin/tracking`, `/admin/outlets`, `/admin/orders`, `/admin/riders`, `/admin/system-settings` | Sage colors, typography, surfaces, form states and navigation; existing metrics, Leaflet maps/fullscreen, real fleet/dispatch and outlet/settings saves remain connected. Secondary tools and old deep links remain available.                                      |
| Manager                | `/admin/dashboard`                                                                                                  | Service overview with permitted operational tools, orders, tracking and fleet. Manager identity is distinct from administrator; restricted account/settings destinations remain unavailable.                                                                        |
| Cashier                | `/payments`                                                                                                         | Collection queue, consolidated dining bills, payment review sheet, real cash/hosted-checkout actions, paginated transactions/receipts and permission-scoped refund controls. Consolidated bills suppress duplicate individual debt entries.                         |
| Kitchen Staff          | `/kitchen`                                                                                                          | Dedicated ticket grid, real order ages/preparation estimates, item variants/add-ons/instructions and authorized Start preparing / Mark ready transitions. No financial totals are rendered in the KDS.                                                              |
| Waiter / Service Staff | `/service`                                                                                                          | Actual table cards, occupancy/session timing, area/floor/status filters, availability estimates and existing guarded occupancy actions.                                                                                                                             |
| Delivery Rider         | `/rider` and existing delivery/history/offer/detail routes                                                          | Next assignment first, pickup/drop-off context, six distinct availability/GPS states, support and real activity below. Sparse summary pickup data reuses the loaded restaurant location. Existing assignment, readiness, proof and GPS guards remain authoritative. |
| Customer               | `/menu` and existing order/reservation/tracking routes                                                              | Real menu cards and optional customization, actual variants/add-ons, persistent cart, delivery/dine-in/pickup submission and responsive order summary. Successful ordering clears the saved cart before showing confirmation.                                       |
| Shared account/tools   | Existing role-permitted routes                                                                                      | One persistent light/dark preference, Sage token aliases, visible focus, 48px controls, semantic status colors and accessible states. Selecting “Role default” preserves the new default home page.                                                                 |

`src/main.jsx` loads `design-tokens.css` and `production-theme.css`; the actual application root and role shells opt into `.df-theme`. Feature styles are scoped in `publicLanding.css`, `customerSage.css`, `staffSage.css` and `riderSage.css`. No production page imports `src/mocks/productionTestData.js` or the design-lab components as a substitute for its API data.

The presentation bridge preserves legacy floor-plan, reservation, reports and account layouts while giving them the same semantic palette and controls. It avoids rewriting their domain logic during a visual rollout. Existing custom brand colors are normalized to a readable light-theme accent; dark controls use their approved foreground/background pairing.

## State and security safeguards

- The backend still checks roles, permissions, customer ownership and rider assignments. A visual role label cannot authorize an action.
- Staff changes retain server state transitions, pending locks and error recovery. Failed first loads show unavailable metrics instead of fabricated zero values.
- Payments display server balances. A pending or uncertain checkout does not enable an immediate duplicate collection. In-modal errors remain inside the review sheet, with focus/scroll restoration.
- New start-page aliases are accepted by `/me/preferences` only when the account has the corresponding permission. Customer/rider pages do not become staff destinations.
- Public data is read-only. Tax, service charges, delivery rules, deposit and refund policies remain the configured server behavior.
- Native browser GPS still requires permission and an open page. This rollout does not invent background GPS, a shift-reconciliation ledger, staff guest-attribution rules or automatic per-guest refunds.

## Validation

The final frontend lint and production build pass. **52 focused frontend tests** pass across 11 files, including real public data handling, cart persistence, payment duplication/uncertainty, KDS permissions/states, rider summaries/states, navigation and safe sign-in destinations. **12 backend workspace tests** pass with 83 assertions, including the new permission-scoped start pages.

The production browser suite covers **30 cases** across desktop 1440×1000, tablet 834×1112 and mobile 390×844. The seven role pages are checked in light/dark themes with automated accessibility scans, overflow checks and screenshots. The suite also verifies the public-to-reservation sign-in path, rejects external sign-in return URLs, and executes an actual test pickup order through confirmation, kitchen preparation, ready state and cashier cash settlement. A hidden table-header label that extended the mobile layout was fixed at its source rather than hiding page overflow.

Browser runs and final targeted reruns are retained in `frontend/test-results/production-sage*`. The live local server was separately checked without signing in: actual public empty-menu state, persistent theme switching and no uncaught browser errors. Existing admin map/navigation/outlet workflows have a separate regression run.

Reproduce from `frontend/`:

```text
npm run lint
npm run build
npm run test:production
```

Use `PLAYWRIGHT_CHROMIUM_EXECUTABLE` only when selecting an already installed Chromium binary. The production browser configuration starts the isolated acceptance API at port 8091 and Vite at port 5191; it does not test against or mutate the restaurant database used by the running app at ports 8081/5173.

Automated checks establish the tested behavior; they are not whole-app WCAG AAA certification or a security penetration test. The earlier audit remains the backlog for complete assistive-technology/process evaluation and additional domain features.

The design now drives real role workflows while the server continues to own authorization, pricing and financial state.
