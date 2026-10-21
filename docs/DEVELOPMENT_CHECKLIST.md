# DineFlow Development Checklist

This roadmap sequences implementation. Chunks 0–8 and the workflow-completion changes are implemented locally. See IMPLEMENTATION_STATUS.md for verified scope and the remaining live-service/release steps.

## Chunk 0 — inspection and architecture

- [x] Inspect the workspace and record available/missing runtimes.
- [x] Propose application boundaries, data model, REST API conventions, integration requirements, environment variables, and roadmap.
- [x] Install/configure PHP, Composer, PostgreSQL, and required local services.
- [x] Install dependencies and verify application/database health.

## Chunk 1 — authentication, accounts, and permissions

- [x] Add Sanctum SPA session auth, customer-only public registration, password recovery, and deactivated-account handling.
- [x] Add secure first-administrator Artisan command, staff account/role management endpoints, permission middleware, and audit events.
- [x] Add permission-driven React navigation and account sign-in, registration, recovery, and staff management screens.
- [x] Add role-isolation and navigation test cases.
- [x] Run Laravel and React tests in the configured runtime.
- [x] Initialize Git; add GitHub Actions checks, ESLint, Prettier conventions and PHP Pint formatting.

## Chunk 2 — restaurant CMS and catalog

- [x] Add restaurant settings defaults, menu categories/items/options, media handling, and CMS interfaces.
- [x] Add validated server-side catalog availability and price snapshots.
- [x] Add dine-in, pickup, and delivery order creation with server-calculated totals, status history, and customer/staff interfaces.
- [x] Add database-backed coverage for price snapshots, item availability, ownership privacy, and multiple orders within one dining session.

## Chunk 3 — floor plan and reservations

- [x] Add floor/table/zone/layout schema and admin editor with draft/publish workflow.
- [x] Add availability queries, table-locked booking service, cancellation/rescheduling rules, staff occupancy history, and reservation UI.
- [x] Add React Three Fiber scene driven by API records and accessible 2D fallback.
- [x] Cover overlapping booking attempts, customer privacy, occupancy updates, and layout publishing with database-backed tests.
- [x] Add an eight-worker PostgreSQL concurrency harness, database overlap constraint and private floor invalidations. Render Free retains polling; optional Reverb needs a persistent process.

## Chunk 4 — delivery operations and maps

- [x] Add customer-owned delivery address book with ownership-safe create, update, and delete endpoints.
- [x] Add restaurant address/location settings, delivery radius, minimum order, operating hours, base/per-road-km pricing, and free-delivery threshold.
- [x] Add Leaflet delivery map, address search, draggable pin, server-calculated route distance/time, delivery quote, and order destination snapshots.
- [x] Keep geocoding/routing credentials in Laravel environment configuration and surface unavailable provider/route states.
- [x] Add rider profiles, assignments, status history, and dispatch UI.
- [x] Add rider navigation, consented GPS updates, private customer tracking channels, stale-location behavior, and retention controls. Browser GPS may pause while backgrounded; reliable background operation needs a dedicated mobile app or platform background-location support.

## Chunk 6 — payments

- [x] Select PayMongo Hosted Checkout v2; support card, GCash, and QR Ph subject to merchant eligibility, plus configurable cash collection.
- [x] Create order, dine-in session, and optional reservation-deposit payments using server-calculated PHP amounts.
- [x] Verify raw-body signed webhooks, mode, currency, and amount; persist provider event IDs for idempotency.
- [x] Track pending, paid, failed, cancelled, refund transaction, and refunded states without using checkout redirects as payment proof.
- [x] Add cash workflows, payment allocations, printable receipts, authorized refunds, and scheduled checkout timeout/deposit release.
- [ ] Enter merchant test credentials and webhook signing secret, register the public endpoint, and complete provider sandbox transactions. PayMongo test-mode refunds are not available; provider refunds require live transactions.

## Chunk 7 — admin CMS and operational dashboards

- [x] Replace overview, report, and cashier-summary placeholders with stored order, reservation, table, delivery, payment, and menu-item data, scoped by the actor's permissions.
- [x] Add daily, weekly, monthly, and custom date filters, sales and payment summaries, reservation/no-show totals, delivery performance, occupancy history, and CSV exports.
- [x] Add a daily/weekly/monthly reservation calendar with authorized lifecycle actions, history lookup, and table reassignment through the reservation service.
- [x] Add order type, status, payment-state, and date filters; expand menu and business settings administration.
- [x] Add API role-isolation coverage and desktop/mobile browser acceptance tests for customer and kitchen workflows; retain manual checks for other operational screens.

## Hardening and release

- [x] Add automated authorization, concurrency, signed-webhook, selected WCAG checks and desktop/mobile acceptance coverage. Real provider sandbox testing remains separate.
- [x] Document local setup, deployment, backup/restore procedures, monitoring, and maintenance.
- [ ] Configure production secrets, monitoring, backup retention, and execute a recovery exercise.

## Chunk 8 — notifications, security, testing, and deployment

- [x] Add database-backed in-app notifications for new orders, order status changes, reservation creation/status changes, verified payment results, rider assignment, and delivery progress.
- [x] Add hourly, deduplicated reminders for confirmed reservations starting within 24 hours.
- [x] Add authenticated notification listing, unread counts, and per-user read authorization with a workspace notification center.
- [x] Add per-user throttles to order/reservation creation, rescheduling, and payment checkout endpoints; retain auth, address lookup, GPS, and webhook throttles.
- [x] Document local setup, environment configuration, HTTPS deployment, PostgreSQL backups/restores, monitoring, scheduler/queue, maps/payments, and browser GPS limits in `docs/OPERATIONS.md`.
- [x] Add feature coverage for notification targeting and customer notification privacy.
- [x] Verify 42 Laravel tests (169 assertions), five frontend unit tests, six desktop/mobile browser cases, lint/format checks and the production build. Verify PostgreSQL concurrency and scratch backup/restore separately.
- [x] Add automated role authorization, concurrency, accessibility, mobile and signed-webhook/browser coverage.\n- [ ] Complete real PayMongo sandbox transactions and manual hosted acceptance checks for the remaining staff screens.
- [ ] Configure production secrets, provider accounts, queue/broadcast infrastructure, monitoring, backup retention, and a verified restore exercise.


## Workflow completion

- [x] Customer account name and securely verified password changes; revoke other sessions after password change.
- [x] Replay-safe order/reservation submissions and structured API errors.
- [x] Database readiness endpoint without secrets.
- [x] UTC booking instants, restaurant timezone controls and per-booking turnover buffers.
- [x] Preserve reservation ownership on staff reschedule; link seating to sessions and block unpaid table closure.
- [x] Fix delivery history persistence and webhook live/test flag validation.
- [x] Native 3D labels with safe teardown, a device fallback, accessible default 2D booking, readable contrast and labelled mobile navigation.
- [x] Safe local PostgreSQL recovery rehearsal; no production reset.
- [ ] Push/review this change, run remote CI/Docker and redeploy it to Render.
- [ ] Review legacy booking timestamps/overlaps before applying the new constraint to existing data.
- [ ] Configure and verify production backups, monitoring, SMTP and test merchant credentials as needed.

