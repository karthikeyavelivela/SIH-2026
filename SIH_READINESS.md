# FYRO → SIH26089 Readiness Assessment (Phase A)

**Scope:** static code audit against `main` HEAD (commit `ca5a2c6`) plus this session's own live production evidence (`fyro.vercel.app`, `sih-2026-f63s.onrender.com`), read together with [`AUDIT_REPORT.md`](./AUDIT_REPORT.md) (V1), [`AUDIT_REPORT_V2.md`](./AUDIT_REPORT_V2.md) (V2), and [`AUDIT_REPORT_V3.md`](./AUDIT_REPORT_V3.md) (V3). This document does not re-litigate what those three already established as BUILT for the *logistics-marketplace* framing — it re-evaluates the same codebase against a **different problem statement**: SIH26089, a cooperative-owned household/community services marketplace for Labour Cooperative Federations under the Ministry of Cooperation / NCCT.

**The central fact this whole document turns on:** FYRO is a genuinely well-built, production-verified truck-and-Hamali-labor logistics marketplace. SIH26089 asks for a cooperative-owned household services marketplace (electricians, plumbers, domestic helpers, caregivers, etc.) with a three-tier federation governance structure. These overlap in *mechanism* (booking, matching, payment, rating, insurance all transfer cleanly) but diverge sharply in *domain content* (what's being booked, who's providing it, what "verification" and "welfare" mean for a caregiver entering someone's home vs. a truck driver) and **diverge completely on governance** (a cooperative federation is not a platform admin — nothing in this codebase models a federation at all).

Status definitions, same as V1/V2/V3: **BUILT** (wired end-to-end, live-verified) · **PARTIAL** (real but incomplete, or built for the wrong domain) · **MISSING** (does not exist).

---

## Per-feature status

### 1. Service provider registration and verification

**Status: PARTIAL** (mechanism BUILT, wrong domain content, cooperative context MISSING)

- **Evidence:** `client/src/app/signup/{customer,driver,fleet-owner,hamali,warehouse-hub}/page.tsx` — real signup flows. `server/src/controllers/kycDocument.controller.ts` + `KycDocumentType` (`shared/src/types.ts:25-34`) — real document upload/review pipeline, admin-verified (`kyc.controller.ts`).
- **Cooperative-context gap:** the 9 KYC document types are `driving_licence | vehicle_rc | fastag | goods_carriage_permit | puc | vehicle_fitness | aadhaar | pan | gstin` (`shared/src/types.ts:25-34`) — every non-generic one is vehicle/logistics-specific. A plumber, electrician, or domestic helper has **none** of these to submit. Missing entirely: police verification certificate (non-negotiable for anyone entering a private household — caregivers, domestic helpers), trade/ITI certificate, character/reference verification, society membership proof. There is no "service provider" registration distinct from an individual worker signup — a **Society** (cooperative unit) itself has no registration flow at all; it's created ad hoc by any `mutha_leader` via `mutha/create-group` with no registration-number/act field (see Feature 9).
- **Effort to close:** small-medium — extend `KycDocumentType` with `police_verification`, `trade_certificate`, `character_reference`; add a society-level registration form. 2-3 days.

### 2. Worker skill profiling and certification

**Status: PARTIAL** (mechanism BUILT, wrong domain content)

- **Evidence:** `TrainingModule`/`TrainingProgress`/`Certification` models + `training.controller.ts` — real sequential-unlock curriculum, real QR-verified certificates (`components/ui/QRCodeDisplay.tsx`), live-tested this session (47 new server tests in `tests/training.test.ts`). `HamaliSkillsSection` (`client/src/components/worker/ProfileSections.tsx:371-443`) is a real, working skill-tag picker.
- **Cooperative-context gap:** `ALL_SKILLS` (`ProfileSections.tsx:368`) = `['cement','steel','fragile','furniture','appliances','agricultural','construction_material']` — 100% cargo-handling skills. Nothing for electrician/plumber/carpenter/painter/caregiver/gardener/cleaner/technician trade skills. `scripts/seedTrainingModules.ts`'s 3 modules are "Platform Safety Basics," "Loading Protocols & Standards," "Earnings & Payouts" — warehouse/trucking content, not trade skill curricula. No mapping to NCCT's actual programme structure exists anywhere (no `ncct`, `nsdc`, or `c-pec` string anywhere in the repo — checked).
- **Effort to close:** medium — the mechanism is real and reusable; content is a full rewrite. 3-5 days for a genuine multi-trade skill taxonomy + curricula + NCCT-alignment framing.

### 3. Customer booking and scheduling system

**Status: BUILT**

- **Evidence:** `server/src/controllers/booking.controller.ts` — instant booking is the default; `scheduledFor` (added Phase 6, `Booking.ts`) makes scheduled booking a real, distinct, server-validated path (30min–14day bounds). Live-verified this session on production.
- **Cooperative-context gap:** none functionally — this transfers cleanly to any service vertical once `ServiceCategory` exists (see Phase C). The booking *form* is currently hardcoded to truck/hamali/combo fields (weight, vehicle capacity) — an electrician booking has no reason to ask for cargo weight.
- **Effort to close:** none for the mechanism; form genericization is Phase C work (already scoped).

### 4. Geo-location based service matching

**Status: BUILT**

- **Evidence:** 2dsphere indexes on `Booking`, `Vehicle`, `HamaliProfile`; `matching.service.ts`'s `SEARCH_RADIUS_KM` + willing-location wider-radius fallback; sequential-timed-offer engine (`realtime/offerEngine.ts`). Live-verified end-to-end across multiple sessions.
- **Cooperative-context gap:** none — this is genuinely category-agnostic already (matches on capacity/hamali-count, not on cargo specifics). Directly reusable for "find the nearest verified electrician."
- **Effort to close:** none.

### 5. Digital payments and invoicing

**Status: BUILT**

- **Evidence:** Razorpay integration (mock-mode in production, real webhook+HMAC code path exists — `payment.controller.ts`), GST tax invoice PDF (`taxInvoice.service.ts`, Phase 6.4 this session, live-verified against a real paid booking, math reconciled to the paisa).
- **Cooperative-context gap:** the invoice's two GST line items are hardcoded `'Goods transportation service (GTA)'` at 5% and `'Loading/unloading labour service'` at 18% (`taxInvoice.service.ts:61,65`) — meaningless for a plumbing or electrical job. Needs a per-`ServiceCategory` GST treatment.
- **Effort to close:** small — the invoice math/PDF engine is real and reusable; just needs category-driven line-item labels/rates. <1 day once `ServiceCategory` exists.

### 6. Rating and feedback mechanism

**Status: BUILT**

- **Evidence:** mandatory two-way ratings, blocking the next booking/accept until rated (`ratingGate.service.ts`), live-verified this session (submitted a real 5-star rating on production).
- **Cooperative-context gap:** none — fully category-agnostic already.
- **Effort to close:** none.

### 7. Worker welfare and insurance integration

**Status: PARTIAL** (mechanism BUILT, wrong domain content)

- **Evidence:** `InsurancePlan`/`InsurancePolicy`/`InsuranceClaim` models, real parametric auto-payout engine (`parametricInsurance.service.ts`) computing genuine trailing earnings, real claims review workflow, live-verified end-to-end this session (real Payout + LedgerEntry created from a fired trigger).
- **Cooperative-context gap:** `InsurancePlanCategory` = `'commercial_auto' | 'work_compensation' | 'cargo_transit'` (`InsurancePlan.ts:44`) — two of three categories are vehicle-specific and meaningless for a domestic helper or caregiver. `work_compensation` is the only one that generalizes. No cooperative-specific welfare concepts exist at all: no member share/equity, no surplus distribution, no cooperative welfare fund (these are Phase B asks, covered below, not this feature's own gap — but worth noting the *insurance* half specifically needs new categories: accident cover for a technician, liability cover for a caregiver in a client's home, etc.).
- **Effort to close:** small-medium — the engine is real and reusable; needs 2-3 new `InsurancePlanCategory` values + plan seed data. 1-2 days.

### 8. Emergency and on-demand service booking

**Status: PARTIAL — on-demand BUILT, emergency MISSING (dead code)**

- **Evidence (on-demand, BUILT):** instant booking (no `scheduledFor`) is the existing default flow — already, functionally, "on-demand." Confirmed above.
- **Evidence (emergency, MISSING):** `client/src/components/ui/SOSButton.tsx` is a real, complete press-and-hold (3s) component — **and has exactly zero callers anywhere in the app.** `grep -rln "SOSButton" client/src/app client/src/components` returns only the component's own file. It is dead code, confirmed directly this pass (V1 had flagged this "unverified in depth"; this pass traced it to ground and found nothing renders it). There is no server-side emergency/SOS endpoint at all — `grep -rli "emergency|\bsos\b"` across `server/src/{controllers,routes,models}` returns zero real matches.
- **Effort to close:** medium — the button component exists; needs a real trigger surface (worker dashboard + customer track screen), a server endpoint that flags the booking, alerts admin/federation, and shares live location. 2-3 days.

### 9. Cooperative federation administration dashboard

**Status: MISSING**

- **Evidence:** the only "cooperative" concept in the codebase is `Mutha` (`server/src/models/Mutha.ts`) — `{name, leaderId, memberIds, region, inviteCode, ratingAvg, activeJobsCount}`. No `registrationNumber`, no `registeredUnderAct`, no parent-federation reference, no bye-laws, no governance fields of any kind. `Role` (`shared/src/types.ts:1-10`) has exactly 9 values — no `federation_state_admin`, no `federation_district_admin`. `client/src/app/` has exactly one cooperative-tier directory (`app/mutha/`) and one platform-superuser directory (`app/admin/`) — nothing between or above them. This is the single largest gap in the entire assessment: the PS's feature #9 explicitly names a hierarchy (federation administration), and the codebase currently models a **flat, single-tier, platform-owned** structure with a platform admin at the top, not a member-owned cooperative federation.
- **Cooperative-context gap:** this is the entire gap — see Phase B of the build plan.
- **Effort to close:** large — this is Phase B's core, estimated 1-2 weeks for the full 3-tier hierarchy + governance layer.

### 10. Multilingual mobile application

**Status: PARTIAL** (client BUILT, server-side MISSING, "mobile" is a responsive web app not a native app)

- **Evidence:** per AUDIT_REPORT_V3, client i18n coverage is ~94% (89/95 pages), en/te/hi with verified key parity (1694 keys), live-verified mid-session locale switches. Server-side i18n is confirmed **0%** — every API error string is hardcoded English (`server/src/utils/ApiError.ts` and every controller, unchanged since V1).
- **Cooperative-context gap:** none specific to cooperatives, but material to the PS: "mobile application" — FYRO is a responsive Next.js **web** app, not a native/PWA mobile app. No `manifest.json`/service worker/app-store presence was found. A judge reading "mobile application" literally will not find one.
- **Effort to close:** server-side i18n is medium (design a message catalog from scratch, per V3 Section D). A PWA wrapper (installable, offline-shell) is small-medium and would honestly close the "mobile application" gap without a full native rewrite; a true native app is out of scope for this timeline.

### 11. AI-based demand forecasting and workforce allocation

**Status: PARTIAL** (real logic, not verifiably live in production)

- **Evidence:** Agent C (`demandForecastAgent.ts`) explicitly frames its `mutha_leader` audience output as a workforce-allocation recommendation ("which hours are worth having more people online for" — `demandForecastAgent.ts:80-82`), and its `admin` audience output as a surge-recommendation. This is real, guardrailed (refuses to forecast on thin data), and cache/RBAC-correct.
- **Cooperative-context gap:** every live response this session returned `"mock": true` / `"DEMO MODE — NO LIVE MODEL CALL"` because `ANTHROPIC_API_KEY` is unset in production (confirmed live, Pricing & Quote Agent, this session's own browser test on `fyro.vercel.app`). A judge running this feature live today gets a deterministic, clearly-labeled canned response, not a real model call — technically honest (correctly labeled, never pretends to be live), but not what "AI-based" should demonstrate in a live demo.
- **Effort to close:** trivial — set the env var on Render, verify each agent's response is no longer `mock:true`. This is Phase E.1's own #1 item, correctly sequenced first.

---

## Direct answers

### 1. What would immediately read as "this is a trucking app, not a cooperative services platform"?

The landing page, word for word (`client/src/i18n/messages/en.json`, `marketing.home`):

> **"Move anything. Anywhere in AP."**
> "Trucks for 1kg or 1000 tons. Hamali labor on demand."
> Stats shown: cargo range 1kg–1000t, districts covered.
> Closing CTA: **"Own a truck? Ready to work?"**

There is no ambiguity here — a judge's very first screen states the product is for moving cargo. Nothing about households, cooperatives, or community services appears anywhere on the homepage. This is the single highest-priority fix in Phase C.

### 2. Which of the 11 features would fail a live demo, right now, today?

- **#8 (Emergency booking half)** — `SOSButton` is dead code. Pressing nothing, because there's nothing to press.
- **#9 (Federation dashboard)** — does not exist in any form. There is no page to open.
- **#11 (AI demand forecasting)** — would return a response, but the response is explicitly labeled `DEMO MODE — NO LIVE MODEL CALL` on production right now. A judge who reads the label sees it's not a live model.
- **#1 and #2 in a cooperative-services context** — a demo asking "onboard a plumber and have them show their trade certificate" fails, because no such document type exists to upload; the KYC picker only offers vehicle documents plus generic ID.

Everything else (3, 4, 5, 6, 7 mechanism, 10 client-side) would genuinely work live.

### 3. What exists in the codebase that is irrelevant or confusing for this PS?

- `Vehicle`, `Fleet`, `MaintenanceSchedule`, `VehicleInspection`, `DockSlot`, `GateEvent`, `WarehouseHub` — an entire fleet-management and warehouse-logistics subsystem. **Not irrelevant to remove** (drivers are explicitly on the PS's own service list), but if shown undifferentiated alongside "book a caregiver," it reads as scope confusion rather than a deliberate logistics-is-one-vertical-among-many design. Needs explicit framing in Phase C, not deletion.
- `fleet_owner` and `warehouse_hub` roles/signup flows/dashboards — genuinely built, genuinely irrelevant to a household-services cooperative unless explicitly kept as "the logistics vertical's B2B side." Same call as above: frame, don't delete.
- KYC document types `fastag`, `goods_carriage_permit`, `puc`, `vehicle_fitness` — actively confusing if shown to a judge evaluating a plumber's onboarding flow.
- Insurance categories `commercial_auto`, `cargo_transit` — same.

### 4. What does the PS ask for that has no equivalent anywhere in the code?

- The entire three-tier federation hierarchy (state → district → primary society) — **zero code**.
- Member share/equity ledger — **zero code**. `LedgerEntry.type` is `'revenue'|'payout'|'fee'|'refund'` (`LedgerEntry.ts:3`); no `'equity'` or `'surplus'` concept anywhere.
- Surplus distribution to members (as opposed to platform profit) — **zero code**.
- Society bye-law configuration (commission/welfare rates set per-society, bounded by federation limits) — **zero code**. Commission handling isn't visible to workers at all right now in any itemized "here's what was deducted and why" form.
- Democratic governance (voting on rate cards, leader elections) — **zero code**.
- NCCT programme alignment / C-PEC accreditation framing — **zero code**, zero mention anywhere in the repo.
- Emergency/SOS booking backend — **zero code** (button exists, nothing behind it).
- Multi-vertical `ServiceCategory` — **zero code** (booking type is a 3-value hardcoded enum).
- Secure transit checkpoints (Phase D.1) and workmanship guarantee (Phase D.2) — **zero code**, as expected (these are net-new innovations, not existing-PS gaps).

---

## What this means for sequencing

Phase B (cooperative layer) is the correct highest priority exactly because it's the one item with **zero existing code to extend** and the one the PS's own feature #9 names explicitly — it's the difference between "a marketplace a cooperative could use" and "a cooperative-owned marketplace." Phase C (service verticals) is the second priority because it's what makes the first 30 seconds of a demo read correctly. Phase E.1 (API key) is correctly sequenced as a 5-minute fix that should happen before any live agent demo is attempted.

This document does not yet cover Phase D's two innovations in detail — those are net-new builds, not gap-closures, and are scoped fully in the build prompt already.

Awaiting sign-off on this analysis before starting Phase B.
