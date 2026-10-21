# REST API reference and historical plan

The first two route tables below are historical proposals, not implemented aliases. Use the later implemented sections and backend/routes/api.php as the source of truth. The established Geoapify, PayMongo, Sanctum and PostgreSQL workflow takes precedence. The original proposal placed routes under `/api/v1`, return JSON, use Laravel API Resources, and validate input with Form Requests. Use standard HTTP status codes and a consistent error shape with a stable machine-readable `code`, human-readable `message`, and optional field `errors`. Paginate collection endpoints. Use ISO-8601 UTC timestamps and integer minor units plus currency for amounts. Mutating requests that can be retried should accept an idempotency key.

## Public and customer

| Method | Endpoint | Purpose / access |
|---|---|---|
| GET | `/health` | Liveness/readiness details without disclosing secrets. |
| GET | `/restaurants/{restaurant}` | Public restaurant profile and hours. |
| GET | `/restaurants/{restaurant}/menu` | Public available catalog, search/filter. |
| GET | `/restaurants/{restaurant}/tables/availability` | Public booking availability for date/time/party size. |
| GET/POST | `/auth/csrf`, `/auth/register`, `/auth/login`, `/auth/logout`, `/auth/me` | Sanctum first-party SPA session flow; registration always Customer. |
| POST | `/auth/forgot-password`, `/auth/reset-password` | Verified recovery flow with rate limits. |
| GET/POST/PATCH/DELETE | `/me/addresses` | Customer-owned address book. |
| POST | `/reservations` | Transactionally reserve a selected eligible table. |
| GET | `/me/reservations` | Own reservations only. |
| GET/PATCH/DELETE | `/me/reservations/{reservation}` | Own booking with policy/deadline checks. |
| GET/POST | `/me/orders`, `/orders/{order}/payments` | Place own order and start eligible payment workflow. |
| GET | `/me/orders`, `/me/payments` | Own records only. |
| POST | `/delivery/quote` | Server calculates coverage, route estimate, and fee; no client total accepted. |
| GET | `/my/deliveries/{delivery}` | Own delivery status with privacy-minimized rider data. |
| POST | `/orders/{order}/payments/checkout` | Owner starts PayMongo hosted checkout for the server-calculated remaining order balance. |
| POST | `/reservations/{reservation}/deposit/checkout` | Owner starts the configured reservation deposit checkout. |
| GET | `/payments/{payment}`, `/payments/{payment}/receipt` | Owner retrieves payment state and a printable receipt. |

## Staff and administration

| Method | Endpoint | Purpose / access |
|---|---|---|
| GET | `/staff/dashboard` | Role-filtered operations summary. |
| GET/PATCH | `/staff/reservations`, `/staff/reservations/{reservation}` | Staff reservation workflow, policy-gated transitions. |
| POST | `/staff/reservations/{reservation}/check-in`, `/seat`, `/reassign` | Explicit check-in/seating/table reassignment actions. |
| GET/PATCH | `/staff/orders`, `/staff/orders/{order}` | Order queue and allowed lifecycle changes by role. |
| GET/POST/PATCH | `/staff/sessions`, `/staff/sessions/{session}` | Dining session and bill lifecycle. |
| GET/POST/PATCH/DELETE | `/admin/menu/*`, `/admin/tables/*`, `/admin/floors/*` | CMS operations guarded by permissions. |
| GET/POST/PATCH | `/admin/users`, `/admin/roles` | Admin-only account management and role grants; never self-escalate. |
| GET/PUT | `/admin/settings`, `/admin/reservation-policy`, `/admin/delivery-policy`, `/admin/payment-policy`, `/admin/restaurant/location` | Restricted restaurant/integration configuration. |
| GET | `/admin/audit-logs`, `/reports`, `/reports/financial` | Permission-scoped audit, operations, and finance reports. |

### Implemented reservation and floor-plan routes

The following Chunk 3 routes are live under `/api/v1`:

| Method | Endpoint | Purpose / access |
|---|---|---|
| GET | `/floor-plan/floors` | Published floor layouts for customer maps. |
| GET | `/reservations/availability?starts_at=&guest_count=&floor_id=` | Current table eligibility and next schedulable estimates. |
| GET/POST | `/reservations` | Own reservation history; create a selected or automatically assigned booking. |
| GET | `/reservations/{reservation}` | Own booking or staff-managed booking details. |
| PATCH | `/reservations/{reservation}/status` | Owner cancellation and authorized staff lifecycle transitions. |
| POST | `/reservations/{reservation}/reschedule` | Atomic cancellation and replacement reservation under the booking policy. |
| PATCH | `/service/tables/{table}/occupancy` | Staff occupancy and expected departure estimate, with history. |
| GET/POST/PUT | `/admin/floor-plan/floors/*` | Authorized floor creation, draft layout editing, and publish. |
| GET/PUT | `/admin/reservation-policy` | Administrator-managed hours, duration, buffer, booking window, and policies. |

Current reservations serialize table allocation using a transaction and a row lock, then repeat the interval check immediately before insertion. The availability route is informative; booking is always revalidated by the write route.

## Delivery, rider, and integration

Implemented Chunk 4 mapping routes:

| Method | Endpoint | Purpose / access |
|---|---|---|
| GET | `/restaurant/location` | Public restaurant address, coordinates, contact, hours, and navigation link. |
| GET | `/maps/search?q=` | Authenticated server-side Geoapify address search; provider key never reaches the browser. |
| GET/POST/PUT/DELETE | `/addresses` | Authenticated customer's own delivery addresses, including pin and instructions. |
| POST | `/delivery/quote` | Reprices submitted menu selections on the server, checks radius/hours, and returns road distance, travel estimate, fee, and minimum-order status. |
| GET/PUT | `/admin/delivery-policy` | Settings-authorized delivery area, hours, and fee rules. |
| PUT | `/admin/restaurant/location` | Settings-authorized restaurant address, coordinates, contact, and hours. |

Delivery order submission repeats route/coverage/hour checks on the server and persists the address text, customer-selected coordinates, recipient/phone, instructions, road distance/time, and final fee as an order snapshot. Mapping uses `MAP_PROVIDER=geoapify` and requires `GEOAPIFY_API_KEY`; map tiles use OpenStreetMap with attribution. Rider endpoints below are implemented under `/api/v1`; private broadcast authorization is also available at `/api/v1/broadcasting/auth`.

| Method | Endpoint | Purpose / access |
|---|---|---|
| GET | `/rider/assignments`, `/rider/profile` | Current rider's assignments and profile only. |
| POST | `/rider/deliveries/{delivery}/accept`, `/reject` | Assigned rider only; dispatch rules applied. |
| PATCH | `/rider/deliveries/{delivery}/status` | Valid status transition for assigned rider; failure requires a reason. |
| POST | `/rider/deliveries/{delivery}/locations` | Active assigned delivery, consented device, validated/rate-limited coordinates. |
| GET | `/admin/deliveries` | Manager/admin dispatch queue, active deliveries and available riders. |
| POST | `/admin/deliveries/{delivery}/assign`, `/cancel` | Manager/admin assignment, reassignment and cancellation with recorded reason. |
| POST | `/orders/{order}/payments/cash`, `/dining-sessions/{session}/payments/cash` | Cashier records the calculated amount due and is recorded as receiver. |
| POST | `/dining-sessions/{session}/payments/checkout` | Cashier opens hosted checkout for the outstanding session bill; capture allocations are recorded per order. |
| POST | `/reservations/{reservation}/deposit/cash` | Cashier records a configured reservation deposit. |
| POST | `/admin/payments/{payment}/refund` | Manager/admin records a cash refund or requests a full PayMongo refund. |
| GET/PUT | `/admin/payment-policy` | Admin configures enabled hosted methods and cash acceptance; credentials are not returned. |
| POST | `/webhooks/paymongo` | Public webhook verifies raw-body `Paymongo-Signature`, amount, currency and mode; provider event IDs are idempotent. |
| GET | `/payments`, `/cashier/payment-queue`, `/dining-sessions/open-bills` | Authorized cashier/refund staff transaction and outstanding-bill queues. |

PayMongo Hosted Checkout v2 is used for card, GCash, and QR Ph where enabled for the merchant. Redirects do not establish payment; only signed provider events do. The scheduler expires abandoned sessions after 30 minutes and releases unpaid deposit reservations after provider-confirmed expiry. Cash and online payment status stay separate from order status. Session-level dine-in payments allocate captured amounts to individual order balances.

## Chunk 7: operations, reports, and business CMS

| Method | Endpoint | Purpose / access |
|---|---|---|
| GET | `/dashboard?from=&to=` | Permission-filtered overview for the signed-in staff role, sourced from restaurant records. |
| GET | `/reports?from=&to=`, `/reports/financial?from=&to=` | Operational or financial report sections according to permissions; date windows are limited to 366 days. |
| GET | `/reports/export?dataset=orders\|payments\|reservations\|deliveries&from=&to=` | Permission-checked CSV exports with spreadsheet formula injection mitigation. |
| GET | `/cashier/summary` | Cashier's actual daily payment and refund totals and transaction history. |
| GET/PUT | `/admin/settings` | Admin-only restaurant brand, business timezone, tax rate, service charge, and notification settings. |
| GET | `/restaurant/branding` | Public, non-sensitive restaurant name and brand color for customer and staff interfaces. |
| GET | `/orders?order_type=&status=&payment_status=&from=&to=` | Customer-owned order list or staff order queue with server-side filters. |
| GET | `/reservations?from=&to=&status=&per_page=` | Customer-owned bookings or staff date-filtered reservation calendar data. |

Reservation transitions, no-show rules, deposits, reassignment availability, order status, menu price changes, and settings changes continue to be enforced and audited by backend services. Daily, weekly, monthly, or custom report periods are selected by date range; returned values are database aggregates rather than demonstration metrics.

## API conventions and controls

- Use session-based Sanctum authentication for the first-party React SPA when deployment domains permit; enable CSRF, HTTPS, secure/HttpOnly cookies, and explicit stateful/CORS origins.
- Apply policies to resource access and role/permission middleware to operations. Scope customer and rider queries in the backend before fetching records.
- Use Form Requests for validation and explicit service methods for state transitions. Reject invalid transitions and stale versions rather than silently overwriting.
- Use transaction boundaries for reservation allocation, order placement, payment reconciliation, and delivery status updates. Use database uniqueness/exclusion constraints as a final integrity guard.
- Broadcast only private authorized events. Customers subscribe only to their order/delivery; assigned riders and permitted managers receive narrower channels. Do not include payment secrets or unnecessary personal data.



## Completion updates

- GET /api/v1/health returns database readiness without connection details (503 when unavailable). /up remains Laravel liveness.
- GET /api/v1/me returns the authenticated account. PATCH /api/v1/me changes name and optionally password; current password is required for a new password. Role and email changes are not accepted. Other sessions/tokens are revoked after a password change.
- Actual auth paths are /register, /login, /logout, /forgot-password and /reset-password under /api/v1. CSRF bootstrap is /sanctum/csrf-cookie outside that prefix. Actual catalog paths are /menu/categories and /menu/items, with permission-protected mutations on those paths. Actual service paths include /service/tables, /service/tables/{table}/sessions and /service/dining-sessions/{session}/close. Consult routes/api.php instead of the historical /auth, /staff and /restaurants proposals.
- Error responses now include a stable code with message and optional validation errors. Existing success envelopes and decimal PHP monetary fields remain compatible with the SPA; provider requests use integer centavos.
- POST /orders, POST /reservations and POST /reservations/{id}/reschedule accept optional Idempotency-Key headers: 8-128 letters, digits, dots, colons, underscores or hyphens. Identical successful submissions replay for 24 hours, scoped to user and method/path, with Idempotency-Replayed: true. Changed details using the same key return 409; validation failures do not consume keys. A new intended submission needs a new key.
- Reservations include a stored turnover buffer. PostgreSQL excludes overlapping active intervals even for direct writes; service locking remains enabled. New booking instants are stored in UTC and policy responses include the restaurant timezone.
- Seating opens a linked session. Rescheduling retains the customer owner. Completing a seated booking/closing its session requires settled bills.
- Optional private floor-plan invalidations are emitted after commit, contain only floor_id and authorize active authenticated users. Render Free retains polling. Delivery channels retain existing owner/assigned-rider/staff restrictions.

