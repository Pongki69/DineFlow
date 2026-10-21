# DineFlow Operations and Release Guide

## Local setup

1. Install PHP 8.3 with `pdo_pgsql`, `pdo_sqlite`, `openssl`, `curl`, `mbstring`, `fileinfo`, and `zip`, plus Composer 2.10, Node.js, npm, and PostgreSQL 17 or a compatible PostgreSQL release.
2. Copy the root `.env.example` to `backend/.env`. Set `APP_KEY` with `php artisan key:generate`, and configure the local PostgreSQL database and credentials. Keep real credentials out of source control.
3. From `backend/`, install Composer dependencies and run `php artisan migrate --seed`. From `frontend/`, run `npm ci`.
4. Start PostgreSQL, then run Laravel with `php artisan serve` and the frontend with `npm run dev` in separate terminals. Run `php artisan reverb:start` for broadcasting and `php artisan schedule:work` for scheduled maintenance and reservation reminders.
5. Create the first administrator interactively with `php artisan dineflow:admin:create`. The command does not use a committed default password.

## Environment and external services

Use the root `.env.example` as the environment-variable inventory. Configure at minimum `APP_KEY`, `APP_URL`, `FRONTEND_URL`, `SANCTUM_STATEFUL_DOMAINS`, secure session cookie settings, PostgreSQL `DB_*`, and production `MAIL_*` values. Enable `APP_DEBUG=false` in production. Use HTTPS for the frontend, API, payment return URLs, and webhook endpoint.

PayMongo requires a server-only `PAYMONGO_SECRET_KEY` and matching `PAYMONGO_WEBHOOK_SECRET`. Register `/api/v1/webhooks/paymongo` on the provider and enable the payment and refund event types documented in the backend README. Use sandbox credentials until the merchant and provider configuration are approved. Never place payment secrets in `VITE_*` variables.

Map address search and routing default to Geoapify Free: set `MAP_PROVIDER=geoapify` and the server-side `GEOAPIFY_API_KEY`. Include the provider attribution and monitor free quotas; see [PORTFOLIO_SETUP.md](PORTFOLIO_SETUP.md). The optional Mapbox provider uses `MAP_PROVIDER=mapbox` and `MAPBOX_SERVER_TOKEN`. Configure restaurant coordinates and delivery policy in the administrator workspace.

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
