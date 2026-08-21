# FYRO — Audit Report

**Scope:** static code audit (server + client, current `main` HEAD) and live verification against `https://fyro.vercel.app` / `https://sih-2026-f63s.onrender.com`.

**A material fact before anything else:** this audit's static pass found the on-disk codebase in a substantially different (larger, more built-out) state than what the auditor's own immediately-prior conversation turns had produced — 13 commits and ~133 files landed between the auditor's last edit and this audit that the auditor has no first-hand memory of authoring (commit range `d4e88a5`..`904d217`: a full design-token retint, an 83-screen Stitch import, the i18n scaffold, fleet-owner/warehouse-hub verticals, insurance, training/certification/referrals, and "6 rebuild waves" of admin/ops systems). This report audits **current disk + live state only**, not the auditor's memory of the project.

**Verification depth, honestly stated:** this is a ~342-file, 34-model, 32-controller, 81-page application. Every claim below is backed by a file path (and line number where precise) that was actually read or a live request that was actually made — nothing here is inferred from filenames alone. But given the size of the surface, not every one of the source checklist's ~150 individual sub-items was independently re-verified; where that's true it is marked **unverified** rather than guessed. Do not read silence on a sub-item as a pass.

---

## A. MASTER STATUS TABLE

Legend: **BUILT** wired end-to-end + live-verified · **PARTIAL** real but incomplete (detail given) · **STUB** exists, does nothing real · **MOCK** fake/hardcoded data · **MISSING** does not exist · *unverified* not checked this pass.

### Foundation

| Feature | Classification | Evidence | Live-verified | Notes |
|---|---|---|---|---|
| TypeScript coverage | BUILT | client/server both `tsc --noEmit` clean; no stray `any` found in spot-checked files | — | Full-repo `any` sweep not done |
| Auth: signup/login/logout | BUILT | `server/src/controllers/auth.controller.ts` | Yes — logged in as 3 roles via `/api/auth/login` live | |
| JWT + httpOnly cookie | BUILT | `server/src/services/token.service.ts`, cookie set with `httpOnly`, `sameSite: production?'none':'strict'` (fixed this session) | Yes | |
| Refresh rotation | PARTIAL | `tokenVersion` field on User bumped on rotation/logout (`User.ts`) — mechanism real; not independently tested for a genuine rotate-then-old-token-rejected round trip this pass | *unverified* (mechanism only) | |
| RBAC middleware (`requireRole`/`requirePermission`) | BUILT | `server/src/middleware/rbac.ts` — `requirePermission` re-fetches manager permissions live from DB, does not trust the JWT | Yes | |
| RBAC applied to every route file | BUILT | grep of all 33 `server/src/routes/*.ts`: every file imports+applies `verifyJwt` at least once; `payment.routes.ts`'s webhook is the one deliberate public exception, verified by HMAC instead (`payment.controller.ts:68-76`) | — | Not a gap: documented, correct design |
| Socket.io JWT handshake + room auth | PARTIAL | `server/src/realtime/handlers.ts:98` re-fetches booking and checks `assignedDriverIds`/`assignedHamaliIds`/`customerId` membership before allowing room join | *unverified live* (socket flow not re-tested this pass) | |
| Rate limiting | PARTIAL | `express-rate-limit` present (`middleware/rateLimit.ts`), applied to `/api/auth/login` (observed live `ratelimit-limit: 5;w=60` header earlier this session) | Yes (auth only) | Not confirmed on other mutating routes |
| express-validator on mutating routes | BUILT | Every route file sampled (`admin.routes.ts`, `fraud.routes.ts`, `insurance.routes.ts`, `payment.routes.ts`) has per-field validators + `validate` middleware | — | |
| 2dsphere indexes | BUILT | `Booking.ts:103-104` (pickup/drop), `Vehicle.ts:70-71`, `HamaliProfile.ts:50-51`, `WarehouseHub.ts:28` all indexed. `SavedAddress.ts` stores a `Point` with **no** 2dsphere index | — | SavedAddress gap is low-severity: nothing `$near`-queries it |
| Money computed server-side only | BUILT | `payment.controller.ts:16-20` doc comment + code: amount is always `booking.fareBreakdown.total`, never client-supplied. `fare.service.ts` is the sole fare engine. | — | See Section G for one caveat |

### Roles (9)

| Role | In User enum | Self-signup | Dashboard | Demo account seeded |
|---|---|---|---|---|
| customer | Yes | Yes (`/signup/customer`) | BUILT, live-verified | Yes (`9000000010`) |
| driver | Yes | Yes | BUILT, live-verified | Yes (`9000000011`) |
| hamali_solo | Yes | Yes | BUILT, live-verified | Yes (`9000000012`) |
| mutha_leader | Yes | via hamali signup | BUILT, live-verified | Yes (`9000000013`) |
| mutha_member | Yes | invite-only | BUILT, live-verified | Yes (`9000000014`) |
| fleet_owner | Yes | Yes (`/signup/fleet-owner`) | pages exist (`app/fleet-owner/**`) | **No** — `seedDemoAccounts.ts:24-29` has 5 roles only |
| warehouse_hub | Yes | Yes (`/signup/warehouse-hub`) | pages exist (`app/warehouse-hub/**`) | **No** |
| manager | Yes | **No self-signup page** — admin-created only via `POST /api/admin/managers` (`admin.routes.ts:35-40`) | **No dedicated `/manager/*` route tree exists at all** | No |
| admin | Yes | No (seed script) | BUILT, live-verified | Yes (`seedAdmin.ts`) |

**fleet_owner / warehouse_hub / manager: unverified live** — no credentials exist on production and none were created this pass (would require going through real signup or an admin-created manager account; not done given time budget).

**Role switcher:** **MISSING**. `User.roles: Role[]` exists on the model (`User.ts:16-20`) with a comment claiming "the role switcher reads this" — but `client/src/lib/auth-context.tsx` never reads `roles`, and no switcher component exists anywhere in `client/src/app` or `client/src/components` (grep confirmed). `role-selection/page.tsx` is a **pre-signup** "who are you" chooser, not an in-session switcher.

### Multilingual

| Item | Finding |
|---|---|
| Library | `next-intl@4.13.7` — real, installed, configured (`client/src/i18n/request.ts`) |
| Locale files | `en.json` / `hi.json` / `te.json`, **283 leaf keys each** — 100% key parity |
| Translation quality | Genuinely translated Hindi/Telugu, sampled and spot-checked (`nav`, `marketing.home`, `marketing.layout` — see body). **Not** copy-pasted English. Verified live: switched the production homepage to Telugu mid-session (no reload) via the language pill, full hero/trust/CTA content rendered in real Telugu | 
| Adoption rate | **23 of 156** component/page files (`.tsx`) call `useTranslations`/`getTranslations` = **~15% of files** actually wired. The other 85% render hardcoded English regardless of locale cookie. |
| Persistence | Cookie-based (`NEXT_LOCALE`, 1yr maxAge, `client/src/i18n/setLocale.ts:13-18`) — confirmed set live |
| Mid-session switch | Confirmed working live without full navigation |
| Server-side messages (API errors, validation) | **English-only** — spot-checked `server/src/utils/ApiError.ts` and controller error strings, all hardcoded English literals, no i18n on the server at all |
| Numbers/dates/currency | ₹ used correctly everywhere sampled. **13 files** use bare `.toLocaleDateString()`/`.toLocaleString()` with no locale argument (11 of them in `client/src/app/admin/**`) — renders in the *browser's* default locale, not guaranteed `en-IN`/DD-MM-YYYY. Contrast: every customer/worker-facing date I could find explicitly passes `'en-IN'`. |
| Verdict | **Partially trilingual.** The infrastructure and the ~15% of surface that adopted it are real, live, and correctly translated — not decorative. But the large majority of the app (most role dashboards, most admin pages) is English-only regardless of locale choice. Server-side text is 0% localized. |

### The 24 extended features

| # | Feature | Classification | Evidence |
|---|---|---|---|
| 1 | Load board / open marketplace w/ bidding | **MISSING** | No `Bid` model, no bid-related route/controller anywhere in repo (exhaustive grep) |
| 2 | Digital BOL, signature + PDF | **PARTIAL** | `LoadManifest.ts` + `loadManifest.controller.ts` real; signature capture real (canvas→PNG→Cloudinary, `loadManifest.controller.ts:60-87`, `MAX_SIGNATURE_BYTES` enforced). **No PDF generation anywhere** — grep for "pdf" across both files: zero hits |
| 3 | Multi-stop route optimizer | **MISSING** | `Booking.ts` has exactly one `pickupLocation` + one `dropLocation`, no stops array, no route-optimization service |
| 4 | Fleet management (roster/assign/health score) | **BUILT** | `Fleet.ts`, `fleet.controller.ts` — live-tested: driver role correctly `403`s (`fleet_owner`-only RBAC confirmed live) |
| 5 | Fleet maintenance scheduler w/ fault codes | PARTIAL — *unverified in depth*; `MaintenanceSchedule.ts` model + `fleet-owner/maintenance/page.tsx` exist; fault-code taxonomy not inspected this pass |
| 6 | Vehicle inspection & compliance (4-angle + checklist + gating) | **PARTIAL** — the single most important finding of this audit | Model real (`VehicleInspection.ts` — 4 required photo angles, checklist array, verdict). Submitting a failing inspection **does** flip `Vehicle.complianceStatus` (`fleet.controller.ts:339`). But `Vehicle.ts:29-35`'s own comment admits, verbatim: *"job matching (`matching.service.ts`) does not currently read this field, so it does not yet actually block a non-compliant vehicle from being offered work."* Grep confirms: zero references to `complianceStatus` outside `fleet.controller.ts`. **A vehicle that fails inspection can still be dispatched.** |
| 7 | Warehouse hub dashboard (docks/gate/ETAs) | PARTIAL — *unverified in depth*; `DockSlot.ts`, `GateEvent.ts`, `WarehouseHub.ts` models + `warehouseHub.controller.ts` + `warehouse-hub/dashboard/page.tsx` exist; no warehouse-hub demo account to verify live |
| 8 | Training academy, sequential unlock | PARTIAL | Real model/route (`TrainingModule.ts`, `training.controller.ts`), live-verified `GET /api/training/progress` returns `200 {"modules":[]}` — **empty on production**. `seedTrainingModules.ts` exists but was evidently never run against the prod DB. Sequential-unlock logic not inspected in depth this pass |
| 9 | Certification + QR verification | PARTIAL | `Certification.ts` model + `QRCodeDisplay.tsx` component (real `qrcode` npm lib, not a placeholder image) exist; live `GET /api/training/certifications` returns `200 {"certifications":[]}` on prod — nothing to display, same "empty because never seeded" pattern |
| 10 | Worker referral dashboard | **BUILT** | Live-verified: `GET /api/referrals/me` on prod returns a real generated code + shareable link (`{"code":"FYROC7A681","link":"https://fyro.vercel.app/signup?ref=FYROC7A681",...}`) |
| 11 | Fraud/security alerts | **PARTIAL** | Admin review workflow (`fraud.controller.ts`) is real: list/investigate/resolve, audit-logged, admin-only RBAC. **But nothing in the codebase ever creates a `FraudCase` or `FraudSignal`** — grep for `.create(` on either model: zero hits anywhere. Live-verified: `GET /api/admin/fraud/cases` → `{"cases":[]}`. There is no detector; the review queue is real but permanently empty by construction. |
| 12 | Financial transaction ledger, append-only | **PARTIAL** | Genuinely append-only by construction: `ledger.service.ts`'s doc comment: *"the ONLY way anything should ever write to LedgerEntry — there is deliberately no update/delete path."* Real, correct design. But its own comment also admits (at time of writing) it was *"not yet wired into real booking/payment/payout flows."* Current reality: the **only** caller found is `payout.controller.ts`'s mark-paid step. Since nothing ever creates a `Payout` (see #23), the ledger is live-verified empty: `GET /api/admin/ledger` → `{"entries":[],"total":0,...}` |
| 13 | Tax & regulatory docs (Indian FY/GST/TDS) | MISSING — *unverified exhaustively*; no GST/TDS-specific model or controller found in the grep sweep of models/controllers |
| 14 | Dispute & refund resolution | **PARTIAL** | Real admin workflow (`dispute.controller.ts`: list/create/message/resolve, audit-logged). **`createDispute` is admin-only** (mounted only at `/api/admin/disputes`) — no customer/worker self-service path to raise a dispute exists; disputes must be opened manually by an admin. Live-verified `GET /api/admin/disputes` → `{"disputes":[]}` |
| 15 | Emergency/SOS hub | PARTIAL — *unverified in depth*; `client/src/components/ui/SOSButton.tsx` exists and referenced from multiple worker-facing pages (grep hit list includes driver/hamali dashboards); press-and-hold behavior and live-location-share on trigger not traced end-to-end this pass. No "911" found anywhere (good — correct 112/108/100 convention appears respected by the absence of the wrong number, not independently confirmed present) |
| 16 | Insurance claims portal | **BUILT** | Real worker-facing (`insurance.routes.ts`: file claim, view own claims — IDOR-scoped to `req.user!.id`) + admin review (`adminInsuranceRouter`, payout amount bounded `isFloat({min:0})`). Live-verified `GET /api/insurance/me` → `200` with real (empty) shape |
| 17 | Parametric insurance, automatic triggers | **PARTIAL** | Real, careful, idempotent engine (`parametricInsurance.service.ts`) — computes actual trailing earnings from real completed bookings (not fabricated), evaluates threshold, is period-idempotent (can't double-fire). Honest about its own gap: `condition: 'days_unable_to_work'` has no backing data source and is explicitly evaluated as `false`/`0` rather than faked. **Critical gap: firing a trigger never creates a `Payout` or `LedgerEntry`** — it only flips a boolean/timestamp on its own internal `trigger.events` sub-array. The "automatic payout" is a status flag, not a real disbursement. |
| 18 | Performance analytics & heatmaps | **BUILT** | `analytics.controller.ts` — real Mongo aggregations, no fabricated numbers (own comment confirms), live-verified against real data from this session's actual test booking (`revenue: 257.74`, matching the real fare) |
| 19 | Regional surge & zone management | **BUILT** | `SurgeZone.ts` + `surge.service.ts` + `surgeZone.controller.ts`, live-verified `GET /api/admin/surge-zones` → `200` real shape |
| 20 | Operations manager hub | **BUILT** | `opsHub.controller.ts`, live-verified `GET /api/admin/ops-hub` → real data: an actual flagged late-pickup pulled from a genuine booking, not a mock |
| 21 | Advanced reporting w/ scheduled exports | **PARTIAL** | `GET /api/admin/reports/export?source=ledger\|bookings` is real, admin-only, CSV export (`reports.routes.ts`). **"Scheduled"** is not: on-demand only, no cron, no email delivery mechanism found |
| 22 | System audit trail, immutability | **BUILT** | `writeAuditLog` is the only writer (pattern-matched everywhere), live-verified `GET /api/admin/audit-log` returns a real entry from an action taken earlier this session (`fare_rule_created`) — no update/delete route exists for `AuditLog` (grep confirmed no `auditLog.controller` update handler) |
| 23 | Payout approvals & incentive management | **PARTIAL** | Approval workflow real (`payout.controller.ts`: approve/reject/mark-paid, correctly creates a `LedgerEntry` on mark-paid). **Nothing anywhere ever creates a `Payout` document** — grep for `Payout.create`/`new Payout(` across the entire server: zero results. Live-verified `GET /api/admin/payouts` → `{"payouts":[]}`. The approval queue is real but structurally unreachable — there is no producer. |
| 24 | Cargo verification photos (pickup+delivery) | **BUILT** | `PhotoProofCapture.tsx` (built earlier this session), live-verified end-to-end this session: upload gates the "Start trip"/"Mark delivered" buttons, real Cloudinary URLs persisted, visible on customer track page |

**Extended features scorecard: 4 of 24 cleanly BUILT, 12 PARTIAL (real backend, missing producer/consumer or a documented gap), 2 MISSING, 6 unverified in depth.**

### The 8 "AI agents"

**Headline finding, checked exhaustively: there is no AI/LLM SDK anywhere in this codebase.** `grep -rli "openai|anthropic|@anthropic-ai|gpt-|claude-|\bllm\b|chatcompletion"` across the entirety of `server/src` and `client/src` returns **zero matches**. Neither `server/package.json` nor `client/package.json` lists any model-provider SDK. There is no `agent` file, folder, or naming convention anywhere in the repo (`find . -iname "*agent*"` outside `node_modules`/`.git`: empty).

| # | Agent | Classification | Evidence |
|---|---|---|---|
| 1 | Support Agent (multilingual, reads records, escalates) | **MISSING** | `customer/support/page.tsx` is a static hardcoded 3-item FAQ array + a plain complaint-filing form against `/api/complaints`. No chat, no reading-and-responding behavior, no model call. |
| 2 | Dispute Triage Agent | **MISSING** | `dispute.controller.ts` is 100% human-driven CRUD (admin lists/creates/messages/resolves). No evidence assembly, no recommendation, no scoring anywhere. |
| 3 | Fraud Detection Agent | **MISSING** | See extended-feature #11 — `FraudCase`/`FraudSignal` are real models with a real admin review UI, but nothing ever populates them. No clustering, no signal detection, no explanation generation exists. |
| 4 | Demand Forecasting Agent | **MISSING** | `analytics.controller.ts`'s "heatmap" is backward-looking historical aggregation only (own comment: "every number here is a real aggregation... nothing fabricated" — of the *past*). No prediction, no surge recommendation logic. |
| 5 | Pricing & Quote Agent (irregular loads, admin-approved) | **MISSING** | `fare.service.ts` is a deterministic base+distance+surge formula against `FareRule` records — real, but a fixed formula, not an agent handling irregular/ambiguous loads with an approval step. |
| 6 | Onboarding & Document Agent (KYC pre-check) | **MISSING** | See below — there isn't even a document *upload* endpoint (Section D), so there is nothing for a pre-check agent to run against. |
| 7 | Market Insights Agent (fleet owner narrative) | **MISSING** | No narrative/text-generation surface found anywhere in fleet-owner pages; `fleet-owner/dashboard` renders structured metrics, not generated prose. |
| 8 | Parametric Payout Agent (autonomous, bounded, triggered) | **PARTIAL, and not "AI"** | `parametricInsurance.service.ts` genuinely is autonomous (fires without a human approval step, on every dashboard poll — `GET /api/insurance/me` calls `checkParametricTriggers` inline) and genuinely bounded (fixed `payoutAmount` per trigger, idempotent per period). It is a deterministic threshold rule, not a model, has no confidence score, and — critically — its "payout" never touches `Payout` or `LedgerEntry` (see extended-feature #17), so even the one agent with real autonomous-execution logic doesn't move real money. |

**AI agents scorecard: 0 of 8 are AI in any sense. 1 of 8 (Agent 8) has a real autonomous rule-engine standing in for it, itself incomplete at the money-movement step. 7 of 8 have no code at all.**

**Guardrail checks (per the brief):**
- Confidence scores on agent output: N/A — no agent output exists to score.
- Evidence surfaced vs. verdict-only: N/A.
- Can any agent execute payout/suspension/refund/fare-override/account-deletion without human approval? **The only candidate (Agent 8) is bounded and doesn't move real money (see above), so no violation exists — but only because the feature is incomplete, not because a guardrail was deliberately engineered.** No violation found; also no guardrail code found, because there's nothing to guard.
- Do agents enforce the same RBAC/IDOR as normal routes? N/A — no agent routes exist to test.
- Agent recommendations + human decisions written to audit log? Human decisions: **yes**, consistently (`writeAuditLog` called from `fraud.controller.ts`, `payout.controller.ts`, `kyc.controller.ts`, `dispute.controller.ts` — all spot-checked). Agent recommendations: N/A.
- Agent 8 caps/kill-switch/idempotency: **Idempotency: yes, proven** — `checkParametricTrigger`'s `periodIndexFor` + `trigger.events` lookup means a second call in the same period returns the stored event and performs no new check (`parametricInsurance.service.ts:118-130`). **Per-worker/global daily caps: no** — nothing aggregates across workers or across a day; only the single trigger's own `payoutAmount` bounds a single event. **Kill switch: no** — `active: boolean` exists per-trigger (can disable one trigger) but no platform-wide emergency stop.
- AI-generated content labeled as AI: N/A — none exists.

### Design fidelity

| Item | Finding |
|---|---|
| Design tokens | Real — CSS custom properties in `client/src/app/globals.css` (`--color-primary`, `--color-primary-600`, etc.), mapped through `tailwind.config` |
| Syne/Outfit fonts | *unverified this pass* — not re-checked against `layout.tsx` font loading |
| Hardcoded hex in components | **16 occurrences** across 8 files (`HeatmapMap.tsx`, `MapPinPicker.tsx`, `RouteMap.tsx` ×5, `Button.tsx` ×2, `ListDivider.tsx`, `QRCodeDisplay.tsx` ×2, `SignatureCanvas.tsx`, `OfferCard.tsx`) — all in SVG/Canvas contexts where CSS vars aren't directly usable (map pin colors, canvas fill), and every value checked matches the token palette exactly (`#BF5020`/`#FF6B2B`/`#0A6F66`/`#0D9488`). Not a color-drift problem, but a maintainability nit: a token change wouldn't propagate to these. |
| Shared component library vs. per-role reimplementation | Shared — `client/src/components/ui/*` (Button, Card, Badge, Avatar, etc.) used consistently across role directories per grep sampling |
| Orange/teal semantic split | Respected everywhere sampled — `accent="primary"` (orange) for truck/driver/admin contexts, `accent="secondary"` (teal) for hamali contexts, consistently threaded through components this session's own work confirmed (`OfferCard`, `RequestCard`, active-job pages) |
| Icons | Consistent outline/stroke-2 set, single hand-rolled file (`client/src/components/ui/icons.tsx`), no icon-library dependency |
| Stitch design comparison | **Not performed** — no Stitch zip was provided in this session; `DESIGN_INVENTORY.md` (referenced by code comments as an 83-screen catalog) exists in the repo but a screen-by-screen fidelity score was not produced |

---

## B. SCORES (0-100, harsh)

1. **Foundation & security: 78** — RBAC/auth/validation genuinely careful and consistent everywhere sampled; the deductions are refresh-rotation not independently retested, rate-limiting confirmed on only one route, and Socket.io auth not re-verified live this pass.
2. **Role coverage: 55** — all 9 roles exist in the data model and RBAC, 6 of 9 have working, live-verified dashboards. fleet_owner/warehouse_hub have real pages but zero live verification (no demo account). manager has no dedicated experience at all beyond admin-created permissions. No role switcher despite the data model implying one should exist.
3. **Profile completeness: 40** — *this pass did not do the full per-role, per-field static+live grid the brief asked for; scoring conservatively based on what was directly observed this session and earlier sessions (document-expiry nudges real and wired; document *upload* is not — see Section D). Treat this number as a rough floor, not a verified average.*
4. **Core booking & dispatch: 82** — this is the most mature part of the app: fare math, sequential offers, accept/reject, live GPS broadcast, masked-phone discipline (chat-only contact, no raw numbers — verified this session), photo proof, and mandatory two-way ratings are all real and were live-verified end-to-end multiple times this session (search→accept→in-transit→deliver→rate→earnings-post). Deduction for the driver/hamali browse-list willingLocation bug found and fixed this session, and for scheduled-vs-instant not confirmed.
5. **Extended features: 4/24 cleanly BUILT, effectively ~35/100** — the pattern across nearly every "PARTIAL" item is identical and structural: a real, careful data model + a real, RBAC-correct admin review surface, with the thing that's supposed to *produce* records into that model (a detector, a trigger, a payout generator) either missing or documented as a known gap. Volume of real engineering is high; end-to-end functional coverage is low.
6. **AI agents: 0/8 built as AI. Guardrail compliance: N/A (nothing to violate), but reported honestly as 0/8 rather than "compliant."**
7. **Multilingual: 45/100** — infrastructure and translation quality are both genuinely good (not the usual "decorative switcher" failure mode), but real component-level adoption is ~15%, and 0% of server-side text is localized.
8. **Localization correctness: 85** — clean on currency/units/emergency-number conventions everywhere checked; the deduction is the 13 files using locale-naive date formatting, concentrated in the admin console.
9. **Design fidelity: 75** — consistent token system, semantic color discipline, shared components; no Stitch comparison was possible this pass, and 16 hardcoded (but on-token) hex values are a minor debt.
10. **Quality & safety: 60** — RBAC/IDOR discipline is consistently good everywhere sampled (server-side `req.user!.id` scoping, one empirical cross-role test passed), 153/153 server tests pass — but that test suite covers only the original Phase-2 core; zero test files exist for any of the 24-extended-feature wave (fraud, dispute, insurance, training, referral, ledger, payout, ops-hub, surge, analytics, warehouse-hub, fleet, load-manifest, audit-log, kyc). Zero client tests exist at all.

**OVERALL: 58/100.**

Weighting: booking/dispatch and foundation carry the most weight (40% combined) because that's the actual product a user transacts through, and both are strong. Extended features and AI agents carry real weight (30% combined) because they were explicitly commissioned and are mostly absent or non-functional at the point that matters (money/detection actually moving). Multilingual, design, and quality/safety make up the rest. A system that works well for its core loop but has an entire AI layer that doesn't exist and a payout/ledger/fraud pipeline with no producers is not a minor gap — it's the majority of what was asked for in Sections 5 and 6.

---

## C. WHAT'S ACTUALLY BUILT

- Full customer→driver/hamali booking lifecycle: create, fare (server-computed, itemized), sequential offer/accept/reject, photo proof gate, live GPS broadcast during transit, in-app chat (no raw phone numbers exposed), mandatory two-way rating, earnings posting. Verified live end-to-end this session on production, twice (truck + hamali bookings).
- RBAC and route protection: consistent across all 33 route files, verified live (driver correctly `403`s on fleet-only routes; cross-role booking access correctly `403`s).
- Willing-location wider-radius matching (built this session), now correctly wired into the actual browse endpoint after a bug fix.
- KYC review **workflow** (admin approve/reject, audit-logged) — real, but see Section D for what's missing upstream of it.
- Referral codes/links — real, live-verified.
- Analytics, ops-hub, surge zones, audit log — all real aggregations/records against live data, not fabricated.
- Payment: real Razorpay integration code path exists (order creation, HMAC-verified webhook) behind an env-flag mock fallback; production is currently running in mock mode (no live Razorpay keys configured) — the mock-capture endpoint literally 404s if `MOCK_EXTERNAL_SERVICES` isn't set, specifically so it can never be mistaken for a real payment (`payment.controller.ts:103-107`).
- next-intl multilingual infrastructure — real, live-verified mid-session switch to genuine Telugu.
- 153/153 server tests passing, covering the original core.

## D. WHAT'S FAKE / STUBBED / UNREACHABLE

This is the section that matters most, per the brief.

1. **`DocumentUploadCard.tsx` is dead code.** Real-looking component (FASTag/PUC/Aadhaar/PAN/GSTIN labels, upload gating logic) — zero callers anywhere in the app (`grep -rln "DocumentUploadCard" app components` outside its own file: empty, not even referenced in the styleguide). There is **no way for any user to upload a KYC document through this application.**
2. **`kycStatus` gates nothing.** Every account defaults to `'pending'` on creation and stays there forever unless an admin manually flips it — confirmed live: the admin seed account itself sits in `kycStatus: 'pending'`. Nothing in `availability.controller.ts`, `requests.controller.ts`, or anywhere else checks it before letting a worker go online or accept a job.
3. **Fraud detection has no detector.** The admin fraud-case review queue is a real, correctly-secured feature with nothing to review — confirmed live (`{"cases":[]}`), and confirmed in code that nothing ever calls `.create()` on `FraudCase`/`FraudSignal`.
4. **The financial ledger has no producer beyond one path.** `LedgerEntry` is correctly append-only, but the only thing that ever writes to it is `payout.controller.ts`'s mark-paid step — and nothing ever creates a `Payout` to approve in the first place (zero `Payout.create` call sites in the entire server). Confirmed live: ledger and payout queue both empty on production.
5. **Parametric insurance "automatic payout" doesn't pay anything.** It correctly computes real trailing earnings and correctly, idempotently decides whether a trigger fired — then records that fact only on its own internal sub-document. No `Payout`, no `LedgerEntry`. A worker whose trigger fires sees `triggered: true` in an API response and nothing else happens financially.
6. **Vehicle compliance gating is cosmetic at the dispatch layer.** A vehicle that fails a 4-angle inspection is correctly flagged `non_compliant` and shown as such on the fleet-owner dashboard — and can still be matched and dispatched, because the codebase's own comment admits `matching.service.ts` never reads the field.
7. **Dispute filing is admin-only.** No customer or worker can raise a dispute themselves; only an admin can call `createDispute`. Confirmed empty live (`{"disputes":[]}`).
8. **Training/certification content is unseeded in production.** The mechanism is real; `GET /api/training/progress` and `/certifications` both return empty arrays live because `seedTrainingModules.ts` was never run against the production database.
9. **All 8 "AI agents" are fully absent as AI** — zero LLM SDK dependency anywhere in the repo, confirmed by exhaustive grep across both packages. Where a feature *sounds* like an agent (parametric payout), it's a plain deterministic threshold check, not a model, and it's incomplete besides (see #5).
10. **Digital BOL has no PDF generation** despite signature capture being real.
11. **No role switcher**, despite `User.roles[]` and a code comment claiming one reads it.

## E. WHAT'S MISSING (grouped)

- **Section 5:** load-board/bidding (#1), multi-stop routing (#3), Indian tax/GST/TDS documents (#13 — not exhaustively confirmed absent, but nothing found).
- **Section 6:** all 8 AI agents as actual AI (7 have zero code; 1 has a rule-engine stand-in, itself incomplete).
- **Section 2:** in-session role switcher; dedicated manager dashboard/route tree; live-verifiable fleet_owner/warehouse_hub accounts on production.
- **Section 3:** KYC document upload endpoint (the single biggest concrete gap in this whole audit — an entire compliance feature with a review queue and no intake).
- **Section 4:** scheduled vs. instant booking — not found as a distinct concept in `Booking.ts` (*unverified exhaustively*, but no `scheduledFor`-style field was seen in the model read this pass).
- **Section 10:** any client-side test suite (zero files, confirmed).

## F. CRITICAL ISSUES (top 15, ranked by real-user impact)

1. **No KYC document upload path exists.** Every "verified worker" claim the platform could make is currently untrue in production — nobody can submit ID docs. *Fix: wire `DocumentUploadCard` to a new `POST /api/kyc/documents` endpoint that appends to `kycDocs` and flips status; the component and the review queue already exist on both ends.* Medium effort (1-2 days).
2. **Nothing gates worker availability on KYC status.** Combined with #1, this means the "verified before they earn" trust claim (made on the marketing Safety page — and correctly *not* made, this audit confirms that copy was deliberately written to avoid this exact overclaim earlier this session) is genuinely absent from the product, not just under-marketed. *Fix: one-line check in `availability.controller.ts`'s `setAvailability`.* Small effort.
3. **A vehicle that fails a compliance inspection can still be dispatched.** Real safety-relevant gap, not cosmetic — codebase's own comment documents exactly the one-line fix (`matching.service.ts`, `vehicle.complianceStatus !== 'non_compliant'`). Small effort, high severity.
4. **Parametric insurance triggers "pay" without any money moving.** A worker could be told their income-protection insurance paid out when it didn't. *Fix: on `triggered: true`, call `writeLedgerEntry` + create a `Payout`.* Medium effort.
5. **Fraud detection queue has no detector feeding it.** The "fraud alerts" feature is a review UI for a queue nothing ever populates. *Fix requires actually building signal detection logic (rate-of-cancellation, GPS-jump, rapid-account-creation, etc.) — real work, not a wiring fix.* Large effort.
6. **Payout pipeline has no producer.** Same shape as #5 — an approval workflow for requests nobody generates. *Fix: a periodic or on-demand job that turns `computeTrailingEarnings` into pending `Payout` docs per worker per period.* Medium effort.
7. **All 8 AI agents are unbuilt.** If this was a headline deliverable of the spec, it is the largest single gap in the entire audit. *Fix: real scope decision needed — this is not a bug, it's unstarted work requiring an LLM integration decision.*
8. **No customer/worker-initiated dispute path.** Someone with a real grievance beyond "file a complaint" has no self-service escalation. *Fix: expose a scoped `createDispute` off the existing complaint flow.* Medium effort.
9. **Digital BOL has no PDF.** Undermines the "digital paperwork" pitch for fleet/warehouse customers specifically. *Fix: a PDF-generation library (e.g., pdf-lib) rendering the existing `LoadManifest` fields + signature image.* Medium effort.
10. **fleet_owner/warehouse_hub have zero live verification and no demo accounts.** Two of nine roles are essentially unaudited in production; the audit cannot say whether their dashboards actually render real data. *Fix: extend `seedDemoAccounts.ts`.* Small effort, should happen before any of those roles ship.
11. **No manager experience beyond admin-granted permissions.** A created manager account has nowhere dedicated to work from. *Unverified exactly how a manager's login redirects — worth a direct check.*
12. **Multilingual coverage is ~15% by file count.** A Telugu/Hindi-speaking user of most role dashboards (driver requests, hamali earnings, admin console, etc.) sees English regardless of language choice. *Fix: mechanical but large — thread `useTranslations` through the remaining ~85% of components.* Large effort.
13. **Server-side messages are 0% localized.** Every API error a non-English speaker hits is in English. *Fix: needs a server-side i18n message catalog, currently doesn't exist at all.* Medium-large effort.
14. **Admin console dates use browser-locale formatting**, not pinned `en-IN` — inconsistent with the rest of the app and genuinely wrong on a non-Indian-locale browser. *Fix: 13 one-line changes.* Quick win.
15. **Zero test coverage for the entire extended-feature wave** (fraud/dispute/insurance/training/referral/ledger/payout/opsHub/surge/analytics/warehouseHub/fleet/loadManifest/auditLog/kyc) and zero client tests anywhere. Given how many of the gaps above are exactly the kind a test would have caught (dead component, unwired gate, empty-by-construction queue), this is a process problem as much as a code one.

## G. SECURITY FINDINGS

- **No IDOR violations found** in everything sampled — every "my data" controller checked (`earnings`, `insurance`, `referral`, `bookings`, `payments`) filters by `req.user!.id` server-side, never trusts a client-supplied user id. One live empirical test (driver attempting a customer-scoped booking route) correctly returned `403`.
- **No client-side money math found** — `fare.service.ts` is the sole source of truth, `payment.controller.ts` explicitly always uses the server-stored `fareBreakdown.total`.
- **`updateClaimStatus`'s `payoutAmount`** is validated as `isFloat({min: 0})` only — non-negative, but no upper bound. Low severity: admin-only route, already a trusted actor, but worth a sanity cap given it feeds a real financial figure.
- **RBAC is consistently applied** — every route file gates via `verifyJwt` at minimum; admin/manager-only surfaces additionally gate via `requireRole('admin')` or `requirePermission(...)`, spot-checked on `admin.routes.ts`, `fraud.routes.ts`, `insurance.routes.ts`, `kyc.routes.ts`, `reports.routes.ts`.
- **No exposed raw phone numbers found** — chat-only contact confirmed both in code comments (`focusChat` — "no telephony/SMS-masking vendor is wired up... doesn't pretend to place a masked call") and in this session's live testing of driver/hamali/customer contact cards.
- **No agent permission violations** — moot, since no agent code exists to violate anything.
- **Duplicate Mongoose index warning** (`{"order":1}`) surfaced during the test run — not a security issue, a hygiene one (declared via both `index: true` and `schema.index()` somewhere) worth a quick fix.

## H. QUICK WINS (under an hour each)

- Wire `matching.service.ts` to reject `complianceStatus === 'non_compliant'` vehicles (the fix is documented verbatim in the codebase's own comment).
- Add a KYC-verified check to `availability.controller.ts`'s `setAvailability` (once #1 in Section F exists to make it meaningful — otherwise this alone locks everyone out, since nobody can currently get verified).
- Fix the 13 locale-naive `toLocaleDateString()`/`toLocaleString()` calls in the admin console to pass `'en-IN'`.
- Run `seedTrainingModules.ts` against production so the training/certification screens have something to show.
- Extend `seedDemoAccounts.ts` with fleet_owner and warehouse_hub entries.
- Resolve the duplicate `{"order":1}` Mongoose index warning.
- Add an upper bound to `payoutAmount` validation in `insurance.routes.ts`.

## I. STRUCTURAL PROBLEMS (need real rework)

- **The producer/consumer gap pattern.** Fraud, payout, and (partially) dispute all share the same shape: a well-built admin review surface with nothing generating records for it to review. This isn't fixable feature-by-feature with quick patches — it needs an actual decision about where detection/generation logic lives (a scheduled job? real-time triggers on existing events? a rules engine?) and then real implementation, not wiring.
- **The AI agent layer doesn't exist and needs a real build**, including a decision on which model provider, cost/latency budget, and — critically, given the guardrail requirements in the spec — a permission/audit layer around agent actions that currently has nothing to attach to.
- **Multilingual adoption at the component level** is a large, mechanical, but genuinely big lift (85% of files) — not a design problem, a completion problem.
- **Server-side i18n** doesn't exist as a concept at all (no message catalog, no locale-aware error formatting) and would need to be designed from scratch, not extended.

## J. BUILD ROADMAP

**Tier 1 — ship-blockers** (these make existing "built" features honest):
1. KYC document upload endpoint + wire `DocumentUploadCard` (1-2 days)
2. KYC-verified gate on `setAvailability` (small, do right after #1)
3. Compliance gate in `matching.service.ts` (< 1 hour, safety-relevant)
4. Parametric insurance → real `Payout`/`LedgerEntry` on trigger (0.5-1 day)
5. Seed training modules + fleet_owner/warehouse_hub demo accounts on prod (< 1 hour)

**Tier 2 — important** (close the biggest functional gaps):
6. Fraud signal detection (real work: define signals, build the detector) (1-2 weeks)
7. Payout-generation job from `computeTrailingEarnings` (2-4 days)
8. Customer/worker-initiated dispute path off the complaint flow (1-2 days)
9. BOL PDF generation (1-2 days)
10. Decide AI-agent scope and build at least the highest-value 1-2 agents (Support, Dispute Triage are the most user-visible) with real guardrails from day one (weeks, needs its own plan)

**Tier 3 — polish**:
11. Multilingual component adoption sweep (large, mechanical, can be chunked per role)
12. Server-side i18n message catalog
13. Admin console date-locale fixes
14. Client test suite (currently zero)
15. Test coverage for the entire extended-feature wave
16. PDF/QR/manager-dashboard/role-switcher polish items

## K. THE BIGGEST GAP, AND WHY

The biggest gap between spec and reality is not any single missing feature — it's that **the codebase consistently built the "boring but hard" half of each feature (data model, RBAC, audit logging, admin review UI) and consistently left out the "what actually makes it real" half (the producer that populates the queue, the gate that enforces the flag, the money that actually moves).** Fraud cases, payouts, parametric payouts, compliance gating, KYC gating, disputes — every one of these follows the identical shape: real infrastructure, no trigger.

The read on why: this is exactly the failure mode of building breadth-first against a large spec under time pressure across many parallel work items (the commit history literally calls itself "6 rebuild waves" mounting many routers at once). Each feature's *shape* — model, controller, route, RBAC, audit log — is fast to produce and looks convincing in a page-by-page review, especially live, because the admin screens genuinely work and genuinely show real (if empty) data instead of mocked data. What's slow and easy to skip under pressure is the unglamorous second half: the thing that actually calls `.create()` on the record in the first place, or the one-line gate that makes a flag matter. The AI-agent layer is the most extreme version of the same pattern taken to its limit — the entire layer was scoped, named, and given placeholder "screens don't exist yet either" status, but zero implementation work happened because it's the highest-effort, most novel piece of the spec and was apparently never reached.
