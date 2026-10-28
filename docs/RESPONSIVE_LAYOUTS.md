# DineFlow responsive layout specification

**Production update:** the shared design now runs on the actual application routes. See [PRODUCTION_SAGE_ROLLOUT.md](PRODUCTION_SAGE_ROLLOUT.md) for the 28 October integration record; the original route/target ledger below documents the preceding design snapshot.

Revision: 27 October 2026. This specification covers a public restaurant landing page and all seven role workspaces. It separates current routes, an isolated design preview and proposed production features. Read alongside [the audit and accessibility applicability register](DESIGN_SYSTEM_AUDIT.md).

Review the [24 actual browser captures](design-system/previews/index.html) and [completed validation record](DESIGN_SYSTEM_VALIDATION.md) alongside the component breakdowns below.

## 1. Implementation scope and route map

The existing application uses React/JSX, React Router, CSS/Tailwind tooling, Leaflet and an optional Three.js reservation view. Retain those libraries. `frontend/src/App.jsx:175` maps application screens; permission-filtered destinations come from `frontend/src/navigation.js:1`. Public APIs for menu/location exist, but unauthenticated UI currently renders AuthScreen (`frontend/src/App.jsx:359`), so a public restaurant landing is a new template.

The isolated preview entry is `frontend/design-lab.html`, with composition under `frontend/src/design-lab/DesignLab.jsx:1424`. Source inspection confirms eight views selected by `?view=landing`, `administrator`, `manager`, `cashier`, `kitchen_staff`, `waiter`, `rider` or `customer`. `frontend/src/design-lab/main.jsx:4` is independent of production App/api; `frontend/vite.config.js:10` includes the separate HTML entry. Preview role switching is presentation only and must not write permissions or call live mutation endpoints. Source presence is not a production rollout or an accessibility certificate.

| Template               | Implemented production destinations                                                                                                                                                                                                                       | Proposed/prototype content                                                                                         | Permission boundary                                                                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public landing         | Unauthenticated auth screen; public menu/location/floor-availability API reads.                                                                                                                                                                           | Editorial landing, featured cards, guest cart preview, delivery checker and a simplified reservation entry wizard. | No staff/financial/customer-private data; checkout/booking hands into authenticated flow.                                                                      |
| Administrator          | `/admin/dashboard`, `/admin/tracking`, `/admin/outlets`, `/admin/orders`, `/admin/riders`, `/admin/system-settings`; legacy tools including `/admin/users`, `/admin/audit`, `/reports`, `/admin/menu`, `/admin/floor-plan`, `/reservations`, `/payments`. | Unified sage presentation across every tool; scale scenarios, accessibility review.                                | Use existing permissions, never a role display string.                                                                                                         |
| Manager                | Dashboard/tracking/orders/riders as above; `/dashboard`, `/admin/deliveries`, `/orders`, `/admin/menu`, `/admin/floor-plan`, `/service`, `/reservations`, `/reports`, `/payments`.                                                                        | Task-oriented operations view, compact dispatch attention panel.                                                   | No default settings.manage/users.manage/payments.manage/reports.financial; manager can refund but cannot record cash.                                          |
| Cashier                | `/dashboard`, `/payments`, `/cashier/summary`, account/settings.                                                                                                                                                                                          | Persistent selected bill and POS drawer; shift cash reconciliation demonstration.                                  | Cashier can read orders at API level but current navigation has no Orders route for orders.view alone. No refunds or menu edits. Shift ledger/API is proposed. |
| Kitchen Staff          | `/kitchen`, account/settings.                                                                                                                                                                                                                             | Dedicated 3/2/1-column KDS ticket template, visual timers, compact bump controls.                                  | kitchen.orders.view/update; server permits preparation transitions only.                                                                                       |
| Waiter / Service Staff | `/service`, `/reservations`, `/orders`, `/admin/orders`, account/settings.                                                                                                                                                                                | Floor/table master-detail presentation and mobile staff order-entry wizard.                                        | Orders API accepts orders.manage, but explicit staff guest/session attribution and staff entry UI need work. No cash/refunds/settings/menu editing.            |
| Delivery Rider         | `/rider`, `/rider/deliveries`, `/rider/offers`, `/rider/history`, `/rider/reviews`, `/rider/deliveries/:deliveryId`.                                                                                                                                      | Unified next-stop panel, GPS-health details and native-background capability explanation.                          | Assignment ownership and deliveries.assigned; browser GPS is foreground dependent.                                                                             |
| Customer               | `/menu`, `/restaurant`, `/reserve`, `/my-reservations`, `/my-orders`, `/delivery/:deliveryId/tracking`, receipt/account/settings.                                                                                                                         | Unified shopping/cart and reservation wizard, policy disclosure, enhanced tracking timeline.                       | Own orders/reservations/payments/tracking only; no role switcher in authenticated production shell.                                                            |

Legacy route aliases remain functional. Flattening navigation is a presentation change, not removal of unique capabilities. Existing admin flattening in `frontend/src/components/adminNavigation.js:1` consolidates destinations and exposes remaining tools through a search dialog. Contextual links should open existing tools rather than clone their behavior on a second page.

### Current preview versus the target specification

The detailed role sections below define the complete responsive production target. They intentionally extend beyond the subset of interactions demonstrated by the current local preview. This ledger prevents the target description from being mistaken for shipped functionality.

| Preview area          | Implemented local interaction                                                                                                                                     | Deliberately absent from preview                                                                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| All eight views       | Role/view selector, light/dark theme, populated/loading/empty/error controls, responsive navigation and named drawers.                                            | Authentication or permission changes; live production mutations.                                                                                             |
| Administrator/Manager | Source fixtures or 128 synthetic stress rows; order search/status/payment filters; paginated responsive table; order detail drawer; expandable coverage diagram.  | Real GPS, multi-outlet selector, live dispatch or editing production policies/users.                                                                         |
| Cashier               | Unpaid source bill review and proposed counted-cash difference drawer.                                                                                            | Cash settlement, merchant checkout, real shift ledger, approvals or refunds.                                                                                 |
| Kitchen               | Local Mark ready transition with feedback.                                                                                                                        | Authoritative kitchen queue/status mutation or financial reporting.                                                                                          |
| Waiter                | Zone filtering, six table cards and three-step table/dish/review wizard.                                                                                          | Live guest/session order creation; interactive production floor editor.                                                                                      |
| Rider                 | Simulated online switch and four-stage delivery progression; expandable illustrative map.                                                                         | Location permission request, GPS background service, voice navigation, proof upload or delivery completion.                                                  |
| Customer/Public       | Five menu items, variant/add-on price updates, add/remove preview bag, four-step reservation preview and illustrative numeric-distance coverage check on landing. | Actual booking/deposit/payment, address geocoding or server coverage decision. Large parties with no qualifying available fixture table show an empty state. |

View entry examples are `/design-lab.html?view=administrator` and `/design-lab.html?view=customer`. Source references in `frontend/src/design-lab/DesignLab.jsx`: order list at 248, cashier at 462, kitchen at 572, waiter at 658, rider at 719, menu at 823, landing at 985, table wizard at 1303 and reconciliation at 1377. `frontend/src/design-lab/model.js:86` creates 128 synthetic records without mutating the four source orders. Browser-tested widths and screenshot outputs belong in the final validation report rather than being presumed from this source ledger.

## 2. Shared layout rules

### Viewport classes and container policy

| Range                    | Layout contract                                                                                                                                                                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Large desktop,≥1280CSSpx | 12-column content grid;24px gaps;32px content padding, rising to 48px on very wide screens; centered max 1440px content. Admin/manager sidebar 248–256px; other role shells use only task-relevant navigation.                                                                                                |
| Tablet,768–1024CSSpx     | 8-column grid;16–24px gaps;24px padding. Replace wide sidebar with accessible drawer or compact rail only when labels remain discoverable. Avoid leaving a reduced content width behind an expanded sidebar.                                                                                                  |
| Mobile,375–430CSSpx      | 4-column planning grid rendered mostly as one content column;16px page padding,16px card gaps,8px related-control gaps. Persistent navigation in a modal drawer or role bottom navigation; primary work action 48–56px high.                                                                                  |
| Intermediate widths      | Use container width/content fit rather than new page-specific breakpoints.1025–1279px follows tablet or compact desktop according to available main-content width.431–767px grows mobile layouts with natural wrapping.                                                                                       |
| Zoom/reflow safety       | The requested mobile sizes are visual targets, not the whole accessibility range. Verify 320CSSpx equivalent and 200%/400% zoom; no page-level horizontal overflow. Two-dimensional maps/floor plans and wide tables may have a separately labeled scroll region plus an accessible list/summary alternative. |

Use `minmax(0,1fr)` and `min-width:0` on grid/flex children. Long restaurant names, addresses, monetary amounts, order references and translated labels wrap or truncate only with the complete text available. No fixed card height may clip notes or errors. A visual clamp may shorten a preview only when an accessible “Show details” control reveals the full content.

Typography uses one system-ui family and the major-third scale from the audit; body 16px, labels 500, headings 600. Dates carry a timezone when ambiguity matters; currency follows the data contract. All authored controls target 48×48CSSpx, including map, modal-close, calendar and quantity controls. Product touch targets are stronger than the WCAG 2.1 AAA 44px criterion.

### Shared shell organisms

1. **Skip link:** first focusable control; targets main content. Browser page title includes page and restaurant.
2. **Global navigation:** restaurant identity, task destinations, active state and user menu; permission-filtered on server-derived user permissions. Current-module breadcrumb is short and navigable when a parent exists.
3. **Page heading:** eyebrow is optional, title always present, one descriptive sentence, one primary CTA and a clearly secondary refresh/context action. Mobile actions wrap into their own row.
4. **Attention region:** only when real delayed, unassigned, unpaid or error conditions exist; icon+text+action, not color alone. No fabricated “All good” from failed requests.
5. **Primary work region:** queue/map/cart/table canvas selected by role task, not a generic set of metrics.
6. **Context region:** selected entity details/actions; drawers on constrained viewports. Optional metadata/history behind disclosure.
7. **Status region:** concise polite messages, stable freshness, inline field/row errors and saved state. Notifications never steal focus for ordinary updates.
8. **Action dock:** exists in normal document flow until useful; becomes sticky only for a dirty form or a selected active task. Reserve bottom space and safe-area inset so it does not cover content. Existing save behavior is at `frontend/src/components/useSaveDock.js:4`.

### Focus, drawer and responsive behavior

- Navigation drawer opens from a named menu button, sets expanded state, starts at its title/current link, makes background inert and restores focus to the menu trigger on close. Escape closes only the topmost cancellable layer.
- Bill/order/details drawers use a real dialog or equivalent fully managed modal. Tab remains inside; a meaningful heading and close button are available. Save errors remain inside the drawer. Desktop nonmodal side panels do not trap focus.
- Converting a side panel to a modal at a breakpoint must preserve selected record, draft and focus intent. Do not remount the cart or reset quantities when rotating a phone.
- Sticky bottom bars include safe-area padding and document scroll padding; virtual keyboard and 200% text size must not cover focused fields. Place checkout/status actions near the natural thumb zone but preserve reading order.
- A fullscreen map keeps the same map/data instance, allows Escape and visible exit, restores the trigger and previous scroll location. Current implementation exists in `frontend/src/components/AdminDeliveryMap.jsx:79` and `:163`.
- Prefer persistent labels to placeholder-only forms. A floating visual label is allowed only when label association, autofill behavior and zoom have been verified.

## 3. Public restaurant landing

### Component breakdown and content priority

| Priority | Component        | Content/actions                                                                                                                                                                   |
| -------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1       | PublicHeader     | Logo, menu/reserve/delivery anchors, sign-in/account action; mobile menu and cart count.                                                                                          |
| P1       | EditorialHero    | “Less waiting. More savoring.”, short restaurant proposition, Explore menu and Book table. Open status uses explicit supplied/configured state, never invented closing time.      |
| P2       | FeaturedMenu     | Food image, category/name/description, source price, availability, variant/add-on selection and Quick add. Manual carousel controls or responsive grid; no autorotation.          |
| P1       | ReservationEntry | Party size→date/time→table/floor/list→review/deposit. Display capacity, selected tables, policy and quote before commitment.                                                      |
| P2       | DeliveryChecker  | Address input/search, optional geolocation action, radius/eligibility result, fee estimate and route/map disclosure.                                                              |
| P2       | PolicySummary    | Currency, tax basis, service charge applicability, cancellation and deposit/refund terms, delivery boundary. Clearly differentiate example policies from current server policies. |
| P3       | PublicFooter     | Address/contact/hours, accessibility/help, sign-in and policy links.                                                                                                              |

**≥1280px:**72px header; hero 12-column grid with copy 7 columns and an editorial food/restaurant region 5 columns. Prose max 60ch; CTA row 48px high. Featured menu 4 cards across when each can remain≥240px, otherwise 3. Reservation and delivery sections use 7/5split or full-width stepper with an adjacent review summary. Policy cards 3 across; footer multi-column. The page remains a restaurant entry experience; internal admin navigation is absent.

**768–1024px:**64–72px header; hero 4/4split only when image/copy fit, otherwise stacked;3featured cards at 1024px and 2at 768px. Reservation section full width; review summary follows selected details. Delivery checker input spans available width with a 48px search action. Carousel has visible previous/next controls and a position label. No fixed width 3D scene pushes the page horizontally.

**375–430px:**sticky 64px header; editorial title about 31–39px fluid, then body, primary CTA and secondary Book table. Image follows copy without shifting it during load. Featured cards one full-width card per row or explicitly labeled horizontal carousel with full buttons. Category chips may scroll horizontally inside their own region; the page itself never scrolls sideways. A cart summary appears only after selection: item count, total and “Review cart,” followed by checkout inside the cart sheet. A dynamic amount must not be the button's entire accessible name.

### Reservation/delivery interactions

- Wizard state includes step,party,date/time,floor,selectedTables,contact,policyQuote and pending result. Back preserves draft. Step headers are buttons only if the step is reachable; invalid required fields are described inline.
- Desktop reservation dialog max 960px with table map 6/summary 4planning columns; tablet nearly full width; mobile full-height modal with scrollable body and sticky 48px Next/Back controls.2D/list selection is equivalent;3D is an optional view, not a gate to booking.
- Party>4 deposit terms must explicitly resolve whether$10 applies to all guests or only excess guests. Do not show an automatic refundable promise while production requires staff refund first. Review `backend/app/Services/ReservationService.php:129`.
- Fixture restaurant lacks coordinates/hours/timezone. An illustrative checker may demonstrate form/result layout but cannot assert an actual route, live rider position or 10PMclosing time. A real checker uses server quote validation; client radius is a preview.
- Public Quick add may maintain a local guest preview cart, but does not create an order. Sign-in/registration restores a safe cart draft and revalidates availability/prices with the server before checkout.

**States:**loading reserves hero/media/card dimensions; no featured items offers full menu; sold-out cheesecake remains visible with disabled Quick add and explanation; address failure preserves address; outside coverage offers pickup; no available tables suggests allowed alternatives; closed restaurant shows next configured hours only if known. Success for a preview is labeled “Added to preview cart,” not “Order placed.”

## 4. Administrator workspace

### Organisms and hierarchy

AppShell→PageHeading→Freshness/Attention→MetricGrid→FleetMap/OperationsContext→ActiveDeliveryTable→ContextualTools. Outlet editor uses location/coverage map, outlet details, compact hours and conditional SaveDock. Settings uses profile/appearance/pricing/notifications sections and links to distinct policy pages. Source baseline: `frontend/src/features/AdminWorkspace.jsx:443`, `:881`; `frontend/src/features/BusinessSettings.jsx:154`.

**≥1280px:**250px sidebar,72px topbar,32px main padding. Four metric cards span 3 columns each. Overview map 8 columns and operational context 4; tracking map spans 12with metrics below it. Alert spans 12above the map when needed. Active deliveries table spans 12; status/ETA/amount align to consistent columns; row action is a named link to dispatch. Outlet editor 7/5map-and-form split if each side fits; otherwise stack. System settings 8/4main/context split. Form save bar spans the working form width, not the sidebar.

**768–1024px:**drawer or compact rail; do not retain a full 250px sidebar against a 768px viewport. Metrics 2×2; map spans 8; context becomes a 2-column secondary row or disclosure. Table preserves key reference/status/rider/ETA in a labeled scroll region, or converts to cards at content threshold. Outlet map and details stack with coordinates adjacent to their pin helper. Settings context follows profile or becomes More settings disclosure without hiding a required field.

**375–430px:**one-column metrics in the target template; the current shipped admin uses some 2-column metric layouts (`adminWorkspace.css:2291`), so migration requires visual review, not a false claim of current single-column parity. Heading/action rows wrap; attention card action full width. Tracking map is at least 340px and expandable to fullscreen; rider list and coverage text remain outside the map. Delivery rows become common-region cards with reference/status first, customer/rider then ETA/amount, one clear Open dispatch action. Outlet coordinates use a two-column pair only if labels and values fit; otherwise stack. Hours use day+mode; opening/closing appear only for custom hours; bulk “Apply Monday…” is an explicit draft change.

### Interaction, permission and states

- Six canonical navigation modules remain flat; More tools provides search and unique legacy destinations. Full-access admin sees allowed settings/users/audit; never remove those merely to shorten sidebar.
- Metric navigation opens a relevant existing tool. Delayed/unassigned counts are derived from backend data, not fixture colors. Unknown values show em dash rather than zero. Last successful freshness persists after refresh failure.
- Location pin can be dragged or changed through numeric coordinates; address is reviewed separately. Coverage preview does not save. Save validates hours/coordinates and atomically persists radius/status/location; preserved pricing is not overwritten (`AdminWorkspaceController.php:85`).
- Dirty save dock sticks; clean save controls return to normal flow. Field errors retain draft and focus; success status remains available after its short sticky acknowledgement.
- The plural outlet page currently edits one stored primary outlet. A multi-outlet switcher is proposed only after scoped outlet records and permissions exist.

**States:**initial skeletons; empty fleet with “No recent rider locations”; stale GPS excluded from live pins but listed clearly; no deliveries with meaningful empty copy; failed tiles with numeric coords and retry; refresh error retains last usable table; save error explains unsaved state; success reflects persisted values after reload.

## 5. Manager workspace

Managers share navigation and presentation primitives with administrators, but their working surface prioritizes service throughput. Default permissions are at `backend/database/seeders/AuthSeeder.php:31`.

### Organisms and layout

DailyOperationsHeader, DispatchAttention, OrderQueueSummary, FleetMap, ReservationArrivalList, TableOccupancySummary, OperationalReportLinks and ContextualMenu/FloorPlan actions. Dashboard totals are operational measures; payment cash collection and unrestricted settings are absent.

**≥1280px:**12-column grid within shared shell. Top row shows active orders, pending kitchen work, reservations/occupancy and delivery exceptions. Primary work region 8 columns combines queue/dispatch;4-column context shows upcoming arrivals/table availability. Optional map 8 columns with dispatch sidebar 4. Report/CSV controls follow operational totals, avoiding a large decorative chart above actionable work. The menu/floor-plan editors remain separate tools.

**768–1024px:**8-column grid; four metrics in 2 rows, queue full width, arrivals and occupancy 4/4. Map is full width with rider details in a sheet. A single “Open dispatch” primary CTA stays visible; CSV and filter controls go into an overflow menu with explicit names.

**375–430px:**one-column priority stack: attention→active queue→arrivals→occupancy→summary. A sticky contextual CTA may open dispatch for a selected exception; no unconditional floating action obscures forms. CSV exports remain reachable in Reports rather than crowding a mobile queue card. Navigation labels remain visible in the drawer; icon-only shortcut rows cannot be the sole route discovery.

### Interaction and states

- Manager can confirm/cancel/prepare orders according to server transition rules, assign/retry/recover deliveries and edit menu/floor layouts.
- Manager refund is a separate authorized workflow; “Record cash” is absent because payments.manage is not granted. Financial-report datasets stay restricted even when order gross appears in operational reports.
- Editable layout has draft/published markers, Save draft vs Publish distinction and keyboard alternatives for object actions. Losing connection preserves unsaved editor state; failed Publish keeps the draft and its errors.
- Empty arrival list means no reservations in range; failed load does not say no bookings. A delayed delivery card remains actionable after noncritical refresh failure with stale timestamp visible.

## 6. Cashier / POS workspace

### Organisms

CashierHeader, PaymentQueueTabs, SearchFilter, UnpaidTicketList, SelectedBillDrawer, PriceBreakdown, MethodSelector, PaymentReview, ReceiptPanel, DailyTransactionSummary and proposed ShiftReconciliationDrawer. Existing sources: `frontend/src/PaymentOperations.jsx:10`, `frontend/src/AdminOperations.jsx:566`.

**≥1280px:**12-column layout with queue 7 columns and selected bill 5. The ticket region remains visually fixed while its body scrolls; header shows table/order/reference and balance due, body groups order lines, footer contains review/method actions. Search above queue never stretches every filter across the full screen. Daily totals are compact and subordinate to the selected work. Open bills, order balances and reservation deposits are explicit queue types, not one mixed list with ambiguous labels.

**768–1024px:**8 columns; queue 4/selected bill 4 when each≥320px, otherwise master-detail. Selected bill can expand to a modal sheet without resetting selection. Touch controls 48px; payment methods wrap in equal-width choices. Full amount breakdown stays readable at 200% and no monetary column is clipped.

**375–430px:**single queue with sticky selected-ticket summary at bottom. Opening it expands a bottom sheet: named heading, close control, scrollable lines, tax/service/delivery/discount/balance and 48–56px review/payment controls. Collapsed summary is a button with entity and balance. Checkout confirmation is a deliberate second stage after choosing Cash or Hosted online checkout. Do not leave queue controls active behind the sheet. Receipt reopens after closing without repeating settlement.

### Financial flow/state requirements

1. Select bill/order/deposit; distinguish table-session consolidated bill from an individual order.
2. Read server due amount/currency and current pending state. Fixture subtotal math is not settlement truth.
3. Choose method; review target, amount, tender/change if an implemented cash-tender model supports it, and authorized staff identity.
4. Submit once; lock target; display processing. Timeout is “Result not confirmed—refresh to check,” not automatic failure/retry.
5. Verified success produces receipt/reference and removes/updates queue item. Provider-pending remains pending. A browser return page does not prove payment.

**Shift drawer is proposed:**show opening float, cash receipts/refunds in permitted scope, expected cash, counted denomination totals, difference, reason and handover. Production needs shift ownership, opening/closing timestamps, immutable closed snapshot, concurrency guards, audit and supervisor authorization rules. A mock balancing calculation must be marked “Preview only”; Daily transactions currently is not a shift ledger. Cashier has no refund action. Manager/admin handle the separate full-refund process.

**States:**no unpaid bills, search no matches, failed queue read, stale balance changed by another cashier, already paid, checkout pending, cash success, receipt unavailable and closed-shift read-only. Never hide the reason inside a disabled button tooltip only.

## 7. Kitchen Display System

### Organisms and density

KdsHeader with connection/freshness, Station/TypeFilter, SummaryCounts, PriorityTicketGrid, KdsTicket and TicketDetails. Each ticket contains reference/type/table, age/prep expectation, item quantities/variants/add-ons/notes and one current legal bump action. Kitchen should not expose financial-report controls or staff-management navigation. Existing queue uses `frontend/src/features/Orders.jsx:30`; server preparation guard is `backend/app/Services/OrderService.php:186`.

**≥1280px:**compact 64px task header;3-column grid with minimum 320px ticket width,24px gaps. Ticket headings use 20–25px; quantities 20px and body 16–20px depending display distance. Timers align consistently at top-right but remain in normal flow when labels wrap. One 48px-wide/full-width Start preparing or Mark ready footer. Priority has text/icon/border, never red fill alone. Detail disclosure keeps long notes available.

**768–1024px:**2 columns with 16px gaps; summary counts compact, filter chips wrap or scroll in their own region. Avoid fixed ticket height that clips long add-ons. A high-priority ticket may span both columns only with stable reading/focus order, not CSS reordering.

**375–430px:**one ticket stack ordered by explicit priority/time. Header shows concise connection status and filter disclosure. Sticky action belongs to the selected ticket/detail sheet, not to the entire queue; otherwise each ticket footer remains in flow. Larger 48–56px bump buttons and 16px+ item text. Card selection does not bump the order; explicit action is required.

### Live behavior and states

- New tickets produce one polite summary such as “2 new kitchen tickets”; do not announce the entire grid every 5seconds or timer values every second.
- Preserve focus and partially entered prep minutes during refresh. If a ticket leaves the queue after bumping, restore focus to the next logical ticket or summary with a confirmation.
- An age threshold must come from configured operational policy. Supplied fixture “Delayed” is an exception label, not a new backend kitchen status. A timer is elapsed time, not a guaranteed preparation SLA.
- Kitchen can only Start preparing/Mark ready; confirm/cancel/serve/complete remain outside its permission scope. Delivery vehicle/prep details are operational context; do not add cash/refund/report controls.
- Loading uses reserved ticket shapes; empty shows “No confirmed orders waiting”; offline retains last queue with timestamp and blocks uncertain duplicate bumps; server conflict refetches current status; success removes/updates only the affected ticket.
- Optional audio alert requires independent sound controls and a visual equivalent. No flashing or mandatory sound; reduced motion disables nonessential entrance effects.

## 8. Waiter / dining room workspace

### Organisms

ServiceHeader, TableStatusCounts, ZoneFilter, FloorMap/ListSwitch, TableNode/TableCard, SelectedTablePanel, ReservationArrivalList, SeatingReview, OrderEntryWizard and SessionSummary. Existing occupancy is `frontend/src/Reservations.jsx:1175`; session settlement checks are in `backend/app/Http/Controllers/Api/V1/ReservationController.php:125`.

**≥1280px:**12 columns; interactive floor/list 8 and selected table 4. Zone filters sit above floor. Context panel shows table number/capacity/status, party/reservation, elapsed session and current orders with occupancy controls. Arrivals list below floor or a separate tab. Table nodes have visible numbers and legend; status must also exist in a navigable list.

**768–1024px:**8 columns; floor occupies full width, selected table opens a max 480px side sheet or a 4-column context panel when space permits. Landscape may use 5/3; portrait uses full map plus details below. Table list is available without gestures. Seating action confirms party/capacity and pending deposit policy before transition.

**375–430px:**list-first service overview, zone chips and large table cards; optional floor opens fullscreen with the same selected table and a list alternative. Tap table→detail sheet→one primary action for its legal state. Sticky bottom New order appears only with a selected valid dining session and authorized backend contract. Occupied/Cleaning/Available/Unavailable remain explicit actions with billing constraints surfaced before clearing a table.

### Proposed mobile order entry

1. **Session:**table/session/reservation,party details and open-state validation. No arbitrary hidden customer impersonation.
2. **Items:**category/search,menu item,variant,add-ons,quantity and notes; out-of-stock item visible with explanation; cart summary persists.
3. **Review/send:**group lines with edits, price context, table/session,allergy/special instructions and Send to kitchen/create order wording reflecting actual backend semantics. Confirmation/pending status depends on configured workflow, not a hardcoded promise.

Current API permits orders.manage creation (`CreateOrderRequest.php:13`) but stores actor as customer (`OrderService.php:129`) and ties reservation lookup to that actor (`OrderService.php:36`). The new staff flow must define server-side session/customer attribution before live submission. A preview wizard may demonstrate navigation/calculation only. Waiter cannot collect payment, refund or edit menu/settings.

**States:**no active tables, no arrival in range, unavailable table, stale occupancy changed by another staff member, insufficient capacity, unpaid bill preventing clear, session closed during item entry, item removed/price changed, send error retaining draft and verified success with order reference. Expected table availability is a staff estimate, never a guarantee.

## 9. Delivery rider workspace

### Organisms

RiderHeader with online/GPS health, AvailabilityControl, OfferFeed, OfferDetails, NextStopCard, RouteMap/List, DeliveryStepPanel, ContactActions, ProofUploader, Earnings/HistorySummary and Reviews. Existing rider pages remain separate from administrator fleet monitoring.

**≥1280px:**centered max 1120px working area.8-column map/work list and 4-column next stop/details. Offers are a reviewable list; chosen offer opens detailed pickup/destination/distance/load context. Route planner is optional and preserves current assignment order. History table paginates; never load every delivery at once.

**768–1024px:**8-column layout with map full width or 5/3map/details in landscape. Next-stop status action visible near details; GPS health remains above route. Long addresses wrap. Contact controls are 48px and open a device-appropriate call/map action only after deliberate selection.

**375–430px:**single task-first column: availability/GPS→next stop→route preview→status steps→offer/history details. Primary sticky CTA48–56px reflects next legal step, such as Arrived/Picked up/Start delivery; sticky status never overlaps proof inputs or the system keyboard. Route is expandable fullscreen; compact map is optional when connection is poor. Bottom navigation has only relevant destinations with text labels.

### Truthful tracking and delivery flow

- GPS statuses distinguish off, asking permission, acquiring, accurate, stale/low accuracy, permission denied, network offline and browser background/paused. “Background location active” cannot be guaranteed by this web app. `README.md:27` explicitly describes browser limitations.
- Offer expiry shows a real deadline and server time context. Review before Accept; expired/taken offers are disabled with text and refresh recovery. No autoaccept as a side effect of opening an offer.
- Next-stop details distinguish pickup and customer destination; list directions and external navigation are separate from route polyline. Turn-by-turn guarantees require the selected navigation provider.
- Proof upload shows selected file/preview,progress or pending state,size/type validation,error retry and success reference. Do not mark delivered merely because a local photo preview exists.
- History/reviews already paginate (`RiderWorkspace.jsx:406`; `RiderReviews.jsx:231`); preserve filters,page count and named Prev/Next controls.
- Assigned-delivery ownership remains enforced server-side. The UI never uses another rider's fixture detail as proof of access.

**States:**no offers, no assignment, offer expired/taken, GPS denied, background/paused warning, stale fix with timestamp, failed route request with address fallback, upload failed retaining selection, status conflict, completed delivery and read-only history. Reduced motion avoids automatic map flights after every GPS update; do not make a rider chase a moving button.

## 10. Customer workspace

### Organisms

CustomerHeader, RestaurantStatus, OrderTypeSelector, MenuSearch/CategoryChips, MenuCard, ItemCustomizer, CartSummary/Drawer, AddressPicker/DeliveryQuote, CheckoutReview, MyOrders, ReservationWizard, TrackingMap/Timeline, Receipt and RiderRating.

**≥1280px:**max 1280px content. Menu 8 columns and cart 4; menu cards 2–3 across according to actual available width, with image aspect ratio reserved before load. Item customizer dialog separates choices from price/quantity. Cart summary sticky within its own column and includes full breakdown. Reservations use map/list 8and selection/review 4. Tracking uses map 8and timeline/details 4; current state and ETA remain text outside map.

**768–1024px:**2menu cards across; category row and search full width. Cart uses a side/bottom sheet if a 320px cart would compress menu content. Reservation map/list full width with selected-table summary following it. Tracking map full width, timeline next. Payment review is a single coherent panel rather than a wide scattered row.

**375–430px:**sticky header; search and horizontally scrollable category pills inside a labeled region; one readable menu card per row or a carefully sized two-card media layout only when all text remains at least the specified scale. Fixed bottom cart summary appears only when nonempty, with item count,formatted total and Review cart. Item customizer is a full-height sheet with scrollable choices and 48px add/update action. Reservation wizard is sequential; tracking timeline appears before/alongside optional fullscreen map so status is useful on a slow connection.

### Customer states and policy disclosure

- Variant/add-on changes update preview totals immediately; final server totals replace client estimates before payment. A changed price/unavailable item requires review.
- Clearly identify pickup vs delivery vs dine-in. Delivery address/phone and quote requirements are explicit; dine-in uses an active seated reservation/table code under the current server contract.
- Pending owner cancellation is available where server permits; already-paid orders require refund handling. Do not present fixture 15-minute cancellationWindowMins as an enforced production guarantee.
- Reservation deposit/payment policy is visible before commitment; no inferred$10 perguest or automatic 2-hour refund behavior in production until implemented.
- Customer tracking is own-order only, with rider/ETA freshness and order-vs-delivery stages separated. A map marker does not prove current GPS; use timestamp/stale state. Rating follows eligible delivery completion.
- Empty cart has a Browse menu CTA; category no matches has Clear filters; sold out does not disappear mysteriously; checkout error preserves order reference; provider pending is distinct from failure; receipt success includes verified payment amount/reference.

## 11. Scale and pagination contracts

| Surface              | Existing state                                                                          | Target behavior                                                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orders/history       | Orders requests first 100without paging (`Orders.jsx:63`); rider history already pages. | Server-backed filters/page size 20/50/100where appropriate; visible range and total; preserve filters in URL/state and move focus to results summary after explicit page change. |
| Audit/team           | APIs paginate 50/30, views consume firstpage (`Administration.jsx:12`, `:161`).         | Named Previous/Next, page/total, page-size limit and no hidden truncation.                                                                                                       |
| Payment transactions | API paginates 30; UI uses recent results.                                               | Paginated ledger with date/status/method filters; selected bill stays stable while ledger page changes.                                                                          |
| Menu                 | Five supplied items only.                                                               | Keep exact fixture scenario plus generated deterministic 200-item stress mode; loading-more button announces added count and keeps focus; user can reach footer.                 |
| Fleet/deliveries     | Overview max 100delivery preview and 8visible rows.                                     | State “Showing…preview” and link to complete dispatch. Server-filtered pagination for full queue; global metrics independent of preview count.                                   |
| Reviews/rider logs   | Existing pagination.                                                                    | Preserve behavior; test long review text,0/1/31/201 records and filters returning 0.                                                                                             |

Do not make infinite scrolling the only way to locate an older financial/audit record. Numbered/previous-next pagination is more predictable there. Lists using Load more keep the current position and do not forcibly jump focus to each appended item.

## 12. Cross-template acceptance matrix

| Test dimension     | Required scenarios                                                                                                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Widths/orientation | 375,390,430,768,1024,1280,1440CSSpx; portrait/landscape;320equivalent reflow.                                                                                                     |
| Content            | Empty,1 record,exact supplied records,200deterministic generated records; long names/addresses/notes,missing photo/unavailable item,large amounts and translated labels.          |
| Focus/input        | Keyboard-only all actions;Tab/Shift+Tab/Escape;mouse,touch,voice-control accessible names;focus after filtering/paging/removing record;hybrid input without forced modality.      |
| Vision             | 200%text,400%zoom,text-spacing overrides,light/dark/forced-colors,measured normal/hover/focus/selected/error pairs.                                                               |
| Motion/live state  | Reduced motion,poll pause/controlled updates,no focus loss/countdown spam,stale GPS/offline/visibility changes.                                                                   |
| Mutation           | Double-click prevention,conflicting status,uncertain timeout,field errors preserving draft,verified success vs provider pending,no production mutation from preview.              |
| Permissions        | Each of seven server-derived roles;direct API request denies unauthorized action;preview role selector cannot change live session;customer/rider record ownership remains scoped. |
| Modal/sheet        | Open/close/focus restore;scroll locking;safe area;virtual keyboard;nested tool→modal transitions;mapfullscreen Escape;readable persistent error/status.                           |

This document defines responsive intent and production boundaries. Visual preview acceptance and shipped-route acceptance must be recorded separately, with actual tested routes and known failures rather than a blanket “AAA compliant” or “production ready” label.
