# Render Free + Neon

## Render form

- Repository: Pongki69/DineFlow; branch: main.
- Language: Docker. Root Directory: leave empty. Dockerfile Path: ./Dockerfile.
- Docker Command: leave empty (uses the image startup script).
- Instance: Free. Pick a region near the Neon database, currently Ohio/US East if available.
- Health Check Path (Advanced): /up.

## Required private environment variables

| Key | Value |
| --- | --- |
| APP_KEY | Stable output of `php artisan key:generate --show` (starts with `base64:`). Do not use Render's generic Generate button for this value. |
| DB_URL | Full direct/non-pooled Neon PostgreSQL connection string, including `sslmode=require` (disable connection pooling in Neon Connect). The application reads DB_URL, not DATABASE_URL. |
| MAP_PROVIDER | geoapify |
| GEOAPIFY_API_KEY | Your Geoapify key |
| INITIAL_ADMIN_EMAIL | A private administrator login email |
| INITIAL_ADMIN_PASSWORD | A private password, 12+ characters with mixed case, a number and a symbol |
| INITIAL_ADMIN_NAME | Optional; defaults to Portfolio Administrator |

Do not paste the local .env wholesale into Render. The image defaults to production mode, debug disabled, secure database sessions, synchronous queues, log broadcasting, and log mail. The startup script derives APP_URL, FRONTEND_URL, and SANCTUM_STATEFUL_DOMAINS from Render's assigned URL. SESSION_DOMAIN should be absent, allowing a host-only cookie. No frontend build keys or localhost URLs are needed.

## Startup and first login

The image builds React and installs locked production PHP dependencies. Apache serves built assets and Laravel from one origin. Startup applies migrations, seeds roles, creates only missing baseline settings, and optionally creates the first administrator. It preserves existing administrators, passwords and restaurant settings on restart. It never promotes an existing user with the bootstrap email.

After a successful deployment, open /up, register a customer, and log into the administrator account using your private bootstrap credentials. Add menu categories/items, restaurant location, floors/tables and business hours through the administrator screens. Remove INITIAL_ADMIN_PASSWORD after the administrator exists; it is not a password-reset setting. Keep APP_KEY stable across redeploys.

## Free-instance boundaries

The scheduler runs while this container is awake. Render can suspend it when idle, so reminder/expiry jobs may run late; this is a portfolio demo, not an always-on restaurant service. Reverb is not started; the UI polls for delivery and floor availability updates. Images uploaded to local storage disappear on restart; use committed demo assets or arrange persistent storage before relying on uploads. Migrations never reset or delete the database.

Delivery GPS acknowledgement does not wait for route-provider requests. In this sync demo profile, the scheduler refreshes eligible delivery ETAs once per minute. Operational deployments should use `QUEUE_CONNECTION=database` with a continuously monitored worker for prompt, coalesced ETA updates. The image includes GD to normalize delivery proof photos and strip metadata server-side; those private proofs remain in the database. This does not make local menu-image storage persistent.

Mail stays in logs until configured. For Brevo SMTP, use port 2525 on Render Free (465 and 587 are blocked). Leave PayMongo keys blank for cash-only demos, or supply test keys and a test webhook at /api/v1/webhooks/paymongo. Do not use live payment keys for this public demo.

Docker is not installed on the development machine, so a full container build must be verified by Render's first build. Application tests, the production frontend build, and shell syntax can be checked locally.

Before releasing workflow-completion changes, read docs/OPERATIONS.md under Applying the new reservation migrations. The new overlap constraint requires clean historical allocations and btree_gist. Local checks cover application code and PostgreSQL integrity; the new CI Docker job still needs execution on GitHub.
