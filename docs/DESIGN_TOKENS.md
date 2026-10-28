# DineFlow atomic tokens: Sage Organic Minimalism

## Scope and adoption boundary

The executable token source is [`frontend/src/design-tokens.css`](../frontend/src/design-tokens.css). It is a complete, opt-in CSS Variables system for the responsive reference layouts and reusable design-lab components. It does not replace the production app's existing `--ink`, `--primary`, `--canvas`, `--admin-*`, or role-specific declarations. This prevents a specification delivery from silently recoloring payment, kitchen, mapping, or authentication flows that have separate regression requirements.

The repository already uses Tailwind CSS 4 through its Vite plugin and `@import "tailwindcss"`. A second, legacy-style `tailwind.config.js` is unnecessary for this delivery. CSS Variables keep the current React/JSX/plain-CSS architecture, work without additional packages, and can be consumed by future Tailwind utilities using arbitrary values such as `bg-[var(--df-surface)]`.

Import the token file once in the entry point that needs it. Set `.df-theme` and `data-df-theme="light"` or `"dark"` on the specimen root. Descendants inherit tokens, including a native dialog kept inside that root. When a dialog is portaled elsewhere, put the same theme attribute on its portal wrapper rather than relying on inheritance from an unrelated subtree.

```jsx
import "./design-tokens.css";

export function SurfaceExample() {
  return (
    <section className="df-theme" data-df-theme="light">
      <article
        style={{
          background: "var(--df-surface)",
          color: "var(--df-text)",
          border: "1px solid var(--df-border)",
          borderRadius: "var(--df-radius-lg)",
          padding: "var(--df-space-6)",
          boxShadow: "var(--df-shadow-card)",
        }}
      >
        <h2>Service overview</h2>
        <p style={{ color: "var(--df-text-secondary)" }}>
          Review orders that need attention before starting the next task.
        </p>
      </article>
    </section>
  );
}
```

## Three token layers

1. **Primitives** retain the exact requested brand and accent values. A primitive communicates identity; its existence does not authorize it for small text or control boundaries.
2. **Semantic tokens** describe use: canvas, reading surfaces, ink, secondary text, primary actions, focus, disabled controls, and status pairs. Light and dark themes change these together.
3. **Component aliases** provide compact names used by reference components. An alias resolves to a semantic token rather than a second independently maintained hex value.

This hierarchy supports atomic design: token primitives and semantic roles feed atoms, which compose labelled controls and badges, which compose order tables and drawers, which compose the seven role templates and public landing layout. Components should consume semantics, not primitive colors chosen by appearance.

## Requested palette and accessibility correction

| Primitive                    | Requested value | Intended use                                                      |
| ---------------------------- | --------------- | ----------------------------------------------------------------- |
| `--df-palette-sage`          | `#E8EFE0`       | Soft brand region                                                 |
| `--df-palette-canvas`        | `#F7F9F5`       | Light canvas                                                      |
| `--df-palette-white`         | `#FFFFFF`       | Light card surface                                                |
| `--df-palette-cream`         | `#F2F5ED`       | Muted panel                                                       |
| `--df-palette-border`        | `#D8E2D1`       | Decorative separator                                              |
| `--df-palette-forest`        | `#1E4D3A`       | Primary brand                                                     |
| `--df-palette-forest-hover`  | `#143729`       | Primary hover                                                     |
| `--df-palette-forest-active` | `#0F2C20`       | Primary active                                                    |
| `--df-palette-olive`         | `#8F9E82`       | Decorative accent                                                 |
| `--df-palette-charcoal`      | `#1A2421`       | Heading and body ink                                              |
| `--df-palette-muted-forest`  | `#5A6B63`       | Retained source accent; use the semantic replacement for AAA text |
| `--df-palette-amber`         | `#D97706`       | Pending accent                                                    |
| `--df-palette-teal`          | `#0D9488`       | Progress accent                                                   |
| `--df-palette-terracotta`    | `#C2410C`       | Alert accent                                                      |

Several requested colors conflict with the requested 7:1 normal-text target. On white, `#5A6B63` measures **5.6482:1**, amber **3.1858:1**, teal **3.7443:1**, terracotta **5.1784:1**, and olive **2.8451:1**. They remain in the primitive palette, but approved reading text and badges use the stronger semantic pairs below. These measurements are calculated from the actual CSS, not estimates.

Do not create a white-text amber or teal action button from the raw palette. Do not use opacity to soften secondary or disabled labels; it changes the actual composite foreground and invalidates the pair measurement.

## Semantic colors and pair contract

| Semantic role       | Light     | Dark      | Contract                                                            |
| ------------------- | --------- | --------- | ------------------------------------------------------------------- |
| Canvas              | `#F7F9F5` | `#101A16` | App background                                                      |
| Surface             | `#FFFFFF` | `#13221C` | Cards, menus, dialog content                                        |
| Panel               | `#F2F5ED` | `#1B2C23` | Subsections, filters, lower-emphasis reading areas                  |
| Brand panel         | `#E8EFE0` | `#23362A` | Contextual brand region                                             |
| Ink                 | `#1A2421` | `#F4F8EF` | Body and headings on all four reading surfaces                      |
| Secondary           | `#3F5147` | `#C1D2C2` | Captions, helper text, timestamps, placeholders                     |
| Brand               | `#1E4D3A` | `#C5DDBD` | Primary fill or underlined link on reading surfaces                 |
| Brand hover         | `#143729` | `#DAE9D1` | Hover fill                                                          |
| Brand active        | `#0F2C20` | `#B1CFAA` | Pressed fill                                                        |
| On brand            | `#FFFFFF` | `#143729` | Label on all three primary fills                                    |
| Decorative border   | `#D8E2D1` | `#3C5544` | Card separation when spacing/background already identify the region |
| Control border      | `#768573` | `#819985` | Input boundary or essential graphical control outline               |
| Focus               | `#1E4D3A` | `#B6D8AA` | 3px focus outline, separated by 3px offset                          |
| Disabled background | `#E8EFE0` | `#23362A` | Disabled control fill                                               |
| Disabled label      | `#3F5147` | `#C1D2C2` | Readable disabled text without fading                               |

Use `--df-color-secondary`, not `--df-color-accent`, for text that communicates meaning. All three reading foregrounds (ink, secondary, brand) are checked against all four reading backgrounds. Minimum measured secondary contrast is **7.2012:1** in light mode and **8.1253:1** in dark mode. The decorative card border is intentionally subtle and is not an approved sole boundary for an input. Essential control boundaries use `--df-color-control-border`, checked at 3:1 or greater against all four surfaces.

The short aliases are `--df-canvas`, `--df-surface`, `--df-panel`, `--df-border`, `--df-text`, `--df-text-secondary`, `--df-primary`, `--df-primary-hover`, `--df-focus`, `--df-shadow-card`, and `--df-shadow-modal`. Other semantics retain the full `--df-color-*` spelling.

### Status pairs

| State                       | Light text / background | Dark text / background | Light / dark contrast |
| --------------------------- | ----------------------- | ---------------------- | --------------------- |
| Pending / requires action   | `#704000` / `#FFF4DC`   | `#FFE1A6` / `#362B15`  | 7.9370 / 10.9519      |
| Preparing / progress        | `#10524C` / `#E3F4EF`   | `#B7F1E2` / `#14382F`  | 7.9084 / 10.2011      |
| Ready / complete            | `#1E4D3A` / `#E8EFE0`   | `#D0EBBF` / `#203A27`  | 8.1980 / 9.6216       |
| Delayed / error / cancelled | `#87320C` / `#FFF0E8`   | `#FFCCB4` / `#3D241A`  | 7.5776 / 9.9259       |
| Neutral / unknown           | `#3F5147` / `#F2F5ED`   | `#D7E4D7` / `#26392E`  | 7.6873 / 9.3538       |

Each state exports `--df-status-{state}-text`, `-bg`, and `-border`. The foreground and background are a pair; do not interchange a foreground with a different state's background without measuring again. Status must include a written label and a non-color cue. `Delayed` is a derived attention state in the supplied mock data, not an authorization to add a new production order status. State mapping belongs at the view-model boundary.

## Typography

Use one font stack: `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. Inter is used only when already installed; no new font network request is made. The typography base remains `1rem` to respect browser font settings.

| Token                          | Size at a 16px root         | Usage                                                                           |
| ------------------------------ | --------------------------- | ------------------------------------------------------------------------------- |
| `--df-type-xs`, `--df-type-sm` | 12.8px                      | Metadata, helper text; `sm` is an alias-sized step, not an extra scale interval |
| `--df-type-body`               | 16px                        | Body, input text, table primary values                                          |
| `--df-type-lg`                 | 20px                        | Card titles and emphasized values                                               |
| `--df-type-xl`                 | 25px                        | Section headings                                                                |
| `--df-type-2xl`                | 31.25px                     | Page headings                                                                   |
| `--df-type-3xl`                | 39.0625px                   | Large dashboard values                                                          |
| `--df-type-4xl`                | 48.828125px                 | Editorial hero heading                                                          |
| `--df-type-5xl`                | 61.03515625px               | Wide-screen hero maximum                                                        |
| `--df-type-display`            | Fluid 39.0625–61.03515625px | Landing hero with wrapping at narrow widths                                     |

Successive distinct scale steps use the **major-third ratio 1.25**. Typography is not forced onto the spatial grid; the two scales serve different purposes.

`--df-font-regular: 400` is for body and descriptions; `--df-font-medium: 500` is for labels and navigation; `--df-font-semibold: 600` is for headings, values, and primary actions. Avoid using weight alone as the only signal distinguishing two interactive states.

Line-height tokens are tight **1.2**, snug **1.4**, normal **1.5**, and relaxed **1.7**. Use normal or relaxed for body paragraphs and helper text; use tight for short display headings. Use tabular numbers for money, elapsed timers, counts, and pagination summaries. Limit long reading regions to `--df-reading-max: 65ch`. Do not truncate names, addresses, or error instructions without an accessible way to read the complete value.

## Spatial grid, geometry, and layout

| Token suffix | Value | Typical usage                             |
| ------------ | ----- | ----------------------------------------- |
| `space-0`    | 0     | Reset                                     |
| `space-1`    | 4px   | Icon-to-label optical gap                 |
| `space-2`    | 8px   | Tight related metadata                    |
| `space-3`    | 12px  | Compact field spacing                     |
| `space-4`    | 16px  | Mobile card padding                       |
| `space-5`    | 20px  | Intermediate component spacing            |
| `space-6`    | 24px  | Card padding and desktop gap              |
| `space-8`    | 32px  | Section spacing                           |
| `space-10`   | 40px  | Large section separation                  |
| `space-12`   | 48px  | Touch target and generous section padding |
| `space-16`   | 64px  | Major editorial section                   |
| `space-20`   | 80px  | Hero spacing                              |
| `space-24`   | 96px  | Wide-screen editorial spacing             |

Spacing names multiply a 4px unit. Use 8px steps for major layout and 4px steps for small adjustments. A 1px border and 3px focus ring are geometry, not off-grid spacing. Typography can use non-grid values because the requested modular ratio is independent.

The page maximum is **1440px**, the desktop sidebar **240px**, a compact rail **80px**, the desktop top bar **72px**, and a side drawer **480px** maximum. A drawer must still fit within the viewport. Touch controls use `--df-target-size: 48px`; an icon may be 20px inside that target. Mobile action bars add `env(safe-area-inset-bottom, 0px)` and reserve equivalent document space so they do not cover the last field or record.

Breakpoints are documented as `--df-breakpoint-tablet: 768px`, `--df-breakpoint-desktop: 1280px`, and `--df-breakpoint-wide: 1600px`. CSS custom properties cannot be interpolated into native media-query conditions. Use literal `@media (min-width: 768px)` and `@media (min-width: 1280px)` in component CSS, with the same values; the variables serve as a design/tooling contract. Details for 375–430px mobile, 768–1024px tablet, and 1280px+ desktop are in [`RESPONSIVE_LAYOUTS.md`](RESPONSIVE_LAYOUTS.md).

Radius values are **0, 8, 12, 16, 24px, and 9999px**. Cards use `lg` (16px), controls `sm` or `md`, modal surfaces `xl`, and compact badges `pill`. Avoid making an entire dense data table look like independent floating pills; common-region grouping should remain clear.

## Elevation and stacking

| Elevation | Light shadow                        | Dark shadow                      | Purpose          |
| --------- | ----------------------------------- | -------------------------------- | ---------------- |
| Low       | `0px 2px 8px rgba(30,77,58,0.04)`   | `0px 2px 8px rgba(0,0,0,0.18)`   | Cards            |
| Medium    | `0px 6px 16px rgba(30,77,58,0.08)`  | `0px 6px 16px rgba(0,0,0,0.28)`  | Menus, popovers  |
| High      | `0px 16px 32px rgba(30,77,58,0.14)` | `0px 16px 32px rgba(0,0,0,0.40)` | Dialogs, drawers |

The light shadows match the brief exactly; CSS uses equivalent modern `rgb(... / ...%)` syntax. Shadows communicate layering but do not replace meaningful input boundaries or focus indicators.

The z-index scale is base **0**, raised **10**, sticky **20**, dropdown **30**, overlay **40**, modal **50**, toast **60**. Native `dialog.showModal()` places the modal in the browser top layer and does not require an arbitrarily large z-index to escape a parent stacking context. Do not render actionable toasts over the modal without a deliberate focus/accessibility design.

## Motion and state feedback

| Token                       | Value                       | Usage                             |
| --------------------------- | --------------------------- | --------------------------------- |
| `--df-motion-duration-fast` | 120ms                       | Button hover/pressed feedback     |
| `--df-motion-duration`      | 200ms                       | Drawer and modal transitions      |
| `--df-motion-duration-slow` | 320ms                       | Non-urgent larger surfaces        |
| `--df-motion-easing`        | `cubic-bezier(0.4,0,0.2,1)` | Standard movement                 |
| `--df-motion-easing-enter`  | `cubic-bezier(0,0,0.2,1)`   | Entering surface                  |
| `--df-motion-easing-exit`   | `cubic-bezier(0.4,0,1,1)`   | Exiting surface                   |
| `--df-motion-hover-scale`   | 1.01                        | Optional decorative card lift     |
| `--df-motion-drawer-offset` | 24px                        | Small drawer entrance translation |

The requested cubic Bézier is an easing curve, not a physical spring simulation. No animation library is added. Name changed properties explicitly (`background-color`, `color`, `border-color`, `transform`, `opacity`, or `box-shadow`) instead of using `transition: all`, which can accidentally animate geometry, height, or focus position.

Both `prefers-reduced-motion: reduce` and `data-reduced-motion="true"` set durations to zero, remove the hover scale, and remove drawer translation. Component animations must also have a reduced-motion override; changing transition variables alone does not stop a separately declared infinite skeleton animation. Keep loaders understandable when motion is disabled with a static shape and an accessible loading label.

Required component states:

| State         | Visual and semantic behavior                                                                          |
| ------------- | ----------------------------------------------------------------------------------------------------- |
| Default       | Label, boundary, and action purpose are visible.                                                      |
| Hover         | Optional color/elevation feedback; never required to discover an action.                              |
| Active        | Primary active fill or pressed position without causing layout shift.                                 |
| Focus visible | 3px visible outline, 3px offset; never remove it without an equivalent replacement.                   |
| Disabled      | Native disabled behavior with readable text and a nearby reason when the prerequisite is not obvious. |
| Loading       | Disable duplicate submission, preserve button footprint, expose `aria-busy`/status text.              |
| Empty         | Explain the absence, retain relevant filters, offer a useful action.                                  |
| Error         | Written message, field association when relevant, preserved draft, retry when safe.                   |
| Success       | Polite confirmation that does not unexpectedly move focus.                                            |

## Reproducible verification

From `frontend/`:

```text
node scripts/check-design-tokens.mjs
node scripts/check-design-tokens.mjs --check
```

The dependency-free Node script reads the actual light/dark declarations, resolves aliases, and computes WCAG sRGB relative luminance using the 0.04045 transfer threshold. It tests **30 approved pairs per theme, 60 total**: reading text, primary label states, all five status pairs, disabled text, text selection, essential control outlines, and focus indicators. It exits nonzero for any failed pair. Pass/fail uses the unrounded ratio, while the evidence stores four decimal places for readability.

The generated [`design-token-contrast.json`](design-token-contrast.json) contains the source SHA-256, method, measured pairs, target, result, and requested palette comparisons. `--check` additionally fails if that file is stale. No external contrast service, credential, or network request is used.

**This is a measured token-pair result, not a claim that the whole app conforms to WCAG AAA.** Actual rendered text can fail if another rule overrides its color, opacity is applied, an image/gradient lies behind it, or a surface is translucent. Disabled controls have contrast exceptions in WCAG, but the reference system deliberately maintains readable labels. The UI boundary and focus tests target the applicable 3:1 non-text criterion, not a made-up 7:1 requirement for every border. Decorative separators need not independently meet a control-boundary threshold.

Manual and browser verification must still cover zoom/reflow, text spacing, keyboard order, visible focus under sticky bars, screen-reader names and announcements, target dimensions, input errors, live updates, modal focus, forced colors, and all other applicable AAA success criteria. The evidence-based conformance/gap matrix lives in [`DESIGN_SYSTEM_AUDIT.md`](DESIGN_SYSTEM_AUDIT.md).

## Incremental production migration

1. Keep the reference bundle independent of live accounts, payment state, and database policy. Mock USD values must not override production PHP monetary calculations.
2. Migrate a production component's complete foreground/background/state set at once. Replace its duplicate literal values with semantic tokens; do not append another global override layer.
3. Retain its existing API payloads, ownership checks, permission gates, validation, and loading/error behavior.
4. Check both themes and relevant breakpoints before removing the component's superseded styles.
5. Run the contrast script, component tests, keyboard/focus checks, and the affected role's browser flow.
6. Adopt shared atoms/molecules across additional roles only after the first migrated screen has passed those checks.

The trade-off is deliberate: namespaced tokens make the new system concrete and reusable while avoiding an unverified global theme migration of seven operational workspaces.
