# DineFlow desktop and mobile visual review

Reviewed 28 October 2026. Changes are implemented in the actual React application.

The most significant problems were oversized mobile summaries, broken rider header wrapping, restaurant names distorting sidebar branding, and excessive empty artwork before ordering controls. Those issues have been addressed. The resulting screens retain the existing routes, permissions, restaurant configuration, payment checks, and delivery actions.

[Open the before-and-after gallery](index.html). Select a screen, viewport, and first-screen/full-page capture.

## Scope and screenshot evidence

- Desktop: **1440 × 1000**. Mobile: **390 × 844**.
- Before: 19 screens per viewport, covering the public landing, sign-in, all seven user roles, customer checkout, payment review, and primary administrator pages.
- After: **49 screen states** — 23 desktop and 26 mobile — including dark mode, mobile navigation drawers, and fullscreen delivery maps. Both viewport and full-page PNGs are saved for each state.
- Additional 375px and 430px overflow checks cover public/customer pages, rider work, live tracking, cashier, and table service.
- Populated screenshots use the real app and API with a disposable SQLite acceptance database. The fixture seeder refuses to run outside that exact test database and testing environment.
- The actual app at [localhost:5173](http://localhost:5173/) was also inspected read-only. Its public menu currently has no published dishes; that empty state is displayed honestly. [Live desktop](after/live-landing-desktop.png) and [live mobile](after/live-landing-mobile.png) captures are separate from the populated review fixtures. No restaurant records were seeded into the real database.

## Findings and implemented improvements

| Priority | Screenshot finding | Implemented change |
| --- | --- | --- |
| High | Rider navigation broke “Dashboard” into a vertical stack and pushed account controls outside the mobile viewport. | Single-line/ellipsized breadcrumbs, a compact rider header, and a visible reconnect action when GPS needs attention. |
| High | A long restaurant name occupied four lines in the desktop sidebar. | Stable DineFlow wordmark and a separate truncated restaurant identity; the complete restaurant name remains available. |
| High | Tall mobile metric cards buried kitchen tickets, service tables and payment work. | Compact label/value summaries; explanatory text remains available to assistive technology. Administrator metrics use a compact two-column grid. |
| High | Mobile administrator alerts squeezed their message beside the action button. | A contained icon/message layout with the action below the message. |
| High | A freshly selected rider map could scroll its page title underneath the header. | Initial map focus preserves page position. Explicit rider selection still scrolls to the map. Lower delivery queue sections remain reachable. |
| High | The populated-menu “Added to order” hover state inherited a conflicting button palette. | The order action uses the primary button variant, preserving readable text on hover. |
| Medium | Animated rider counters used an unsupported accessible label on a generic span. | Stable screen-reader text accompanies the decorative animated number. |
| Medium | Staff navigation repeated small group headings and exposed duplicate Orders links. | A flat staff workspace menu with one Orders entry; legacy routes remain available. |
| Medium | Sparse desktop bill grids stretched a single card across the available width. | Auto-fill grid with bounded card widths. |
| Medium | The mobile payment dialog retained the browser’s default maximum-width gutter. | An edge-to-edge bottom sheet with contained review and payment actions. |
| Medium | Large menu slogans and image-free artwork delayed the first ordering action. | A smaller service banner, shorter placeholder thumbnails, and a compact public fallback. Real photographs keep their image treatment. |
| Medium | The mobile cart shortcut could cover the actual checkout area. | The shortcut hides while the order summary is visible and returns when browsing dishes. |
| Medium | Empty carts and single-page pagination consumed unnecessary space. | Compact empty cart, conditional bottom spacing, and pagination only for multiple pages. |
| Low | A one-floor restaurant still displayed an unnecessary floor filter; singular counters read awkwardly. | Progressive disclosure for multiple floors and corrected balance, record and table labels. |
| Low | Legacy styles competed with newer control sizing and card layouts. | Scoped overrides keep admin actions, staff controls, map zoom controls and rider shortcuts usable within the shared design system. |

## Measured mobile improvements

Positions are the top edge of the named element at the initial page position. A long card can continue below the viewport; these numbers do not imply that the whole card fits on one screen.

| Element | Before | After | Improvement |
| --- | ---: | ---: | ---: |
| Rider header height | 190px | 65px | 125px shorter |
| Public header height with long restaurant name | 134px | 81px | 53px shorter |
| First kitchen ticket | 944px | 672px | 272px earlier |
| First service table | 1244px | 760px | 484px earlier |
| First payment review action | 1221px | 835px | 386px earlier |
| First menu “Add to order” | 1077px | 839px | 238px earlier |

The rider dashboard previously measured 414px wide in a 390px viewport. It now fits the viewport.

## Validation

- All **49 latest stored screen states** have **zero detected horizontal overflow** and **zero axe violations** for WCAG 2 A/AA and WCAG 2.1 AA rules. Captures also check for uncaught page errors. Initial failures were corrected and the affected scenes were recaptured.
- Both real public landing captures passed the same automated accessibility and overflow checks, with no uncaught page errors.
- **62 focused frontend tests across 12 files passed**, covering public/menu behavior, payment safeguards, staff views, settings, rider actions, route planning, and sign-in destinations.
- Rider regression coverage verifies that initial map selection does not scroll the page, explicit selection does scroll, order remains unchanged, and repeated status submissions are locked.
- ESLint and the production build pass.
- Fullscreen map entry/exit, dark/light switching, and mobile drawer closing/focus restoration pass browser checks.
- Latest metrics and accessibility results are saved in [desktop manifest](after/manifest-desktop.json), [mobile manifest](after/manifest-mobile.json), and [live public checks](after/live-public-checks.json).

This is a screenshot review and automated AA check, not a WCAG AAA certification. Physical-device testing, screen-reader task testing, and broader manual accessibility criteria remain part of the existing design-system audit.

## Remaining design priorities

1. **Publish actual menu content and food photography.** The live menu is empty, and populated fixture dishes deliberately have no photos. Branded placeholders handle that state, but actual food imagery will improve the public experience more than additional decoration.
2. **Reduce competing legacy CSS over time.** The shared tokens and scoped feature styles now provide a consistent result, but old global menu/workspace rules still make future visual changes harder to predict. Migrate them into the corresponding feature styles as those areas change.
3. **Continue reducing repeat-visit menu preamble.** The first ordering action appears substantially earlier, though a returning customer could benefit from an even smaller service banner and faster access to filters.
4. **Complete physical-device and assistive-technology review.** Check iOS/Android keyboards, browser zoom, screen-reader payment and dispatch tasks, real GPS permissions, and real photo aspect ratios. Browser emulation cannot establish every device behavior.
5. **Review the existing 3D floor-plan download separately.** The production build still reports the large lazy-loaded floor scene chunk; the accessible 2D reservation view remains available.

The layout changes prioritize visible work and clear actions while preserving the application’s existing business and security boundaries.
