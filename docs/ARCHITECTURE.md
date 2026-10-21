# DineFlow Architecture Proposal

## Current-state inspection

The workspace began empty during Chunk 0 inspection. Chunks 1–3 have since added the Laravel/React foundation, PostgreSQL-backed menu/order/reservation schema, Sanctum/RBAC, customer and staff flows, and the Three.js floor map. PHP 8.3, Composer dependencies, Node.js 24/npm 11, frontend dependencies, and a user-local PostgreSQL 17 cluster are installed and used for local verification. The workspace is not initialized as a Git repository.

Consequently this document defines a proposed foundation, not a description of a previously existing application. Chunk 1 has since added initial auth/access source and tests; it is not yet installed or executed.

## Proposed monorepo layout

```text
backend/                  Laravel API, authentication, business services
  app/Http/Controllers/Api/V1/
  app/Http/Requests/Api/V1/
  app/Models/
  app/Policies/
  app/Services/
  database/migrations/
  routes/api.php
  tests/Feature/Api/V1/
frontend/                 React + Vite customer/staff applications
  src/app/                 routing, providers, API client, auth state
  src/features/            account, menu, booking, ordering, delivery, CMS
  src/components/          shared design system and accessible primitives
  src/maps/                geographic maps and indoor 3D floor plan
  src/tests/
docs/                     architecture, API, operations, integration notes
```

## Proposed dependency list

Pin mutually compatible versions when scaffolding; do not use unbounded `latest` ranges in the committed manifests.

| Layer | Dependencies / tools | Use |
|---|---|---|
| Backend runtime | PHP version supported by the selected Laravel release, Composer, Laravel, `laravel/sanctum` | API, first-party SPA authentication, queues, scheduling, notifications. |
| Backend database | PostgreSQL server and PHP `pdo_pgsql` extension | Transactions, constraints, JSON support, optional PostGIS if zone/routing requirements justify it. |
| Backend realtime | Laravel Reverb or a supported broadcaster, Laravel Echo client | Private authorized updates for operations and delivery tracking. |
| Backend quality | Laravel Pint; Pest or PHPUnit; static analysis tool selected by team | Formatting, feature/unit testing, type and static checks. |
| Frontend runtime | Node.js LTS supported by Vite, npm | Reproducible frontend install and development server. |
| Frontend app | React, React DOM, Vite, React Router | SPA, route groups, development and production bundling. |
| Frontend UI | Tailwind CSS, accessible component primitives, Lucide React (optional) | Consistent responsive styling and icons. |
| Frontend data | TanStack Query or equivalent, a schema/form validation library | API caching/mutations and validated form state. |
| Indoor visualization | Three.js, `@react-three/fiber`, `@react-three/drei` | API-driven indoor restaurant floor plan. |
| Geographic mapping | Google Maps JS SDK or Mapbox GL JS; alternatively Leaflet plus approved tile/geocoder/router providers | Address selection, restaurant marker, directions, routes, ETA. Select one provider set before implementation. |
| Frontend quality | ESLint, Prettier, Vitest, React Testing Library, Playwright (critical workflows) | Static checks, component tests, and browser acceptance tests. |
| External services | PayMongo or Xendit; SMTP/transactional email; object storage; optional WebSocket infrastructure | Payments, recovery/notifications, media, live events. Keep secrets server-side. |

### Backend responsibilities

- Controllers remain thin: authorize, validate through Form Requests, call a service, and return API Resources.
- Services own multi-step business rules: booking allocation, order pricing, payment reconciliation, dispatch, delivery lifecycle, and audit events.
- Eloquent models express relationships and ordinary scopes. PostgreSQL constraints provide the final guard for invariants that must survive concurrent requests.
- Policies and role/permission middleware enforce access on every protected API route. Frontend navigation is only a usability aid and is never the security boundary.
- Queue jobs handle mail, webhook follow-up, and non-blocking integration work. Broadcast events expose only the minimum data allowed to the intended private channel.

### Frontend responsibilities

- React/Vite is a single SPA with route groups for public/customer pages and authenticated staff workspaces. Feature folders keep screens, API hooks, and view-specific state together.
- A shared API client handles JSON, CSRF/session bootstrap, validation errors, and expired authentication. Do not store long-lived credentials in local storage for a first-party Sanctum SPA.
- Tailwind CSS and shared accessible components provide consistent styling. Each core feature must include loading, empty, error, and permission-denied states.
- Geographic outdoor maps and the indoor 3D seating scene are separate features and data models. 3D is progressively enhanced; reservation selection must also have an accessible 2D/list fallback.
- Prices, authorization, availability, delivery coverage, and payment status are always derived or verified by the API.

## Proposed database model and relationships

All business records should be scoped by `restaurant_id` where applicable, even if the first deployment serves one restaurant. Use PostgreSQL `bigint` or UUID primary keys consistently; decide before creating the first migration. Store money as integer minor units plus ISO currency code rather than floating-point values. Persist timestamps in UTC and render them in the restaurant timezone.

| Area | Main tables | Relationships / important constraints |
|---|---|---|
| Identity and access | `users`, `roles`, `permissions`, `role_user`, `permission_role`, `staff_profiles`, `rider_profiles` | Public signup assigns only Customer. Deactivated users cannot authenticate. Rider profile references one user. Role grants are server-managed and audited. |
| Restaurant | `restaurants`, `restaurant_settings`, `business_hours`, `audit_logs` | Restaurant owns configuration and business records. Coordinates use validated latitude/longitude or PostGIS geography if the chosen spatial workflows justify it. |
| Catalog | `menu_categories`, `menu_items`, `menu_item_variants`, `modifier_groups`, `modifiers`, `promotions` | Items belong to a restaurant/category. Snapshot item name, option selections, and unit price onto order lines at checkout. Availability is server-owned. |
| Indoor floor plan | `floors`, `zones`, `dining_tables`, `floor_plan_objects` | Every table has stable identifier, capacity, active flag, and editable geometry/position metadata. Visual objects reference their floor and optional table. |
| Reservations and service | `reservations`, `reservation_tables`, `dining_sessions` | Reservation belongs to customer and restaurant; table assignment is explicit. Dining session begins only when seated. Preserve lifecycle history and ownership. |
| Orders and payments | `orders`, `order_items`, `order_item_modifiers`, `payments`, `payment_events` | Order links to customer and optionally reservation, session, table, and delivery address. Gateway events are idempotent by provider event ID. Payment records are append-only in critical fields. |
| Delivery | `customer_addresses`, `delivery_zones`, `delivery_fee_rules`, `delivery_assignments`, `delivery_status_history`, `delivery_location_updates` | Assignment links an order, rider, and lifecycle. Customer queries are ownership-scoped; rider queries are assignment-scoped. Keep location history short-lived under an explicit retention policy. |
| Communications | Laravel `notifications`, queued jobs, broadcast events | Delivery tracking uses authenticated private channels scoped to the customer/order and assigned rider. Never broadcast full address/contact details to a general channel. |

### Reservation concurrency

Represent a booking interval using a PostgreSQL range, including configured dining duration and turnaround buffer. Add a GiST exclusion constraint preventing overlap for a table among blocking reservation statuses; enable `btree_gist` if equality on the table key requires it. Create or update assignments inside a transaction, lock candidate table rows, and return a conflict response if a competing request wins. The frontend's availability result is advisory only.

### Order and payment integrity

Re-read menu items, variants, modifiers, discounts, taxes, and delivery fees in the backend transaction. Persist a price/name snapshot on order lines. Never accept a client-supplied total as authoritative. Verify gateway signatures server-side, make webhook processing idempotent, and reconcile asynchronous payment states before marking an order paid.

## Business service boundaries

- `ReservationAvailabilityService` and `ReservationBookingService`
- `OrderPricingService` and `OrderPlacementService`
- `PaymentGateway` interface with PayMongo/Xendit adapters and webhook verification
- `DeliveryCoverageService`, `DeliveryQuoteService`, and `DeliveryDispatchService`
- `RiderLocationService` for consent/session validation, rate limits, stale-state handling, and retention
- `FloorPlanService` for table/floor configuration and safe layout updates
- `AuditLogService` for sensitive administrator and payment actions

## Integration requirements

- Payments: PayMongo Hosted Checkout v2 is the configured gateway; card, GCash, and QR Ph availability depends on merchant eligibility. Keep secret keys and endpoint webhook secrets server-side; verify signed events and use provider idempotency.
- Maps: choose Google Maps Platform or Mapbox for address search, routing, and ETAs, or select a supported Leaflet tile/geocoding/routing combination. Configure restricted keys, quotas, attribution, and billing. Never claim an estimated arrival is guaranteed.
- Realtime: Laravel broadcasting with private authenticated channels. Do not emit rider location outside an active authorized assignment. Stop capture/broadcast at delivery completion/cancellation and delete or age out stored coordinates according to retention policy.
- Notifications: configure an SMTP or transactional mail provider for password reset, booking, and order messages. Add SMS/push providers only when selected.
- Media: local storage in development; use private/public object storage policies intentionally for production menu media.

## Development, test, and production environments

- Local: separate frontend and Laravel processes; PostgreSQL local service; `.env` files excluded from Git; seeded non-sensitive development-only data; mail sink and fake payment adapters.
- Automated checks: Laravel unit/feature tests for authorization, isolation, concurrency, price calculation, webhook idempotency, and lifecycle transitions; React component/API tests for role views, form states, accessibility, and errors; end-to-end checks for reservation/order/delivery critical paths.
- Production: HTTPS, restricted CORS and Sanctum stateful domains, secure cookies, secrets manager, queued jobs, scheduler, database backups, structured logs, error monitoring, rate limits, storage lifecycle, and documented restore procedure.
- Do not enable real payment collection or location broadcast until credentials, webhook URLs, private channel authorization, retention rules, and operational monitoring are configured.
