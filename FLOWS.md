# Flows & coverage

Two things live here: how a booking actually travels through the system for
each of the three service types, and an honest line-by-line map of the
SIH26089 problem statement against what is built.

Everything below was walked through against the running app, not read off the
code. Where something is not implemented, it says so.

---

## The three booking processes

All three share one spine — quote, create, dispatch, accept, work, settle —
and differ in who gets offered the job and how the fare is computed.

### Common spine

```
CUSTOMER                      SERVER                        WORKER
   |                            |                              |
   |-- POST /bookings/quote --->|  findActiveRule(region,       |
   |<---- fareBreakdown --------|  category) → base + per-km    |
   |                            |  + minimum, never client-side |
   |                            |                              |
   |-- POST /bookings --------->|  rating gate (see below)      |
   |                            |  → status: searching          |
   |                            |                              |
   |                            |-- sequential offer engine --->|
   |                            |   one worker at a time,       |
   |                            |   visible countdown           |
   |                            |<---- POST /requests/:id/accept|
   |<-- status: accepted -------|                              |
   |                            |                              |
   |    live tracking           |<---- /requests/:id/start -----|
   |    (map + chat)            |<---- proof photo -------------|
   |                            |<---- /requests/:id/complete --|
   |                            |                              |
   |                            |  platform commission 10%      |
   |                            |  + society bye-law cut        |
   |                            |  → ledger entries, both sides |
   |<-- rate the job ---------->|<---- rate the customer -------|
```

**The rating gate.** A completed job must be rated before either party starts
their next one. That keeps rating coverage honest rather than self-selected.
It is not a wall: `POST /api/ratings/:bookingId/defer` records a "rate later"
that releases the gate for 24 hours without marking the job rated, and
`/customer/ratings` lists everything still owed.

### 1 · Household service

*Electrician, plumber, carpenter, painter, gardener, cleaner, caregiver,
domestic help, technician.*

| Step | Screen | What happens |
|---|---|---|
| 1 | `/customer/dashboard` | The category list is the dashboard — 9 real service categories from `GET /api/service-categories` |
| 2 | `/customer/service/[slug]` | One screen per service: address, slot (now / later), the options drawer |
| 3 | — | Address is geocoded through `GET /api/geocode?q=` — a suggestion must be **selected**, because typing text alone gives no coordinates |
| 4 | — | `POST /bookings/quote` returns the live fare as soon as pickup and drop resolve |
| 5 | `Request service` | `POST /api/bookings` with `serviceCategorySlug`; the server derives dispatch type from the category |
| 6 | `/customer/track/[id]` | Status stepper, live map, in-app chat, payment section, tax invoice once paid |

Fare: the `hamali` rule — ₹100 base, ₹300 minimum. A single-worker household
job therefore prices at the floor.

### 2 · Hamali / loading crew

| Step | Screen | Difference from household |
|---|---|---|
| 1 | `/customer/book/labour` | Crew size stepper — fare is **per worker**, so 3 porters is 3 × the rate |
| 2 | — | Consignment scale (standard / bulk), engagement model (per person / full society team), material chips, duration |
| 3 | — | `requiredHamaliCount` is mandatory; the server rejects a hamali booking without it |
| 4 | — | The offer engine fills the crew one member at a time — the booking stays `searching` until every seat is accepted |

### 3 · Goods transport

| Step | Screen | Difference |
|---|---|---|
| 1 | `/customer/book/transport` | Vehicle class (small / medium / large), cargo weight, goods type, declared value, e-way bill |
| 2 | — | Fare uses the vehicle rule: base + per-km × distance, floored at the minimum |
| 3 | — | Optional multi-stop waypoints (capped at 5), scheduled pickup, or open-for-bidding |
| 4 | — | Matching filters on capacity **and** `complianceStatus` — a vehicle that failed inspection is never offered work |

### Published rates

| Category | Base | Per km | Minimum |
|---|---|---|---|
| Small vehicle (≤1T) | ₹150 | ₹18 | ₹250 |
| Medium vehicle (1–5T) | ₹250 | ₹25 | ₹400 |
| Large vehicle (5T+) | ₹400 | ₹35 | ₹600 |
| Hamali (per worker) | ₹100 | — | ₹300 |

A quote is always computed server-side against the active rule for that
region and category. The client never prices anything.

---

## Problem statement coverage

### Expected solution features

| # | Feature | Status | Where |
|---|---|---|---|
| 1 | Service provider registration and verification | **Built** | `/signup/{driver,hamali,fleet-owner,warehouse-hub}`, KYC document upload, admin KYC queue with approve/reject, `complianceStatus` enforced at three points |
| 2 | Worker skill profiling and certification | **Built** | `HamaliProfile` skills + capacity, training academy with sequential modules, auto-issued `Certification` on curriculum completion |
| 3 | Customer booking and scheduling system | **Built** | Three booking flows above, instant or scheduled (30 min – 14 days out) |
| 4 | Geo-location based service matching | **Built** | 2dsphere queries against `currentLocation` / `willingLocation`, sequential offer engine by distance |
| 5 | Digital payments and invoicing | **Partial** | Razorpay order/verify/webhook and COD are wired; tax invoice PDF issues only against a real successful payment. **Runs in mock mode** unless Razorpay keys are set — no live money has moved |
| 6 | Rating and feedback mechanism | **Built** | Two-way mandatory rating with the defer valve, distribution + comments on profiles |
| 7 | Worker welfare and insurance integration | **Built** | Plans per role, enrolment, claims, and **parametric** payouts that fire automatically when earnings fall below a threshold — with a kill switch and a daily cap |
| 8 | Emergency and on-demand service booking | **Partial** | On-demand ("Now") is the default path. There is **no distinct emergency/SOS tier** — no priority queue, no panic button |
| 9 | Cooperative federation administration dashboard | **Built** | Two tiers: state (district rollup) and district (affiliation approvals, bye-law ceilings), plus the society's own governance console |
| 10 | Multilingual mobile application | **Built (web)** | English / తెలుగు / हिंदी across every screen, cookie-persisted, drag-to-switch dial. It is a responsive web app, **not a native mobile binary** |
| 11 | AI-based demand forecasting and workforce allocation | **Built** | Agent C forecasts from real 14-day booking density; surfaces as earnings hints, surge recommendations, and society allocation hints |

### Technology components

| Component | Status | Notes |
|---|---|---|
| Mobile applications | **Partial** | Responsive web, mobile-first, installable — no React Native / native build |
| Artificial intelligence | **Built** | Six purpose-built agents, Claude API; falls back to labelled mock without a key |
| Geo-spatial technology | **Built** | MongoDB 2dsphere, Nominatim geocoding via an authenticated server route, Leaflet maps |
| Digital payment systems | **Partial** | Razorpay integrated; mock mode by default |
| Cloud computing | **Built** | Vercel (client) + Render (API) + MongoDB Atlas |

### What is deliberately not built

These were left out rather than faked, and each has a code comment saying so:

- **OTP / SMS login.** No SMS provider is configured. `/otp-verification` exists
  as the designed screen and says on its face that it verifies nothing. Real
  auth is phone + password.
- **Emergency/SOS tier.** No priority dispatch lane exists.
- **Trustee boards, charter PDFs, audit hashes.** In the designs, not in the
  data model.
- **Per-vehicle telemetry** — speed, OBD faults, corridor flow. Vehicles carry
  a real position and nothing more.
- **Inbound-load ledger for warehouse hubs.** No Booking→hub relation exists,
  so there is no set of inbound loads to list.

---

## Roles

| Role | Demo phone | Home |
|---|---|---|
| Customer | 9000000010 | `/customer/dashboard` |
| Driver | 9000000011 | `/driver/dashboard` |
| Hamali (solo) | 9000000012 | `/hamali/dashboard` |
| Society leader | 9000000013 | `/mutha/dashboard` |
| Society member | 9000000014 | `/mutha-member/job` |
| Fleet owner | 9000000015 | `/fleet-owner/dashboard` |
| Warehouse hub | 9000000016 | `/warehouse-hub/dashboard` |
| Manager | 9000000017 | `/admin/dashboard` (scoped) |
| Federation — AP state | 9000000020 | `/federation-state/dashboard` |
| Federation — VZM district | 9000000021 | `/federation-district/dashboard` |
| Federation — Telangana state | 9000000022 | `/federation-state/dashboard` |
| Admin (root) | 9999999999 | `/admin/dashboard` |

Demo password `Demo1234!` for every account except root admin
(`ChangeMe123!`).

---

## Money

One published platform commission of **10%**, taken on gross, on every
earning role. A society additionally takes its own bye-law cut — reserve plus
welfare fund — also on gross. The two never compound.

Worked example, a ₹600 job for a society member whose society runs 6% reserve
and 2% welfare:

```
gross                    ₹600
platform commission 10%  −₹60
society reserve      6%  −₹36
welfare fund         2%  −₹12
                    ─────────
member keeps            ₹492   (82%)
```

Every one of those lines is itemised on the worker's earnings screen. The
federation sets a ceiling on both society rates, and the society's governance
screen shows the cap beside each control.
