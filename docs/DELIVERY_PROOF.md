# Delivery photos

Riders must upload a photo at drop-off before marking a delivery delivered.
In My deliveries, select or take a JPG, PNG or WebP photo, review the preview,
then select **Upload delivery photo**. Only a successful upload unlocks
**Mark delivered**. Failed uploads can be retried without losing the preview.

The browser resizes the image to at most 1600 pixels on its longest side and
re-encodes it as JPEG, removing original EXIF metadata. The API independently
validates image content, format, dimensions and a 1 MB limit. It accepts uploads
only from the assigned rider while the delivery is in transit. Photos can be
replaced before completion and are immutable afterward.

The photo requirement is enforced inside the existing SQL delivery lock, including
direct service/API calls. A previous rider's proof cannot satisfy the requirement.
Completion and upload share the dispatch lock to prevent replacement races.

Photos are stored as base64 in a separate private `delivery_proofs` database table,
not on Render's temporary filesystem. This uses the existing PostgreSQL/Neon setup
and needs no extra API or storage credentials. Photos consume database capacity
(base64 adds roughly one third); this bounded approach suits the portfolio demo.
A larger deployment should use private object storage with a retention policy.

The owner can open the photo from the delivered-order tracker. Assigned riders
and staff with delivery-management permission can retrieve it through the private
API. Responses prohibit caching; photo bytes are never embedded in assignment
lists, tracking responses, notifications or broadcasts. Unrelated users cannot
retrieve photos. Existing completed deliveries remain valid without retroactive
photo uploads.

Apply the migration before running the updated code:

```sh
cd backend
php artisan migrate
```

The existing Docker startup applies migrations on deployment. No hosted changes
are made by implementing this feature locally.
