# Rider workspace and account settings

Riders have six sidebar destinations:

- **Dashboard** (`/rider`): active delivery count, completions today, lifetime
  completions, verified customer-rating average, next assignment and shortcuts.
- **My deliveries** (`/rider/deliveries`): active assignments and their existing
  pickup, navigation, GPS, delivery-photo and completion actions.
- **Delivery offers** (`/rider/offers`): timed accept/decline offers.
- **Delivery history** (`/rider/history`): completed, failed and cancelled trips,
  filtered by outcome and paginated in groups of 20.
- **Ratings & reviews** (`/rider/reviews`): verified customer feedback, comments,
  categories, masked/revealed reviewer names and rating distribution.
- **Settings** (`/settings`): rider vehicle/contact details, workspace preferences,
  profile and password changes.

One persistent availability component owns online/offline state and its GPS
watcher. Switching workspace pages does not restart the watcher or lose the
device presence lease. Offers remain accessible from the shared availability bar;
accepting one refreshes the dashboard and active list. Reloading the browser still
requires explicitly reconnecting GPS through Go offline/Go online, as before.
Going online is always explicit; saving preferences never enables GPS.

All seven roles have **Settings**. Common preferences are start page, compact
layout, reduced motion and the notification-bell unread badge. Preferences are
stored on the signed-in account, returned by authentication APIs and applied by
the app shell. Hiding the badge does not delete or mute stored notifications.
The start-page validator permits only pages available to the account; frontend
navigation rechecks permissions so a revoked role cannot restore access through
an old preference.

Customers also manage saved delivery addresses. Riders edit phone, vehicle type
and plate. Restaurant-management controls link to existing pages only when the
API grants their corresponding permissions. Kitchen, service, cashier and other
staff retain their own queues and can choose an appropriate start page and density.
Profile/security controls reuse the existing name and password workflow, including
current-password verification and session revocation after a password change.

Dashboard counts, ratings, active assignments and history are scoped to the rider
on the server. They do not expose other riders' deliveries or invent earnings.
Daily completion totals use the configured restaurant timezone. GPS consent,
proof-photo requirements and dispatch locking remain in effect.

Apply `2026_10_23_120000_add_user_workspace_preferences.php` before using the new
settings endpoint. The local database has been migrated; the hosted database is
unchanged. The existing Docker startup runs migrations on a future deployment.
No new API provider, dependency, deployment or GitHub push is required.
