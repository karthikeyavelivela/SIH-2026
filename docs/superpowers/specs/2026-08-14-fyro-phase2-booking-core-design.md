# FYRO Phase 2 — Booking Core Design

Date: 2026-08-14
Status: Approved (user directed continuous execution across all phases; spec written directly from the master build prompt's detailed Phase 2 section rather than an interactive brainstorm — assumptions documented inline per the master prompt's own instruction to do so rather than stop).

Sub-project 2 of 5. Builds on Phase 1 (merged to `master`, commit `38f8875`): full auth, RBAC, admin user/manager management, all 10 models, design system, marketing/auth/admin UI.

## Goals (from the master prompt's Phase 2 section)

- `/customer/book` full flow (truck + hamali + combo), writes `Booking` docs.
- `FareRule` CRUD (Admin `/fares` UI) + fare engine v1: fixed rate card, no surge yet, `fareBreakdown` computed server-side only.
- Matching logic as a geo query (candidate list ranked by distance), exposed via simple request/poll endpoints — no sockets yet (Phase 3).
- Driver/Hamali/Mutha-leader `/requests` pages: pending offers via polling, accept/reject writing `Booking` status changes.
- `/customer/history`, basic `/*/earnings` for driver/hamali/mutha off completed Bookings.

## Non-goals (deferred)

- Sockets, live location streaming, in-app chat — Phase 3.
- Sequential single-candidate timed offers with auto-advance — Phase 3 (per master prompt, this is explicitly a Phase 3 mechanic; Phase 2's matching is query+poll only).
- Payments, ratings, complaints, incentives — Phase 4.
- Surge pricing, regions UI — Phase 5.
- `/mutha/members` (add/remove UI) — members already join via the invite-code signup flow built in Phase 1; a dedicated management UI is a nice-to-have, not required by the Phase 2 bullet list ("Driver/Hamali/Mutha-leader /requests pages"), deferred to avoid scope creep on an already-large phase.
- Route polylines / turn-by-turn — only straight-line distance and static pickup/drop pins.

## Assumptions (locked, flag if wrong)

1. **Matching model for Phase 2**: not the strict single-candidate sequential-timeout flow (that's explicitly Phase 3's mechanic, requiring sockets for the timer/auto-advance). Phase 2 uses **broadcast-and-first-to-claim**: the server ranks nearby available candidates by distance and exposes the booking to all of them via polling; whichever candidate accepts first atomically claims it (optimistic concurrency: `findOneAndUpdate` gated on `status: 'searching'`); everyone else's next poll simply no longer shows it. This satisfies "matching logic as a query, exposed via simple poll endpoints" without building throwaway timer infrastructure Phase 3 replaces anyway.
2. **Rejection tracking**: a booking a candidate explicitly rejects must not reappear in their own poll results (but should stay visible to others). Adds `Booking.rejectedByUserIds: ObjectId[]` (new field, not in the original Phase 1 model list — needed for this to work at all).
3. **Distance**: straight-line (Haversine) between pickup and drop coordinates, not routed distance. No routing-engine integration in scope for any phase per the master prompt.
4. **Geocoding proxy**: the client needs address autocomplete, but Nominatim's usage policy (User-Agent, rate limits) is already handled server-side (Phase 1's `geocode.service.ts`, unwired until now). Expose it via a new public, rate-limited `GET /api/geocode?q=` route rather than calling Nominatim directly from the browser.
5. **Fare engine v1**: `total = max(minimumFare, baseFare + perKmRate * distanceKm) * surgeMultiplier` per matched `FareRule` (region + category), summed across truck + hamali components for combo bookings. `surgeMultiplier` is always `1.0` in Phase 2 (Phase 5 computes it live) but the field is still read from the `FareRule` document so Phase 5 only has to change what writes that field, not the read path.
6. **Vehicle category bucketing**: `FareRule.category` is `vehicle_small | vehicle_medium | vehicle_large | hamali`. Bucketing a requested `capacityKg` into small/medium/large uses fixed thresholds matching the Phase 1 driver-signup vehicle types (mini_truck→small, medium_truck→medium, large_truck→large) — the same three-tier split already established, not a new taxonomy.
7. **Availability toggle**: driver/hamali "online/offline" (already a field on `Vehicle`/`HamaliProfile`: `availabilityStatus`) is set via a new endpoint that also updates `currentLocation` from a one-time browser geolocation read (not continuous streaming — that's Phase 3). Going online with no location permission is rejected with a clear error rather than silently defaulting to `[0,0]`.
8. **Mutha leader accept flow**: leader's `/requests` poll shows bookings needing `requiredHamaliCount` workers; on accept, the leader's own action claims the booking for the Mutha (`assignedMuthaId`) but does NOT yet assign specific members — that's a separate "assign members" action against the now-`matched` booking, listing the leader's currently-online members. Mutha member's own `/job` page then shows their assignment once the leader picks them.
9. **Earnings v1**: sum of each role's fare-component share across their own `completed` bookings in the current calendar month + all-time total. No payout/transfer mechanics (Phase 4's Razorpay work) — this is a read-only ledger view of what's owed.

## Architecture additions

**Server** (`server/src/`):
- `models/Booking.ts` — add `rejectedByUserIds: ObjectId[]` (default `[]`).
- `services/fare.service.ts` — `computeFareBreakdown()`, `bucketVehicleCategory()`, pure functions, unit-testable without DB.
- `services/distance.service.ts` — `haversineKm(a, b)`.
- `services/matching.service.ts` — `findCandidateVehicles()`, `findCandidateHamaliSolos()`, `findCandidateMuthas()` — 2dsphere `$near` queries with capacity/availability filters, ranked by distance.
- `controllers/fareRule.controller.ts` + `routes/fareRule.routes.ts` — admin-only CRUD, mounted at `/api/admin/fare-rules`.
- `controllers/booking.controller.ts` + `routes/booking.routes.ts` — customer-facing: create, list (history), get one, cancel. Mounted at `/api/bookings`.
- `controllers/requests.controller.ts` + `routes/requests.routes.ts` — role-facing polling endpoints (list pending, accept, reject) shared logic parameterized by role (driver/hamali_solo/mutha_leader), mounted at `/api/requests`.
- `controllers/muthaAssignment.controller.ts` (small, folded into requests routes) — leader's "assign members" action.
- `controllers/earnings.controller.ts` + `routes/earnings.routes.ts` — read-only aggregation per role, mounted at `/api/earnings`.
- `controllers/geocode.controller.ts` + route — public proxy to the existing `geocode.service.ts`, rate-limited.
- `controllers/availability.controller.ts` (small) — online/offline + one-time location set, folded into requests or a new `driver.routes.ts`/shared availability route usable by driver/hamali/mutha-leader.

**Client** (`client/src/`):
- `lib/leaflet.ts` or inline dynamic imports — `next/dynamic(() => import('react-leaflet'), { ssr: false })` wrapper components (`MapView`, reusable) since Leaflet needs `window`.
- `app/customer/book/page.tsx` (2-step: cargo/truck needs → hamali needs, combine, map preview, submit).
- `app/customer/history/page.tsx`.
- `app/customer/track/[bookingId]/page.tsx` (status stepper + static map, polls every 5s).
- `app/driver/dashboard/page.tsx`, `app/driver/requests/page.tsx`, `app/driver/active-job/[bookingId]/page.tsx`, `app/driver/earnings/page.tsx`.
- `app/hamali/*` — same structure, hamali_solo role.
- `app/mutha/dashboard/page.tsx`, `app/mutha/requests/page.tsx`, `app/mutha/active-jobs/page.tsx`, `app/mutha/earnings/page.tsx`.
- `app/mutha-member/job/page.tsx`, `app/mutha-member/earnings/page.tsx`.
- `app/admin/fares/page.tsx` — region × category rate card editor.
- New shared components: `StatusStepper`, `RequestCard`, `EarningsSummary`, `MapView`.
- RBAC client-side gates for each new role-scoped route group, mirroring the pattern already established in `app/admin/layout.tsx`.

## Security requirements carried forward (non-negotiable, same as Phase 1)

- Every "my data" query filters by `req.user.id` from the verified JWT — never a client-supplied id. This applies especially to accept/reject (must verify the accepting user is actually an eligible candidate, not just any authenticated driver) and to earnings (never another user's ledger).
- Fare math happens server-side only; the client never sends and the server never trusts a client-supplied fare.
- Accept is an atomic, race-safe claim (`findOneAndUpdate` with a status guard), not a read-then-write — two drivers hitting accept simultaneously must not both win.
- Rate limiting on the public geocode proxy (reuses `authLimiter`'s pattern, own bucket).

## Testing plan

- `fare.service.test.ts`, `distance.service.test.ts` — pure unit tests, no DB.
- `matching.service.test.ts` — integration tests against in-memory Mongo, seeding Vehicles/HamaliProfiles at known coordinates, asserting ranking/filtering.
- `booking.test.ts`, `requests.test.ts`, `earnings.test.ts`, `fareRule.test.ts` — supertest integration tests per the Phase 1 pattern, including the race-condition/double-accept test and the IDOR checks (can't view/accept another driver's candidate list results as if they were yours, can't fetch another customer's booking).
- Client: `tsc --noEmit` + `next build` listing all new routes, same as every Phase 1 task.

## Report format at end of phase

Same as Phase 1: routes list, test results, what's stubbed (sockets, sequential timed offers, payments, ratings, surge, `/mutha/members` UI), assumptions confirmed correct via testing.
