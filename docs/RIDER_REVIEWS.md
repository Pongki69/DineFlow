# Rider details and reviews

Delivery-history order numbers link to a private order-details page. It displays
the saved items/add-ons, price breakdown, recipient/drop-off details, timeline,
notes and delivery photo where one exists. The API authorizes the currently
assigned rider; another rider or customer cannot use that endpoint.

Customers open **View rider profile** from their delivery tracker. The profile
shows the rider's name, vehicle type, join month, completed-delivery count,
average overall rating, star distribution and paginated reviews. It excludes
phone, email, plate, GPS and delivery/customer identifiers. Signed-in customers,
the rider and staff with delivery-management permission can view it.

A customer can review only their own delivered order with an assigned rider.
The review includes 1–5 stars, an optional comment (1,000 characters maximum),
and up to four optional feedback tags: on-time delivery, communication, careful
handling and friendly service. One review is stored per delivery. The existing
SQL dispatch lock and database unique constraint prevent duplicate submissions.
The author can edit their review and name visibility later without creating
another rating. The rider cannot edit customer reviews.

**Show my name** defaults to off. Both customer-visible profiles and rider review
lists receive the server-masked first name (for example `Al*****o`). Revealing a
name is explicit. The API does not send an unmasked author name alongside a masked
one, nor customer IDs/emails/order references. This is display masking; a rider
may already know a recipient from the delivery itself. Comments are rendered as
plain text. Existing ratings remain valid, masked and without optional fields.

The rider dashboard's rating value links to **Ratings & reviews**, which is also
in the sidebar. Overall rating averages continue to feed dispatch ranking.
The offers page uses a compact status/empty state, with GPS consent details
available through an expandable help section.

Apply `2026_10_23_130000_expand_rider_reviews.php` before using the updated code.
The local database has been migrated. No hosted migration, deployment, API-provider
change or GitHub push was performed.
