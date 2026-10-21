# DineFlow architecture

This describes the implemented application. Earlier proposals for alternate providers, multi-restaurant tenancy, additional frontend frameworks, and renamed endpoints are superseded by the existing workflow.

## Stack and layout

| Location | Responsibility |
|---|---|
| backend/app/Http/Controllers/Api/V1 | Laravel 13 HTTP endpoints, authorization and validated input |
| backend/app/Services | Catalog pricing, reservations, dispatch, payments, reports, notifications and auditing |
| backend/app/Models and database/migrations | Eloquent relationships and PostgreSQL constraints |
| backend/routes/api.php, channels.php, console.php | HTTP routes, private broadcast authorization and scheduled maintenance |
| frontend/src/App.jsx | React 19 SPA routes and permission-driven workspace navigation |
| frontend/src/api.js | Sanctum session/CSRF requests, structured errors and submission retry keys |
| frontend/src/*Operations.jsx and Reservations.jsx | Customer and staff feature screens |
| frontend/src/FloorScene.jsx | Optional Three.js seating view; booking defaults to accessible 2D |
| .github/workflows/checks.yml | Backend, PostgreSQL, frontend, browser and Docker checks |
| deploy/ and Dockerfile | Render deployment serving Vite assets and Laravel from one origin |

PHP 8.3, Composer, Node 24/npm and PostgreSQL 17 are the established development tools. Composer and npm lockfiles define dependencies. The frontend uses CSS, React Router, Leaflet, Echo, Vitest, Playwright, axe, ESLint and Prettier. Authored CSS uses the existing Tailwind preflight; TanStack Query, PostGIS and a separate API gateway are not required.

## Providers and deployment

- Geoapify provides server-side address search and driving routes. Leaflet displays geographic maps with existing attribution. Keys remain in Laravel configuration.
- PayMongo hosted checkout and verified webhooks provide online payments in test mode for the portfolio; cash works without merchant credentials.
- Render runs the Docker web service, including frontend and backend. Neon hosts PostgreSQL through its direct connection string. Neon Data API and Neon Auth are not used.
- Sanctum uses database sessions and first-party CSRF cookies. Password recovery needs SMTP; in-app notifications work without it.
- Render Free uses log broadcasting and polling. Optional Reverb/Echo supports private delivery and floor invalidations when configured. No new hosted WebSocket subscription is required.

## Data flow and integrity

1. The SPA signs in through Sanctum, receives permitted navigation and calls /api/v1. Permission middleware and ownership checks remain authoritative on the server.
2. Menu selections are repriced from stored catalog data. Order lines snapshot names, options, prices and destination/fee details. Current API money fields remain decimal PHP values; provider requests use calculated integer centavos.
3. Availability is advisory. Reservation creation rechecks hours, capacity, publishing, occupancy and overlaps under table locks. PostgreSQL also excludes overlapping active intervals, including each booking's stored turnover buffer. New bookings are stored in UTC after validating restaurant-local hours.
4. Seating opens a linked dining session and marks the table occupied. Rescheduling preserves customer ownership. Closing a session or completing a seated reservation requires settled bills before the table moves to cleaning.
5. Payment redirects only return the visitor to the app. Signed, timestamp-checked events establish payment after matching amount, currency and mode. Provider event IDs prevent duplicate capture; pending checkouts and allocations prevent overcollection.
6. Dispatch assigns a rider; rider-only transitions and consented GPS update delivery records and history. Customer tracking is scoped to the owning order. Floor invalidations contain only a floor identifier, with no guest information.
7. Operations and reports aggregate stored records according to permissions. Audit records and database notifications preserve business actions.

Order creation, reservation creation and rescheduling accept user- and route-scoped Idempotency-Key headers. Successful responses replay for 24 hours; changed payloads using the same key return 409. The SPA retains a key across ambiguous network failures within the current page session.

This is a single-restaurant application. Existing schema and response envelopes are retained. See API_PLAN.md for current routes and IMPLEMENTATION_STATUS.md for verification and release limitations.
