# DineFlow Operations and Release Guide

## Local setup

1. Install PHP 8.3 with `pdo_pgsql`, `pdo_sqlite`, `openssl`, `curl`, `mbstring`, `fileinfo`, `zip`, and `gd` (JPEG/PNG/WebP support), plus Composer 2.10, Node.js, npm, and PostgreSQL 17 or a compatible PostgreSQL release.
2. Copy the root `.env.example` to `backend/.env`. Set `APP_KEY` with `php artisan key:generate`, and configure the local PostgreSQL database and credentials. Keep real credentials out of source control.
3. From `backend/`, install Composer dependencies and run `php artisan migrate --seed`. From `frontend/`, run `npm ci`.
4. Start PostgreSQL, then run Laravel with `php artisan serve` and the frontend with `npm run dev` in separate terminals. Run `php artisan reverb:start` for broadcasting and `php artisan schedule:work` for scheduled maintenance and reservation reminders.
5. Create the first administrator interactively with `php artisan dineflow:admin:create`. The command does not use a committed default password.

## Environment and external services

Use the root `.env.example` as the environment-variable inventory. Configure at minimum `APP_KEY`, `APP_URL`, `FRONTEND_URL`, `SANCTUM_STATEFUL_DOMAINS`, secure session cookie settings, PostgreSQL `DB_*`, and production `MAIL_*` values. Enable `APP_DEBUG=false` in production. Use HTTPS for the frontend, API, payment return URLs, and webhook endpoint.

PayMongo requires a server-only `PAYMONGO_SECRET_KEY` and matching `PAYMONGO_WEBHOOK_SECRET`. Register `/api/v1/webhooks/paymongo` on the provider and enable the payment and refund event types documented in the backend README. Use sandbox credentials until the merchant and provider configuration are approved. Never place payment secrets in `VITE_*` variables.

Map address search and routing default to Geoapify Free: set `MAP_PROVIDER=geoapify` and the server-side `GEOAPIFY_API_KEY`. Include the provider attribution and monitor free quotas; see [PORTFOLIO_SETUP.md](PORTFOLIO_SETUP.md). Keep the established Geoapify workflow; no alternate provider setup is required. Configure restaurant coordinates and delivery policy in the administrator workspace.

For live broadcasts, configure `BROADCAST_CONNECTION=reverb` and the `REVERB_*` values. Set `REVERB_ALLOWED_ORIGINS` to the deployed frontend origins. Notifications are persisted in Laravel's database notification table and shown in the authenticated workspace. Mail is used for password recovery when a real mail transport is configured; other notification channels can be added when selected and configured.

## Production deployment

1. Provision PostgreSQL with encrypted storage, private network access, automated backups, and a least-privilege application account. Run Laravel migrations from a release job before directing traffic to new code.
2. Install backend dependencies without development packages, build the frontend with `npm ci` and `npm run build`, and serve the generated `frontend/dist` assets over HTTPS. Point the API web root at Laravel's `public/` directory.
3. Configure PHP-FPM/web server limits, trusted proxy handling, secure cookies, narrow CORS origins, Sanctum stateful domains, secrets management, private storage, log collection, and error monitoring. Do not expose `.env`, SQL dumps, rider coordinates, or private storage objects.
4. Run the Laravel queue worker continuously if using a non-sync queue. Run the scheduler once per minute; it expires pending payments, purges expired rider location history and read notifications (`NOTIFICATION_RETENTION_DAYS`, 180 by default), and sends upcoming reservation reminders. Monitor worker failures, schedule execution, webhook delivery, database capacity, and backup completion.
5. Verify provider sandbox/live webhook signatures and payment reconciliation before enabling collection. Require HTTPS and maintain the separate database backup encryption key outside the backup location.

## PostgreSQL backup and recovery

Create a compressed custom-format backup using a protected `PGPASSWORD`/password-file or interactive prompt; never place a database password directly in shell history:

```powershell
pg_dump --format=custom --no-owner --file="dineflow-$(Get-Date -Format yyyyMMdd-HHmmss).dump" --host=$env:DB_HOST --port=$env:DB_PORT --username=$env:DB_USERNAME $env:DB_DATABASE
```

Store backups encrypted, restrict access, and retain copies in a separate failure domain according to the restaurant's retention policy. Back up uploaded menu media and required application configuration separately; do not include plaintext secrets in the backup archive. Test recovery periodically in an isolated PostgreSQL database:

```powershell
createdb --host=$env:DB_HOST --port=$env:DB_PORT --username=$env:DB_USERNAME dineflow_restore_check
pg_restore --clean --if-exists --no-owner --dbname=dineflow_restore_check --host=$env:DB_HOST --port=$env:DB_PORT --username=$env:DB_USERNAME .\dineflow-backup.dump
```

Validate record counts and application health in the restore environment before treating the backup as recoverable. Document a production-specific recovery point objective, recovery time objective, escalation contact, and restore decision process before launch.

## Verification and maintenance

Run `php artisan test` from `backend/`; run `npm test` and `npm run build` from `frontend/`. The application's test database is configured separately from production. Review migration status with `php artisan migrate:status`, check `/up`, inspect application and queue logs, and monitor disk/storage growth. Keep dependencies patched and rerun tests and the frontend build after updates.

The web rider dashboard can share GPS only while the page is open and has location permission. Browsers may pause or stop location reporting in the background; reliable locked-screen/background tracking needs a dedicated mobile application or platform-supported background-location capability.

## Delivery recovery and route operations

An unsuccessful delivery is terminal for the rider. A manager can use **Resume with original rider** only after contacting that rider, confirming the food remains in the same rider's custody, and recording a reason. The service restores the last recorded stage rather than creating a second order or changing the rider. It refuses completed/cancelled orders, inactive or unauthorized riders, conflicting active work, mismatched active batches and live offers. Original failure and recovery events remain in the audit/history. If custody changed or the food is no longer deliverable, do not use recovery: resolve the order with the restaurant using its existing cancellation/refund policy.

Dispatch queue/search/pagination now run on the server. Counts cover all records; search applies within the selected queue, with up to 50 results per page. Historical records no longer crowd active work out of a fixed latest-200 collection.

GPS requests persist and acknowledge coordinates without calling a route provider. With `QUEUE_CONNECTION=database`, keep the existing queue worker continuously available; coalesced ETA jobs use the latest fresh GPS and skip completed/reassigned deliveries. With the portfolio `sync` setting, the scheduler runs `deliveries:refresh-etas` once per minute instead. This is a fallback, not live traffic or guaranteed background phone tracking. ETA calculation freshness still expires in the customer API. Monitor worker/scheduler failures and provider limits; missing estimates must remain visible as unavailable rather than invented.

Proof photos are decoded and re-encoded on the server as JPEG, resized to 1600 pixels on the longest side, and stripped of embedded metadata before storage. GD is required; uploads fail explicitly if processing is unavailable. Decode is limited to 16 megapixels and stored images to 1 MB. Image work occurs outside the delivery row lock. Access remains private; no image bytes are added to assignment listings. The business must choose and document a proof-retention period before production launch; this update does not silently purge existing evidence.

Production acceptance remains a separate release gate: exercise restore from backup in an isolated database, monitor the deployed worker/scheduler, review TLS/secrets/access, and field-test supported rider phones (including screen lock, permissions, offline transitions and camera uploads). A successful local test suite does not establish these properties. The documented Render Free profile is a portfolio configuration; use persistent media storage and an always-on scheduler/worker for operational service.

## Verification added with workflow completion

From backend, run `php artisan test`. From frontend, run `npm run lint`, `npm run format:check`, `npm test`, `npm run build`, then `npx playwright install chromium` once and `npm run test:e2e`. Browser tests start isolated API/frontend servers on 8091/5191 and reset only .local/acceptance.sqlite. AcceptanceSeeder refuses to run outside APP_ENV=testing. Its fixture credentials must never be used for the public site.

From backend, `php tests/Postgres/run.php` runs eight concurrent booking attempts, checks the exclusion constraint and verifies pg_dump/pg_restore record counts. It refuses non-loopback PostgreSQL hosts and creates/drops only a randomly named dineflow_test_* database. Supply PG_TEST_ADMIN_PASSWORD (and optionally PG_TEST_ADMIN_USER) for a local PostgreSQL administrator. DINEFLOW_PG_BIN selects PostgreSQL 17 client binaries. This is a local recovery rehearsal, not a backup of Neon.

On this Windows setup, set PHPRC to the full backend/php.ini path and add the installed PHP directory to PATH before running artisan tests so subprocesses use the same extensions. CI runs equivalent checks on Ubuntu 24.04 and also builds Docker; remote CI and Docker execution still need a push because Docker is unavailable locally. The PostgreSQL client setup follows https://www.postgresql.org/download/linux/ubuntu/ .

## Applying the new reservation migrations

Back up the database and inspect active reservations before a release. The migration installs PostgreSQL btree_gist and rejects overlapping active table allocations rather than deleting records. If conflicting historical records exist, resolve them through the restaurant workflow before retrying the migration. The database role needs permission to create this trusted extension, or the database owner must install it first.

Existing reservations receive buffer_minutes=0 because their historical buffer is unknown; new reservations snapshot the configured buffer. New bookings now store UTC instants. Existing data created with a non-UTC restaurant timezone may contain naive local timestamps: review and deliberately correct those records before treating them as UTC. No automatic historical shift is applied, because the original timezone cannot be inferred safely.

The migration links newly seated reservations to dining sessions. Existing open sessions remain valid without a reservation link. Close-session checks reject unsettled order balances and pending checkouts.

Use /api/v1/health for database readiness and /up for Laravel liveness. Log broadcasting plus polling remains the Render Free default; optional Reverb must be provisioned separately if needed. Floor broadcasts contain only floor_id and are emitted after commit. Private authorization is /api/v1/broadcasting/auth.
