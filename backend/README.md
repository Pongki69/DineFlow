# DineFlow API

Laravel 13 REST API for authentication/RBAC, menu catalog, order processing, reservations, floor plans, delivery, PayMongo Hosted Checkout, and database-backed in-app notifications. Local setup uses PHP 8.3 with OpenSSL, cURL, PostgreSQL, and SQLite extensions, Composer 2.10, Laravel Sanctum 4, and Pest 4. Composer dependencies are locked in `composer.lock`.

## Local setup

The development machine's PHP binary and configuration are local-only. Set `PATH` to include the installed PHP 8.3 directory and `PHPRC` to `backend\php.ini`. Composer is available as `backend\.tools\composer.phar`.

The project includes a user-local PostgreSQL 17 cluster in `.local/pg17/pgsql` and `.local/pgdata17`; it is not a Windows service. From the project root, start it after a reboot with:

```powershell
.local\pg17\pgsql\bin\pg_ctl.exe -D .local\pgdata17 -l .local\postgres17.log -o "-p 5432 -h 127.0.0.1" start
```

The ignored `backend/.env` is configured for the local `dineflow` database. Apply schema and baseline operational settings with `php artisan migrate --seed`. To repeat dependency installation, run `php .tools\composer.phar install` from this directory. Sanctum's token migration is included; the `User` model uses `HasApiTokens` and the Laravel 13 API middleware is configured.

Run `php artisan test` from this directory to execute the Laravel feature tests. The in-memory test configuration uses SQLite PDO. See [../docs/OPERATIONS.md](../docs/OPERATIONS.md) for deployment, backup, and restore procedures.

For browser login, serve frontend and API on the same site and configure `FRONTEND_URL`, `SANCTUM_STATEFUL_DOMAINS`, `SESSION_DOMAIN`, and HTTPS cookie settings for deployment. Create the first production Administrator by running `php artisan dineflow:admin:create` in an interactive deployment shell; the command prompts for name, email, and a strong password, refuses a second initial administrator, and records the provisioning event. `AuthSeeder` creates system roles and permission grants, but does not create an Administrator.

Never expose `.env`, use debug mode, or allow wildcard CORS in production.

## Payments

Development uses PayMongo test mode. Set `PAYMONGO_SECRET_KEY` and `PAYMONGO_WEBHOOK_SECRET` in the ignored `backend/.env`; leave the values blank until merchant sandbox credentials are available. Configure the webhook at `https://your-domain/api/v1/webhooks/paymongo` for `checkout_session.payment.paid`, `payment.failed`, and refund events. The webhook signing secret must match the provider's test/live endpoint mode. Keep both credentials server-side; do not put them in React environment variables.

The app uses hosted checkout and trusts only a verified signed webhook for online payment status. Return URLs are informational. Payment requests are PHP-denominated and expire after 30 minutes; run Laravel's scheduler locally with `php artisan schedule:work` and every minute in production to expire stale checkouts and release unpaid reservation deposits. Configure production `sk_live_` credentials and the live webhook signing secret only after merchant activation. PayMongo test mode does not perform refunds; refund requests are restricted to authorized staff and require a live transaction. Never store card numbers, CVVs, or GCash credentials.

## Current boundaries

Menu management supports categories, prices, promotions, item availability, variants, add-ons, and image uploads. Customer order creation supports dine-in (active table QR/session), pickup, and delivery-address capture; the backend validates current catalog state and calculates totals in a transaction. Order items retain historical snapshots. Reservation requests validate hours, booking windows, table capacity, duration, and buffers. PostgreSQL table-row locks serialize attempts for a table; the backend rechecks availability before inserting. Floor-plan edits are saved as drafts, publish separately, and do not delete reservations or active sessions. React provides a Three.js map, accessible 2D fallback, and staff/admin workflows; availability and occupancy refresh on a short polling interval. Payments support PayMongo-hosted checkout, cash collection, signed webhook reconciliation, dine-in bill allocation, reservation deposits, receipts, and authorized full refunds. In-app notifications cover order/reservation updates, verified payment results, rider assignments, delivery progress, and hourly upcoming-reservation reminders. Delivery tracking uses browser GPS and can pause while the rider dashboard is backgrounded. Production still requires provider credentials, deployment checks, and an executed recovery exercise.
