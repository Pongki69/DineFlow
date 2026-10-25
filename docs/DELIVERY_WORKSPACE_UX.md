# Delivery workspace improvements

The rider workspace now keeps one selected delivery beside the route map. The same controls remain available in fullscreen. Use **Route order** to preview stop changes and **Apply route order** to save them for the rider's account. The dashboard uses this saved order, with outstanding pickups ahead of drop-offs and paired-delivery sequences preserved. Completed or reassigned deliveries are excluded when choosing the next task.

Delivery and dispatch actions lock only the affected order while a request is running. Errors appear beside that order, and failed refreshes retain the last loaded records. Manual refresh keeps current assignments visible.

Dispatch starts with **Needs attention**, followed by **Awaiting rider**, **Pickup**, **On the road**, and **Finished**. Search and pagination run on the server across matching records, with complete queue counts. The board no longer depends on a 200-record snapshot. Reassignment requests a reason; cancellation still requires its reason. Technical search details are expandable.

GPS availability, map-only location and customer tracking share one device watcher while keeping separate explicit sharing scopes. A paused availability feed has a direct **Reconnect GPS** control. When online GPS already updates customer tracking, the selected delivery shows that status instead of a duplicate start button. Going offline does not silently enable another sharing scope. Route estimates state when traffic or live-origin data is unavailable; detailed assumptions are expandable.

## Audit repairs

- **Mark delivery unsuccessful** explains the terminal consequence and requires a reason. General restaurant contact is separate. Managers can review and restore an eligible delivery only after confirming custody with its original rider. Backend conflict checks and activity history remain authoritative.
- Route editors lock during saving; version checks prevent a newer draft from being marked saved by an older response.
- Requests have a bounded timeout, including response-body reads. Mutation timeouts explain that the outcome is uncertain and trigger a status refresh, without automatically repeating the mutation.
- Shared polling deduplicates requests, cancels obsolete resources, pauses hidden-tab polling, preserves loaded data on same-resource errors, and reloads on visibility recovery.
- Rider and dispatcher screens are separate modules, with compatibility exports for existing routes. Component variables own selected-order typography, avoiding competing weight overrides.
- The desktop route workspace fits available viewport height and scrolls delivery details independently. Narrow screens keep readable stacked content; delivery selectors scroll within their toolbar.
- Proof normalization, shorter telemetry locks, batched proof-existence queries, and background ETA work are described in `OPERATIONS.md`.

## Validation

- Saved order, ownership checks, paired sequences, pickup priority and completion fallback have backend coverage.
- Selected-stop switching, action locks, dispatch queues, direct GPS reconnect and route application have frontend coverage.
- Desktop, mobile, fullscreen and fullscreen problem-report dialogs were reviewed visually with sample data.
- No live GPS permission was requested during visual review; no real delivery was updated through the preview.
- Real-world rider usability sessions and a formal assistive-technology audit remain separate validation work.

For UI-only follow-ups, use visual checks rather than repeating the system test suite.

## Verification for the audit repair release

Focused frontend checks cover network timeout/cancellation, polling resource changes, shared GPS sessions, rider/dispatch actions, confirmation cancellation and validation, and route editing. Focused backend checks cover recovery, pagination, proof normalization, lifecycle and tracking. Lint, formatting checks and the production frontend build were run. Desktop and narrow-screen layouts plus failure/recovery dialogs were inspected with temporary sample data; the preview is not shipped.

No real delivery records were modified through this verification. The full application/browser suite and the new PostgreSQL dispatch race cases were not rerun. Real phone GPS, locked-screen behavior, hosted workers/scheduler, backup restoration, formal assistive-technology review, and a business-approved proof-retention period remain release validation or policy decisions. See `OPERATIONS.md`; local checks do not certify production readiness.
