# Rider dispatch: current behavior and next step

The automatic flow has since been implemented locally. See [Automatic dispatch](AUTOMATIC_DISPATCH.md) for its current behavior, limits, setup and tests. The text below records the earlier design plan.

The address-picker update does not change dispatch behavior.

Today an admin or manager selects an active, available rider for each delivery.
The assigned rider accepts or declines. Acceptance needs no further admin
approval. A declined delivery returns to the pending-assignment list. The kitchen
must mark the order ready before the rider can record pickup. Administrators
create rider staff accounts; there is no public rider application/approval flow.

## Recommended next implementation

Use automatic delivery offers with manual dispatch as a fallback:

1. Keep rider account activation separate from individual deliveries.
2. When an order is eligible for dispatch, offer it to an active, available rider
   with no other active assignment. Initially use a fair waiting-order rule;
   only use distance ranking when fresh rider location data is available.
3. Reserve the rider and delivery transactionally while the offer is pending so
   two deliveries cannot reserve the same rider.
4. Let the rider accept or decline. Acceptance starts the existing delivery
   lifecycle without an admin approval step.
5. Give offers a configurable expiry; on decline or expiry, release the
   reservation and try another eligible rider. Avoid repeatedly offering the same
   delivery to a rider who just declined it.
6. If nobody is available, show an honest waiting status to the customer and
   flag the delivery for the dispatch manager. Do not promise a rider ETA yet.
7. Keep manual assignment/reassignment, notifications, audit history, and clear
   safeguards for cancellation, rider unavailability, pickup and payment state.

This requires a reliable scheduler/worker for offer expiration and retries in
the hosting environment. Decide how those processes run on the hosting plan
before enabling automatic offers. It does not require changing the map provider.

DoorDash describes matching offers to available Dashers and allowing drivers to
accept or decline. Uber Eats documents delivery requests that couriers tap to
accept. These are references for the offer model, not a claim that DineFlow has
their matching algorithms:

- [DoorDash offer matching](https://help.doordash.com/en-us/dashers/article/how-do-i-get-matched-with-offers)
- [DoorDash accepting offers](https://help.doordash.com/dashers/s/article/How-to-Accept-an-Order)
- [Uber Eats delivery requests](https://help.uber.com/driving-and-delivering/article/receiving-a-delivery-request?nodeId=6f280659-2876-4d2f-b641-1b7e38e45887)
