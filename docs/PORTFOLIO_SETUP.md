# Free portfolio setup

DineFlow can demonstrate ordering, reservations, dispatch, maps, reporting, and in-app notifications using free plans. Quotas and hosting limits still apply. No real payment collection is needed for a portfolio.

## Address search and routing

1. Sign up at https://myprojects.geoapify.com/ and choose the Free plan.
2. Create a project named DineFlow and copy its API key.
3. In the ignored `backend/.env`, set `MAP_PROVIDER=geoapify`, `GEOAPIFY_API_KEY=<your key>`, and `MAPS_COUNTRY=ph`.
4. Clear Laravel's configuration cache and restart the API. Set restaurant coordinates, coverage, fees, and delivery hours through Delivery settings.
5. Test address search and a delivery quote. If the daily quota is exhausted, the app reports the error and does not invent a road distance or fee.

Geoapify's Free plan currently includes 3,000 credits/day, up to 5 requests/second, and requires Geoapify/data-source attribution. Credits are not necessarily the same as requests. The map views retain OpenStreetMap attribution and credit Geoapify for search/routing. API keys stay on the server. Geoapify permits storing results; this avoids Mapbox's temporary-geocoding storage restriction.

Sources: https://www.geoapify.com/pricing/ and https://www.geoapify.com/

## Payments and email

Use only PayMongo `sk_test_` credentials and a matching test webhook secret for hosted test checkout. This still requires a PayMongo account and any eligibility checks. The current code has no account-free payment simulator. If credentials are left blank, online checkout remains unavailable; authorized staff can still demonstrate cash recording. Clearly label the hosted site as a portfolio demo before opening it to visitors.

Keep `MAIL_MAILER=log` locally. For public password recovery, configure a verified SMTP sender on a free email plan such as Brevo. In-app notifications do not need email credentials.

## Hosting choices to prepare separately

A candidate free deployment is a Render web service (Docker for Laravel and built React assets) plus a Neon Free PostgreSQL project. Serve the frontend and API from one origin to simplify Sanctum session cookies. This repository is not yet packaged or configured for that deployment.

Render Free can sleep when idle, and its local filesystem is ephemeral. Use database sessions, avoid relying on uploaded files stored on the web instance, and choose persistent media storage or bundled demo images. Scheduled maintenance and a separate Reverb process need a hosting plan; the existing delivery UI also polls for updates, so it can demonstrate tracking without a persistent WebSocket server. Do not claim scheduled jobs are running until a scheduler has actually been provisioned.

Use provider subdomains to avoid purchasing a custom domain. Review current free quotas and availability during deployment. Do not enter live payment keys for the public demo. Free hosting is not guaranteed to remain available indefinitely.

Sources: https://render.com/docs/free and https://neon.com/pricing
