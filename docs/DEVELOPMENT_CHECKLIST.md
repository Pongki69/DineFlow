# DineFlow Development Checklist

This roadmap sequences implementation. Chunks 0–8 are implemented locally; production rollout and full verification remain future work.

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
- [ ] Initialize Git and add CI/format/lint conventions.

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
- [ ] Add a PostgreSQL concurrency stress test and WebSocket broadcasting; current interfaces refresh availability/occupancy by polling.

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
- [ ] Complete role authorization and browser acceptance coverage.

## Hardening and release

- [ ] Complete authorization, concurrency, accessibility, mobile, webhook, and end-to-end acceptance coverage.
- [x] Document local setup, deployment, backup/restore procedures, monitoring, and maintenance.
- [ ] Configure production secrets, monitoring, backup retention, and execute a recovery exercise.

## Chunk 8 — notifications, security, testing, and deployment

- [x] Add database-backed in-app notifications for new orders, order status changes, reservation creation/status changes, verified payment results, rider assignment, and delivery progress.
- [x] Add hourly, deduplicated reminders for confirmed reservations starting within 24 hours.
- [x] Add authenticated notification listing, unread counts, and per-user read authorization with a workspace notification center.
- [x] Add per-user throttles to order/reservation creation, rescheduling, and payment checkout endpoints; retain auth, address lookup, GPS, and webhook throttles.
- [x] Document local setup, environment configuration, HTTPS deployment, PostgreSQL backups/restores, monitoring, scheduler/queue, maps/payments, and browser GPS limits in `docs/OPERATIONS.md`.
- [x] Add feature coverage for notification targeting and customer notification privacy.
- [x] Run Laravel feature suite (20 tests, 68 assertions), React tests (2), PHP syntax checks, route/scheduler checks, and frontend production build.
- [ ] Complete role authorization, concurrency, accessibility, mobile, webhook sandbox, and browser acceptance coverage.
- [ ] Configure production secrets, provider accounts, queue/broadcast infrastructure, monitoring, backup retention, and a verified restore exercise.

