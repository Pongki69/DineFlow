# DineFlow

DineFlow is planned as a restaurant platform with a React customer/staff interface, a Laravel REST API, and PostgreSQL as the system of record.

## Current implementation

Chunks 0–8 provide the restaurant platform foundation, authentication and permissions, menu and ordering, reservation scheduling and interactive 3D floor plan, delivery addresses and maps, rider dispatch and private customer tracking, PayMongo hosted payments, permission-scoped operational dashboards and reports, and in-app operational notifications and security hardening. Production rollout still requires configured merchant/map/mail credentials and deployment verification. The local PostgreSQL cluster is not registered as a Windows service, so start it again after a reboot using the command below.

The architecture, schema, API plan, setup variables, release/backup guidance, and roadmap are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/API_PLAN.md](docs/API_PLAN.md), [docs/OPERATIONS.md](docs/OPERATIONS.md), [docs/DEVELOPMENT_CHECKLIST.md](docs/DEVELOPMENT_CHECKLIST.md), and [.env.example](.env.example). Laravel implementation notes are in [backend/README.md](backend/README.md).

## Local development

The layout is `backend/` for Laravel and `frontend/` for React/Vite. Local-only PHP settings, Composer, PostgreSQL binaries/data, and database credentials are kept in ignored files. Start PostgreSQL from the project root with:

For the free portfolio map integration, set `MAP_PROVIDER=geoapify` and `GEOAPIFY_API_KEY` in `backend/.env`. The key is read only by Laravel. The customer map uses OpenStreetMap tiles and includes attribution. Configure restaurant coordinates and weekly hours in **Delivery settings** before accepting delivery orders. Mapbox remains available with `MAP_PROVIDER=mapbox` and `MAPBOX_SERVER_TOKEN`. See [docs/PORTFOLIO_SETUP.md](docs/PORTFOLIO_SETUP.md) for free-service setup and hosting boundaries.

```powershell
.local\pg17\pgsql\bin\pg_ctl.exe -D .local\pgdata17 -l .local\postgres17.log -o "-p 5432 -h 127.0.0.1" start
```

For Laravel commands, add the installed PHP directory to `PATH` and set `PHPRC` to `backend\php.ini`. Start Laravel from `backend/` with `php artisan serve`; start Vite from `frontend/` with `npm run dev`. Start the private broadcast server in another backend terminal with `php artisan reverb:start`. For local payment timeout processing, run `php artisan schedule:work` from `backend/`; production must run the scheduler every minute. Delivery location history is purged after `DELIVERY_LOCATION_RETENTION_DAYS` (7 days by default); status history is retained. Configure `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET`, and `FRONTEND_URL` in `backend/.env` for sandbox checkout. Register `https://your-domain/api/v1/webhooks/paymongo` in PayMongo and subscribe to `checkout_session.payment.paid`, `payment.failed`, and refund events. Browser GPS sharing requires the rider dashboard to remain open and the device to grant location permission. Browsers may pause tracking when locked or backgrounded and stop it when closed; reliable background tracking requires a dedicated mobile app or a platform-supported background-location service. Do not commit `.env` credentials or production customer data.



