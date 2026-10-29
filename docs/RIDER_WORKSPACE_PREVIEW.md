# Local rider workspace preview

The local preview can include historical sample feedback, active sample deliveries, and an expiring map position. Generated reviews are explicitly labeled as demo feedback in the API and UI.

## Sample records

Run from `backend`, replacing `ID` with an existing active rider's user ID:

```sh
php artisan demo:rider-workspace --rider=ID --reviews=25 --deliveries=15 --latitude=14.186648 --longitude=121.231433
```

Each review has its own completed delivery. These options create 25 historical reviewed deliveries plus 15 active deliveries. Existing assignments and reviews remain in place, so overall delivery totals can be higher. Repeating the command preserves previously created preview records and their progress.

Orders use the `DEMO-WORKSPACE-{riderId}-` prefix and a matching rider-specific marker. Review comments, recipients, and pickup/destination labels identify generated data. The synthetic customer account is inactive and has a random password. The command does not create payments, send notifications, enable location sharing, or change restaurant settings. Without a configured restaurant, sample pickups are labeled as demo locations near the supplied point.

Remove the selected rider's disposable records with:

```sh
php artisan demo:rider-workspace --rider=ID --remove
```

Cleanup requires the exact marker, prefix, synthetic customer, and rider ownership. It skips records with payments, allocations, delivery proofs, or changed ownership. Creation and cleanup reject production environments.

## Temporary location

Configure these values in the ignored `frontend/.env.local` file:

| Variable | Required value |
| --- | --- |
| `VITE_RIDER_PREVIEW_USER_ID` | The active rider's numeric user ID |
| `VITE_RIDER_PREVIEW_LATITUDE` | Latitude between -90 and 90 |
| `VITE_RIDER_PREVIEW_LONGITUDE` | Longitude between -180 and 180 |
| `VITE_RIDER_PREVIEW_EXPIRES_AT` | A future ISO 8601 timestamp, normally within 24 hours |

The application shows a temporary-location banner only for that authenticated rider. The map initially displays the exact configured point without starting native GPS or changing online status. Explicitly enabling location sharing uses the sample coordinates while the preview remains active. Other users and production builds retain normal GPS behavior.

Expiry, logout/account changes, and unsubscribe stop the sample watcher. Expiry clears the map preview and does not automatically start native GPS. To end the preview earlier, remove these four environment variables and refresh/restart Vite. Enabling normal location sharing afterwards requests the browser's real location; going offline retains the existing behavior of clearing reported coordinates.

The map preview is temporary. Sample delivery/review records remain until the cleanup command is run.

## Verification

Tests cover count and relationship integrity, idempotency, production guards, collisions and rollback, cleanup boundaries, review labeling/privacy, rider identity isolation, coordinate validation, expiry, watcher cleanup, and unchanged native GPS behavior.
