# Interface design and maintenance

The redesign preserves the existing Geoapify, PayMongo, Sanctum, Render and Neon workflow. It adds no service account, API provider or runtime dependency.

## Visual language

- Forest green (#245440), warm off-white (#fffefa), soft sage surfaces and dark green text form the primary palette. Error and success states use readable text plus icons; status is never communicated by color alone. Saved restaurant brand colors remain supported; very light accents are darkened as needed so white control text retains at least 4.5:1 contrast.
- System sans-serif typography keeps the application fast without external font requests. Editorial serif headings appear only in the dining welcome panels.
- Layout uses consistent 10px controls, 14-20px cards, 44px minimum primary controls, clear page headings and restrained shadows. Most interaction transitions last 160ms; reduced-motion preferences disable nonessential animation.
- The menu uses real dish photos where available and an intentional decorative illustration otherwise. No remote stock photography or invented operational metrics are introduced.

## Structure

- components/ui.jsx: buttons, labelled fields, page headers, feedback, empty states, skeletons and textual status badges.
- components/AppShell.jsx: grouped permission-based navigation, active routes, page title/focus management, skip link and a native dialog drawer for mobile navigation.
- components/AuthScreen.jsx: sign-in, registration and recovery screens with inline validation and password visibility control.
- components/Notifications.jsx: keyboard-dismissable updates panel with loading/error/empty states.
- components/Modal.jsx and ConfirmProvider.jsx: native dialogs with focus containment, Escape support and focus restoration. Existing operational prompt actions now use styled dialogs.
- features/Menu.jsx: searchable catalog, category filters, configurable dish cards and responsive order summary.
- features/CatalogAdmin.jsx: category and dish editors with structured size/add-on controls. Staff do not edit raw JSON.
- features/Orders.jsx and Administration.jsx: extracted order and account-management screens.
- Account.jsx: profile summary, labelled account/password fields and field-specific validation.
- design-system.css: tokens and shared layout/visual foundations; styles.css retains feature-specific geometry such as maps, floor editing, calendars and reports. Retired authentication/sidebar/cart styles were removed.

Existing reservations, delivery, payments, reporting and settings screens share the new controls and surfaces. Collection screens use skeletons and purpose-written empty states, while settings load before becoming editable. Maps, staff screens and the optional 3D scene load separately to reduce initial JavaScript transfer.

## Accessibility and verification

Use semantic headings, visible labels, explicit names for icon controls, visible keyboard focus and live feedback. Native dialogs handle keyboard focus and Escape; the navigation drawer restores its trigger focus. Scrollable report tables are focusable. The 2D reservation view remains the default.

From frontend, run:

```text
npm run lint
npm run format:check
npm test
npm run build
npm run test:e2e
```

The format check includes source files. Playwright runs desktop Chromium and mobile Chromium with an iPhone-sized viewport; this is not a native Safari/device test. Tests cover customer ordering/profile/reservation workflows, kitchen restrictions, menu empty/error recovery, catalog option serialization, modal accessibility, navigation and selected WCAG 2/2.1 AA rules across customer and staff screens. Browser screenshots are saved in ignored test-results directories for visual review.

Automated accessibility checks are a release guard, not a certification. Verify the final hosted site with actual restaurant content, uploaded photos, real device keyboards/zoom and provider flows before claiming full WCAG conformance. Existing Render Free sleep, ephemeral uploads, SMTP and test merchant setup constraints still apply. This redesign does not publish the site or modify hosted data.

Verified locally: five frontend unit tests, fourteen full-suite desktop/mobile browser cases plus two custom-brand contrast cases, lint, source formatting, and the production build. Preview images are saved in ignored .local/ui-review. Confirm the latest GitHub checks and Render deploy when releasing these changes.
