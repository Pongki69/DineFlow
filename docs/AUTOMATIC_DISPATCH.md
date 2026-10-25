# Automatic delivery dispatch

Implemented locally. This uses the existing Laravel, PostgreSQL/Neon, Geoapify
(or the explicitly configured map provider), Sanctum and Reverb workflow.
No Redis, H3 service, MQTT broker or new paid API is needed.

## Operating the flow

1. The customer places a delivery order. Verify its full payment through the
   existing payment workflow. Unpaid cash orders wait until staff records cash;
   automatic dispatch does not treat an unverified cash promise as payment.
2. In Orders, staff confirms the order or the kitchen starts preparation. Set
   kitchen prep minutes and the required vehicle class. The default is 15 minutes
   and motorcycle; a large/catering order should explicitly require a car.
3. Riders save their vehicle as `bicycle`, `motorcycle`, or `car`, then press
   **Go online** in My deliveries and allow GPS. Location is sent at most every
   15 seconds while the page is open. Going offline clears dispatch coordinates;
   a per-device presence lease prevents a delayed heartbeat from undoing offline.
   A reload requires going offline/online to resume that device's GPS feed.
4. Dispatch calculates road ETA to pickup and waits until prep-ready time minus
   that ETA and a one-minute buffer. Payment and rider eligibility are checked
   again when reserving and accepting an offer.
5. A rider receives a private WebSocket event and a database notification, with
   a five-second polling fallback. The offer has a server-enforced 25-second
   window. Acceptance creates one accepted assignment and enables pickup
   navigation. Decline/expiry releases the reservation and advances the search.
6. Search expands through 3, 5, and 8 km, capped by restaurant coverage, after
   three attempts or 60 seconds at a radius. A rider who declined or timed out is
   skipped for that search round. At the last limit, staff sees **exhausted** and
   receives a notification; they can assign manually or explicitly restart a new
   search round. Customer prices remain fixed. There is no unaccounted rider
   incentive or automatic post-checkout fee increase.
7. Pickup still requires the kitchen's ready status. Delivery completion belongs
   to the delivery workflow, not the generic order-complete button. A customer can
   rate a completed delivery once; only their own delivered order is eligible.

## Candidate selection and score

Customers open **Track order & rider** from My orders or the order confirmation.
The tracker displays kitchen preparation and rider progress separately, with a
combined timeline. It refreshes on private delivery events and every five seconds.
Restaurant and destination markers remain visible before rider GPS is available.
After acceptance, fresh online rider presence can appear on that customer's map,
including the journey to the restaurant. Stale locations are labelled; unaccepted
and terminal deliveries do not expose live rider coordinates. Kitchen readiness
always comes from staff confirmation, never from the preparation countdown.

The expanded delivery map is 480px tall on desktop and 360px on mobile. Recorded
restaurant-arrival, pickup and delivered times appear above it and on the relevant
map pins. Missing historical timestamps are labelled rather than inferred.
After pickup, online presence saves GPS samples only to that rider's active
deliveries; overlapping GPS feeds are deduplicated within five seconds. The
existing route calculation refreshes ETA at most every 30 seconds. Estimates
older than 90 seconds are hidden even if GPS remains fresh.

The green trail connects the most recent 1,000 accurate GPS samples for the
delivery, leaving gaps longer than two minutes open. Completed orders retain
their recorded trail without exposing the rider's later live location. If no
continuous trail exists, opening the map requests a suggested road route through
the established map provider. It is cached for 30 minutes and drawn as a dashed,
explicitly labelled suggestion, never as proof of the actual journey. Customers
can request routes and history only for their own orders. No new migration or
third-party service is required.

Online rider coordinates are indexed by precision-4 Geohash. The radius bounding
box covers adjacent cells before exact great-circle filtering; stale GPS (over
90 seconds), accuracy over 500 metres, inactive accounts, missing rider
permissions, incompatible vehicles, and existing reservations are excluded.

The nearest five eligible candidates get bounded, cached road lookups through
the established map provider. Routes cache for 60 seconds by rounded coordinates.
A routing failure does not produce an invented ETA or an offer. Provider quota
limits still apply. Defaults and weights live in `backend/config/dispatch.php`.

Higher scores win:

`S = -0.6 × min(ETA / 30, 1) + 0.2 × rating / 5 + 0.2 × acceptance - 0.3 × min(batch detour / 5, 1)`

Shorter ETA therefore improves the score. Customer ratings come only from verified
completed deliveries (neutral 3/5 prior when unrated). Acceptance is accepted
offers divided by accepted + declined + expired offers; cancelled/withdrawn
offers do not penalize a rider. New riders use a neutral full acceptance prior.
Ranking inputs are stored with each offer for inspection. Ties use rider ID.

## Concurrency guarantees

A single SQL mutex row is acquired inside each dispatch, assignment, acceptance,
and delivery-state transaction before delivery/rider/order locks. It coordinates
all application replicas, not just one process. Unique nullable columns reserve
one active offer per delivery and one active offer per rider. Reservation release
and outcome changes commit together. Offer-specific IDs prevent an old response
from acting on a later offer, and repeat acceptance is idempotent.

Remote routing happens outside locks. The final transaction rechecks GPS
freshness, rider movement, availability, payment, batch membership and capacity.
Manual assignment withdraws conflicting automatic offers atomically. Notifications
and broadcasts run after commit. The mutex deliberately favours correctness for
this single-restaurant portfolio app; large multi-restaurant fleets would need
partitioned locking and a larger spatial/routing infrastructure.

## Conservative batching

At most two orders can share a rider, and the existing assignment must still be
accepted or at the restaurant. Orders already picked up/in transit are treated
as unbatchable in this implementation.

Both pickups must be within 1 km; drop-off bearing difference must be at most
30 degrees; food ready times must be within five minutes; road-route detour must
be at most five minutes; and combined capacity must fit the vehicle. Capacity
units are small=1, standard=2, catering=4; bicycle capacity=2, motorcycle=4, car=8.
These are explicit operational classes, not measured kilograms or volume.

Both pickups must be recorded before either delivery starts transit. Drop-offs
follow the stored sequence. A rider stays unavailable until both deliveries are
terminal. Customer ETA/route and GPS sharing include the earlier batch stop.
Manual reassignment of an active batch is blocked: cancel/resolve the batch
before assigning a different rider.

## Run and deploy

After applying code to the intended environment:

```sh
cd backend
php artisan migrate
php artisan schedule:work
```

`DISPATCH_ENABLED=false` disables creating new offers (expiration still runs).
`php artisan deliveries:dispatch` performs one tick for diagnostics. The scheduler
runs it every five seconds without overlapping; no dedicated queue worker is
required. Reverb is optional because polling remains available. The existing
Docker startup already runs `schedule:work` and applies migrations.

Render's sleeping free web instance cannot guarantee dispatch timers while it is
asleep or stopped. A continuously running instance/process is necessary for
reliable live dispatch; it is not supplied by Neon. This change has not migrated
the hosted database or deployed anything.

## Validation

- Feature tests: payment/prep gates, ETA scheduling, filters, expiry/decline,
  manual override, fallback, batching limits, GPS consent/lease, ratings and
  existing delivery lifecycle.
- `backend/tests/Concurrency/dispatch-race.php`: real PostgreSQL checks with six
  simultaneous offer workers, six simultaneous acceptance workers, and SQL
  unique-reservation enforcement. It resets only a dedicated localhost database
  named `dineflow_dispatch_test*`, using a separate non-5432 port. It never uses
  `DB_URL` or production connection settings.
- Frontend unit tests and desktop/mobile browser checks exercise consent,
  countdown, acceptance, navigation and accessibility. Browser offer transport is
  mocked; live Reverb delivery and production map quotas are not certified by
  those checks.

Reference: [Laravel pessimistic locks](https://laravel.com/framework/docs/13.x/queries#pessimistic-locking)
and [sub-minute scheduling](https://laravel.com/framework/docs/scheduling#sub-minute-scheduled-tasks).
