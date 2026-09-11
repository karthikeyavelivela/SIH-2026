# SIH26089 — Compliance Audit

**Audited:** 2026-09-11 · **Commit:** `972a87d` · **Against:** production only
(`fyro.vercel.app` + `sih-2026-f63s.onrender.com`), never localhost.

**Deploy currency confirmed before starting.** Routes added hours before this
audit resolve live (`/customer/ratings` 200, `/warehouse-hub/docks` 200) and
the newest API route returns `401 Not authenticated` rather than `404`, which
only happens if the server build is current. Results below are therefore
about the build a judge would see.

**Credentials used.** The demo accounts committed in
`server/src/scripts/seedDemoAccounts.ts` and `DEPLOY.md`. No personal
credentials were entered.

**Method.** Code located and cited first, then the feature performed on
production through the real UI where a UI exists. Anything I could not
perform live is marked **unverified** and says why. Nothing was fixed.

---

## A. THE 11 REQUIRED FEATURES

| # | Feature | Status | Live evidence (production) | Key files |
|---|---|---|---|---|
| 1 | Service provider registration & verification | **BUILT** | 4 role signups render and submit; KYC queue returns real pending users to admin; `complianceStatus` gates dispatch | `routes/auth.routes.ts`, `routes/kyc.routes.ts`, `app/signup/*`, `app/admin/kyc-queue` |
| 2 | Worker skill profiling & certification | **PARTIAL** | 12 service categories live incl. all 10 PS trades; **training in production returns only 3 cargo/generic modules** — the 4 trade modules are unseeded | `scripts/seedServiceCategories.ts`, `scripts/seedTrainingModules.ts`, `models/HamaliProfile.ts` |
| 3 | Customer booking & scheduling | **BUILT** | Booked live through the UI: geocoded address → live quote ₹300 → `POST /api/bookings` 201 → redirect to tracking with map, stepper, chat | `controllers/booking.controller.ts`, `app/customer/book/*`, `app/customer/service/[slug]` |
| 4 | Geo-location based matching | **BUILT** | Geocode suggestions resolve live; 2dsphere matching; live map on tracking | `services/matching.service.ts`, `routes/geocode.routes.ts`, `models/Vehicle.ts` |
| 5 | Digital payments & invoicing | **PARTIAL** | Razorpay wired end to end incl. webhook + revenue ledger; **`MOCK_EXTERNAL_SERVICES: "true"` is hardcoded in `render.yaml` and no Razorpay keys are set — no real money can move in production** | `controllers/payment.controller.ts`, `render.yaml:12`, `components/booking/PaymentSection.tsx` |
| 6 | Rating & feedback | **BUILT** | Two-way mandatory rating; pending list live; "rate later" deferral verified end to end on production data | `controllers/rating.controller.ts`, `services/ratingGate.service.ts`, `app/customer/ratings` |
| 7 | Worker welfare & insurance | **BUILT** | Live as driver: 2 plans returned (Worker Earnings Protection ₹25,000; Vehicle Cover ₹2,00,000). Household trades are `hamali_solo`/`mutha_member`, both inside `work_compensation`'s `forRoles` | `scripts/seedInsurancePlans.ts`, `services/parametricInsurance.service.ts` |
| 8 | Emergency & on-demand booking | **PARTIAL** | On-demand ("Now") is the default booking path and works. **Emergency/SOS does not exist:** `components/ui/SOSButton.tsx` has **zero callers** and there is **no server route** matching sos/emergency/panic | `components/ui/SOSButton.tsx` (orphan) |
| 9 | Federation administration dashboard | **PARTIAL** | All 3 tiers live: AP state (13 districts), VZM district, Telangana state — each scoped correctly. **Approve affiliation works in the UI. Suspend society and edit bye-law cap are backend-only** | `routes/federation.routes.ts:65,83`, `components/federation/FederationDashboardView.tsx` |
| 10 | Multilingual application | **PARTIAL** | Switched to Telugu live: headings, tab bar, body copy all translate. **Service category names stay English** ("Caregiver" on a fully-Telugu screen). Server error catalogue covers 14 of ~180 messages | `i18n/messages/{en,te,hi}.json` (3027 keys each, exact parity), `server/src/i18n/messages.ts` |
| 11 | AI demand forecasting & allocation | **PARTIAL** | 6 agents exist and return grounded output with guardrails intact — **but production renders `DEMO MODE — NO LIVE MODEL CALL`. `mock: true` confirmed at the API. `ANTHROPIC_API_KEY` is unset on Render** | `server/src/agents/*`, `components/ui/AgentResultCard.tsx:66` |

### Cooperative-context notes (asked specifically)

- **#1 — yes, genuinely cooperative.** A Society registers itself with a real
  registration number and governing act, not just a worker signing up. Live:
  `VZM/SOC/2026/001`, *AP Cooperative Societies Act 1964*, affiliated to
  Visakhapatnam District Federation.
- **#2 — categories yes, training no.** All ten PS-named trades are seeded
  (electrician, plumber, carpenter, painter, domestic_helper, caregiver,
  driver, gardener, cleaner, technician). The trade curriculum exists in the
  seed file with NCCT-aligned references but **is not in the production
  database** — a skilled worker sees Platform Safety, Loading Protocols,
  Earnings & Payouts, all `tradeArea: null`.
- **#7 — covers household trades.** Cover is role-based, and a household
  tradesperson signs up as `hamali_solo`/`mutha_member`, which
  `work_compensation` includes. There is no trade-specific cover (tool loss,
  in-home property liability).
- **#11 — grounded but mocked.** The demo response cited the real booking
  status, real ₹300 fare and real route from the database. It is honest
  output; it is not a model call.

---

## B. THE FIVE TECH COMPONENTS

| Component | Status | Evidence |
|---|---|---|
| **Mobile applications** | **PARTIAL — responsive web only** | No `manifest.json`/`.webmanifest`, no service worker, no `next-pwa`, no manifest in `app/layout.tsx`. It is mobile-first and verified at 375px, but **not installable, not a PWA, not native.** A judge reading "mobile application" literally will not find one. |
| **Artificial intelligence** | **PARTIAL** | Six agents: Support, Dispute Triage, Demand Forecast, Document Pre-check, Pricing & Quote, Market Insights. All six localise output. **All six run mocked in production.** |
| **Geo-spatial** | **BUILT** | MongoDB 2dsphere on Vehicle/HamaliProfile; Nominatim geocoding behind an authenticated route; Leaflet map with live tracking; 24 real AP toll plazas seeded as checkpoints. |
| **Digital payments** | **PARTIAL** | Razorpay order/verify/webhook + COD + GST tax-invoice PDF + append-only ledger, all real code. **Mock mode in production** (`render.yaml` sets `MOCK_EXTERNAL_SERVICES: "true"`; no Razorpay keys). Not even test keys. |
| **Cloud computing** | **BUILT** | Vercel (client), Render (API, auto-deploy from `main`), MongoDB Atlas, Cloudinary (media). |

---

## C. THE COOPERATIVE MECHANISM

| Check | Status | Evidence |
|---|---|---|
| Three-tier hierarchy | **BUILT** | Live: AP state → 13 districts → society → members. `Federation.parentFederationId`, `Mutha.districtFederationId`. Tier is read from the fetched document's own `type`, never a client prop. |
| Society sets its own rates | **BUILT** | Live on `/mutha/governance`: reserve 6%, welfare 2%, both editable by the leader. |
| Federation caps them, enforced server-side | **BUILT** | `updateByLaws` bounds against the federation's max; the UI shows "Federation cap: 10% max" / "Federation ceiling: 5%" beside each control. |
| Members vote, with real consequence | **BUILT** | Live: a closed rate-card poll reading "Adopt 7% / 2% — 100% (1)". Verified earlier this session that closing such a poll actually moved the society's rate 6%→7%. |
| Member equity / share ledger | **BUILT** | Live: ₹1,000 total par value, 10 share units, 1 shareholder, issue-shares form present. |
| Surplus distribution | **BUILT** | Compute + distribute endpoints, proportional to shareholding, posting real ledger entries. **Zero runs exist in production** — mechanism verified, never exercised with live data. |
| Commission computed once at completion, permanently recorded | **BUILT** | `requests.controller.ts:310-320` records both cuts exactly at completion, fire-and-forget, never at read time; `CommissionRecord` stores gross/rate/amount/net; the platform entry is idempotency-guarded on `LedgerEntry{type:'fee'}`. |
| **FYRO takes no transaction cut** | **FALSE — it takes 10%** | The live UI states **"PLATFORM COMMISSION (10%) −10%"**, leaving the member 82% after a 6%+2% society cut. `services/platformCommission.service.ts`. See the warning below. |

> **⚠ This contradicts the audit brief's own expectation.** The brief asks me
> to confirm FYRO takes no cut. It takes 10% on every earning role — a
> deliberate product decision, implemented and disclosed honestly throughout
> the UI. But if the submission narrative says "cooperative-owned, no
> platform extraction", **the running product contradicts the pitch.** Decide
> which one changes before submitting. This is a positioning decision, not a
> bug.

---

## D. BEYOND THE BRIEF

| Item | Status | Evidence |
|---|---|---|
| Parametric insurance | **PARTIAL (unverified live)** | Per-worker per-period cap and platform-wide daily cap both real (`MAX_PARAMETRIC_PAYOUT_PER_WORKER_PER_PERIOD`, `MAX_PARAMETRIC_PAYOUT_GLOBAL_PER_DAY`); two kill switches (env `PARAMETRIC_PAYOUTS_ENABLED` + DB). Idempotency is by epoch-aligned period bucket. Admin monitor live: `todayTotal: 111, dailyCap: 500000`. **I did not fire a trigger twice on production** — doing so would move money in the live database. Idempotency is asserted by the server test suite, not by me here. |
| The 6 AI agents | **PARTIAL** | All six exist, all localise, all carry confidence + evidence + "Recommended, not applied", all audit-logged, none can execute a payout/suspension/refund/fare-override (they return advice objects only). **All mocked in production.** I did not run a cross-role RBAC attempt against production. |
| Secure transit checkpoints | **BUILT (code) / unverified live** | 24 real AP toll plazas seeded (Sullurpet, Tangutur, Aganampudi, Chilakapalem…); halt check-in/out and `detectUnplannedHaltDeviation` exist. Not exercised live this pass. |
| Load board with bidding | **BUILT (per V3)** | Verified end to end in AUDIT_REPORT_V3 against production. Not re-run here; `GET /api/loadboard` returns 200 for driver and hamali. |
| Digital Bill of Lading | **BUILT (per V2/V3)** | Signature capture + generated PDF. Not re-verified this pass. |
| Fraud detection | **BUILT** | Five real detectors: zero-distance-full-fare, abnormal cancellation rate, rapid account creation, location jump, unplanned halt deviation. `GET /api/admin/fraud/cases` returns real cases in production. |
| Workmanship guarantee | **PARTIAL — still not implemented** | `ServiceCategory.guaranteeEligible` / `guaranteePeriodDays` exist and are **displayed as a badge** to customers, but **no claim flow consumes either field.** Prior audits recorded this as designed-not-implemented; unchanged. A customer is shown a guarantee they cannot claim. |
| Cash on delivery | **BUILT** | `workerCodRoles = requireRole('driver','hamali_solo','mutha_member','mutha_leader')` — the customer role is structurally excluded from confirming collection. |

---

## E. SUBMISSION BLOCKERS — RANKED

| # | Blocker | Effort | Why it matters |
|---|---|---|---|
| 1 | **`ANTHROPIC_API_KEY` unset in production** — every agent shows "DEMO MODE — NO LIVE MODEL CALL" | **5 min** (paste key into Render → Environment) | A judge opening any AI surface sees the words "no live model call". AI is 1 of 11 required features and 1 of 5 required tech components. |
| 2 | **Trade training modules not seeded in production** — skilled workers see cargo-only curriculum | **10 min** (run `seedTrainingModules` against prod) | Directly undercuts Feature #2 in the household-services context the PS is about. The content already exists. |
| 3 | **6 test accounts `9200000001`–`9200000006` still live** ("Inventory Test Solo/Leader/Member/Driver/Fleet/Hub") | **10 min** | Visible in the admin user list to any judge who opens it. Looks unfinished. |
| 4 | **No emergency/SOS flow** — `SOSButton.tsx` orphaned, no endpoint | **3–4 h** | Feature #8 is half-missing. The button component is already written; it needs a route, a model and a screen. |
| 5 | **Service category names English in Telugu/Hindi** | **30 min** | Translations for all 12 slugs already exist at `marketing.home.categories`; the dashboard renders the raw DB `name` instead. Most visible i18n leak on the main customer screen. |
| 6 | **Federation: suspend-society and edit-bye-law-cap have no UI** | **2–3 h** | Endpoints exist (`PATCH /federation/societies/:id/suspend`, `PATCH /federation/me/bounds`). This is the "real infrastructure, no trigger" pattern the prior audits named, still live in two places. |
| 7 | **Payments in mock mode** (`MOCK_EXTERNAL_SERVICES: "true"`, no Razorpay keys) | **30 min** for test keys | Defensible for a demo *if stated*. Indefensible if the pitch says "digital payments integrated" without qualification. |
| 8 | **Workmanship guarantee badge with no claim flow** | **4–6 h**, or **5 min** to hide the badge | Currently promises customers something unclaimable. |
| 9 | **No PWA manifest / service worker** | **1–2 h** | Makes "Mobile Application" defensible as *installable*, not just responsive. |
| 10 | Surplus distribution never exercised in production (0 runs) | **15 min** to run one | The mechanism is the most distinctive cooperative feature and currently shows an empty state. |

**Not blockers, verified healthy:** admin root password works in production; manager account `9000000017` exists with all 4 permissions; fleet_owner and warehouse_hub demo accounts both work; 12 service categories and 172 fare rules seeded; every role's endpoints return 200 (a full 12-role sweep found only two non-200s, both correct: a path I guessed wrong, and a deliberate manager-vs-admin permission boundary on fare rules).

**I did not complete:** a click-through of every interactive control on all 106 screens, and a console-error sweep of every page. Both were in scope and are **unverified**.

---

## F. HONEST SCORE

### Required features: **8 / 11**

BUILT = 1, PARTIAL = 0.5.

| Built (6) | Partial (5) |
|---|---|
| 1 Registration & verification | 2 Skill profiling *(training unseeded)* |
| 3 Booking & scheduling | 5 Payments *(mock mode)* |
| 4 Geo matching | 8 Emergency *(SOS missing)* |
| 6 Rating & feedback | 9 Federation admin *(2 actions UI-less)* |
| 7 Welfare & insurance | 10 Multilingual *(category names, server errors)* |
| | 11 AI *(mocked in production)* |

6 + (5 × 0.5) = **8.5**, rounded down to **8/11** because #11 being mocked is
materially worse than a normal "partial" — a judge sees the words "no live
model call" on screen.

### Submission readiness: **72%**

| Weight | Area | Score |
|---|---|---|
| 30% | Required features | 77% |
| 20% | Cooperative mechanism (the actual differentiator) | **95%** |
| 15% | Tech components | 60% |
| 15% | Production health (deploy current, all roles work, no 404s) | **95%** |
| 10% | Polish (i18n leaks, orphan UI, test accounts) | 60% |
| 10% | Beyond-brief depth | 80% |

The cooperative mechanism is the strongest part of this build by a distance
and is the thing the PS actually asks for. The weakest parts are configuration,
not engineering — which is why readiness is recoverable in a day.

---

## G. THE SINGLE BIGGEST WEAKNESS

**Every AI feature displays "DEMO MODE — NO LIVE MODEL CALL" to anyone who
opens it.**

AI is one of eleven required features *and* one of five required tech
components — it is weighted twice. A judge who clicks the assistant on the
customer dashboard reads, in the product's own words, that no model was
called. The guardrails are exemplary and the mock output is honestly grounded
in real database records, which is to the build's credit — but the first
impression is "the AI isn't real".

**Fix time: 5 minutes.** Set `ANTHROPIC_API_KEY` in the Render dashboard →
Environment. No code change; `callAgent()` already switches on the key's
presence, and the badge disappears on its own when `mock:false` comes back.

The second-biggest is close behind and also config, not code: the trade
training curriculum is written, NCCT-referenced, and sitting unseeded — ten
minutes of `seedTrainingModules` against production turns Feature #2 from
partial to built.

**Combined, items 1–3 and 5 in Section E are about 55 minutes of work and
move the score from 8/11 to roughly 9.5/11.** That is the highest-leverage
hour available before submission.
