# Implementation status

The existing feature modules already covered most of the roadmap. This implementation completes missing workflow behavior and adds verification while preserving Geoapify, PayMongo, Render Docker, Neon PostgreSQL and Sanctum. No additional service account or paid API is needed for these code changes.

## Feature mapping

| Area | Existing behavior retained | Completion work |
|---|---|---|
| Accounts and access | Registration, recovery, roles, admin provisioning and permissions | Real account form; current-password verification, session/token revocation; structured API errors |
| Catalog and ordering | Categories, images/options, availability, server pricing, snapshots, dine-in/pickup/delivery | Retry-safe order submission and browser acceptance coverage |
| Floor plan and reservations | Draft/publish editor, 2D/3D views, capacity, booking rules, rescheduling and calendar | PostgreSQL overlap guard, concurrency harness, UTC conversion, stored buffers, floor invalidations, preserved selections and safe 3D teardown/fallback |
| Dining service | Occupancy and sessions | Reservation-linked seating; owner preservation on staff reschedule; unpaid and pending-checkout closure guards |
| Delivery | Geoapify search/routes, address book, quotes, dispatch, rider consent/GPS and tracking | Correct delivery-history table; ownership/rider/lifecycle regression coverage |
| Payments | Test hosted checkout, cash, deposits, receipts, allocations and signed webhooks | Correct live/test flag handling; bad signature, stale signature, wrong amount/currency/mode and repeated event tests |
| Operations and notifications | Permission-scoped dashboards, reports/CSV, CMS, private notifications and reminders | Role/navigation acceptance coverage and authenticated floor refresh support |
| Release tooling | Render startup, Neon configuration and deployment bootstrap | Readiness endpoint, isolated browser fixtures, lint/format conventions, CI and real local PostgreSQL recovery rehearsal |

## Verification

- Backend: 42 tests, 169 assertions.
- Frontend unit: five tests covering access/navigation, retry keys/errors and restaurant timezone conversion.
- Playwright: six cases across desktop and mobile Chromium; account/pickup ordering, reservation creation with 3D/2D switching, kitchen navigation restrictions. Includes automated WCAG checks on sign-in and account screens plus browser error capture. This is selected acceptance coverage, not a claim of full-site WCAG certification or native iOS testing.
- PostgreSQL 17: eight simultaneous booking workers produce one reservation; a direct overlapping write is rejected; a custom-format backup restores with matching fixture counts into a recreated disposable database.
- Frontend lint, tooling format check and production build run locally. New PHP modules are formatted with Pint; the existing payment service retains a narrow webhook fix.
- GitHub Actions performs these checks and a Docker build after push. Docker is not installed locally, so the new container/remote CI run is pending.

## Release and external configuration still required

1. Back up Neon and review active historical bookings before applying new migrations. btree_gist permission and valid non-overlapping intervals are required. Existing reservations have unknown historical buffers and get zero; existing naive timestamps may need a deliberate timezone correction. No historical booking is silently shifted or deleted.
2. Push and review the change, run GitHub CI, deploy on Render and smoke-test /up and /api/v1/health plus real hosted sessions. Confirm the latest GitHub checks and Render deploy before treating the hosted site as updated. The two additive migrations were applied locally after saving a backup in ignored .local/backups; hosted Neon was not changed.
3. Optional online-payment demos need PayMongo test credentials and a registered test webhook; real sandbox transactions were not performed here. Cash demos continue without those credentials.
4. Public recovery email needs verified SMTP. No provider account is created by the code change.
5. Render Free can sleep. Scheduler jobs and polling resume when awake; dedicated always-on workers/Reverb remain optional. Rider GPS depends on browser consent and an active page.
6. Local uploaded images are ephemeral on Render. Use committed demo assets or arrange durable storage before depending on uploads; no alternate storage API was introduced.
7. Set and verify hosted backup retention, monitoring, recovery objectives and manual staff acceptance. The successful recovery rehearsal used only local scratch data, not the live Neon database.

Read OPERATIONS.md for commands and migration notes; deploy/README.md documents the direct Neon connection and Render environment.
