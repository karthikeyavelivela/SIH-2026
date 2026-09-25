# FYRO — Build Audit against the SIH26089 presentation

Audited commit: `43dda15` on `main`, 2026-09-25. Read-only audit — the only file written to the repo is this report.

**Method.** Endpoint, model and screen inventories were extracted by script from source: route files × `app.use` mounts × router-level middleware, taking Express's rule that `router.use()` covers only routes registered after it; every handler resolved to its controller line; client call sites matched per endpoint, including `${…}` segments. Every claim below was then checked by reading the code it cites. "NOT FOUND" means a case-insensitive search of `server/src`, `client/src` and `shared/src` returned nothing. Production configuration (Render and Vercel dashboards) could not be read from here, so any statement that depends on it says so.

---

## 1. Executive summary

- **Solid:** the full booking loop — quote, instant or scheduled booking, geo-matching, live location and chat, rating, earnings. It runs on 260 mounted, JWT-guarded endpoints across 57 models, backed by 659 tests (**605/605 server, 54/54 client — all passing**). The cooperative core is real code: societies, invite codes, polls, surplus distribution, district caps and federation dashboards.
- **Mock:** payments. No client code ever opens Razorpay Checkout; "Pay" calls `/mock-capture`. That route 404s once `MOCK_EXTERNAL_SERVICES=false`, and the working Cloudinary uploads seen in production imply it is false there — so online payment is very likely broken live.
- **The claims don't match the code on money:** the fee is deducted from the worker (1% platform + society-set rates), not added on top. No 5/3/1/1 split exists. The only automatic "welfare" payout triggers on one worker's own earnings — the opposite of the demand-indexed pool on the slides.
- **Not built at all (zero references):** Aadhaar e-KYC, DigiLocker, e-Shram, police verification, Bhashini, SMS/IVR, ONDC, PMSBY/PMJJBY, Redis, and customer-confirmed completion.
- **AI is LLM prompting over real DB data plus rule-based fallbacks.** No XGBoost, OR-Tools, Isolation Forest, OCR engine or vector RAG exists. Production runs Gemini, not Llama.
- **Security:** no secrets are committed. Aadhaar/PAN images are stored on Cloudinary with **public** delivery URLs. The webhook skips signature checks whenever its secret is unset. The per-IP login limit is ineffective behind Cloudflare, though a per-account limit covers login brute force.
- **Judge-visible gaps to fix first:** online payment, customer confirmation of completion, and the wage-floor dataset expiring 2026-09-30.

---

## 2. Claim matrix

| # | CLAIM | STATUS | EVIDENCE | WHAT'S MISSING |
|---|---|---|---|---|
| 1 | Customer booking — on-demand and scheduled slot | **BUILT** | `controllers/booking.controller.ts` (createBooking); `models/Booking.ts:161,245` `scheduledFor`; `services/scheduledBooking.service.ts:45` 60 s release loop | The release loop is an in-process `setInterval`; on Render's free tier it stops whenever the instance sleeps. |
| 2 | Geo-location matching (nearest available verified worker) | **BUILT** | `services/matching.service.ts:34,82` `$near` on 2dsphere; `controllers/availability.controller.ts:72-76` blocks going online until the role's KYC docs are verified; `services/workerEligibility.ts` skill filter | Verification is manual document review (see 27). No ranking beyond distance. |
| 3 | Emergency / urgent booking dispatch | **NOT BUILT** | `controllers/emergency.controller.ts:23` is an SOS alert to admins, not a dispatch mode. No priority or urgent field on `models/Booking.ts`. | Urgent flag, priority matching, surge-to-urgent. |
| 4 | Four pricing modes: hourly, per unit, per task, quotation | **BUILT** | `shared/src/types.ts:114` `PRICING_MODES`; `services/workPricing.service.ts:284` `priceWork`; quotation flow with visit, milestones and variations in `controllers/quotation.controller.ts` | — |
| 5 | AP minimum-wage floor check, blocking below-floor rates | **PARTIAL** | `services/wageFloor.service.ts:183` `assertAtOrAboveStatutoryFloor` (422); `:309-330` data source | Figures come from a *secondary compilation* (gazette not retrieved) for "Shops and Commercial Establishments", not domestic or agricultural work. **`effectiveUntil` is 2026-09-30**, and `wageFloorFor` (`:124-129`) ignores dates, so a stale floor keeps being enforced. Per-task and per-unit rates are not checked (`:140-149`). |
| 6 | Fare breakdown shown before confirmation | **BUILT** | `controllers/booking.controller.ts:152` `quoteBooking` (same pricing function as create); `client/src/components/booking/FareCard.tsx` | — |
| 7 | Live tracking and two-way chat | **BUILT** | `realtime/handlers.ts:88` `booking:location`, `:119` `booking:chat_message` (persisted in `models/ChatMessage.ts`); track page polls every 8 s as a fallback | Worker location streams only while `in_progress`. |
| 8 | Job completion confirmed by the customer | **NOT BUILT** | `controllers/requests.controller.ts:290` `completeJob` is called by the assigned **worker** and sets `completed` directly | Customer confirmation or dispute window before completion; OTP or sign-off. |
| 9 | Two-way rating and feedback | **BUILT** | `models/Rating.ts` (from→to user or Mutha); `controllers/rating.controller.ts:54`; `services/ratingGate.service.ts:13` blocks the next booking or accept until both sides have rated | — |
| 10 | Razorpay and UPI; COD with reconciliation | **MOCK** | `services/payment.service.ts:22` returns `order_mock_*` unless MOCK=false **and** keys are set; `client/src/components/booking/PaymentSection.tsx:36` calls `/mock-capture`; COD confirmed by the worker at `controllers/payment.controller.ts:117` | Razorpay Checkout on the client, UPI intent, a COD reconciliation report (NOT FOUND). See §7 for the production breakage. |
| 11 | GST-compliant itemised invoice | **PARTIAL** | `services/taxInvoice.service.ts:90-91` CGST/SGST split, PDF via pdfkit | Rates labelled "illustrative" (`:9-34,187`); never IGST; platform GSTIN prints "Not yet registered" unless `PLATFORM_GSTIN` is set. |
| 12 | Fee split: worker 100%; 10% fee split 5/3/1/1 | **NOT BUILT** | `services/platformCommission.service.ts` — **1%** deducted **from** the worker's gross; society commission and welfare % (`models/Mutha.ts:70-71`, default 0) also deducted | Customer-side fee, fixed 5/3/1/1 split, welfare pool and guarantee-reserve accounts. The code implements a different model. |
| 13 | Society → District → State hierarchy, ceilings enforced downward | **PARTIAL** | `models/Federation.ts` (state and district, `parentFederationId`); `services/governance.service.ts:166-183` district caps a society's commission/welfare % | The state tier sets no bounds ("unused", `models/Federation.ts:31-36`). No ceiling on service *rates*. |
| 14 | Member voting on society rates | **BUILT** | `models/Poll.ts` types `rate_card`, `rate_floor`, `leader_election`; `controllers/governance.controller.ts:386` `closePoll` applies the winner within the district cap | — |
| 15 | Surplus returned to members as equity | **BUILT** | `controllers/governance.controller.ts:213` `distributeSurplusForSociety`; `models/SurplusDistribution.ts`, `models/MemberShare.ts`; `tests/governance.test.ts` | — |
| 16 | Leader-first onboarding with invite codes | **BUILT** | `controllers/auth.controller.ts:152` leader signup creates the Mutha with a random invite code; `joinType: 'member'` joins by code | — |
| 17 | Leader books on behalf of members without phones | **NOT BUILT** | Every member signs up with their own phone (`routes/auth.routes.ts` signup/hamali); the leader can only assign existing members to a job (`controllers/mutha.controller.ts:287`) | Proxy member records with no phone; leader-initiated booking for them. |
| 18 | Federation administration dashboard (society, district, state) | **BUILT** | `controllers/federation.controller.ts:174,265`; pages `app/federation-district/dashboard`, `app/federation-state/dashboard`, `app/mutha/*` | One screen per federation tier. Creating federations and federation admins is API-only (`POST /api/admin/federations*` has no UI) — seed script or curl. |
| 19 | Immutable audit log of privileged actions | **BUILT** | `services/audit.service.ts:13` is the single writer; 100+ call sites; no update or delete path on `AuditLog` | Immutability is by convention only: no schema hook, DB role separation or hash chain. |
| 20 | Dispute resolution routed to society/federation | **PARTIAL** | Disputes resolved by **admin** (`routes/dispute.routes.ts` `requireRole('admin')`, `controllers/dispute.controller.ts:148`); federation dashboard only *counts* open disputes (`controllers/federation.controller.ts:214`) | Routing to the society leader or federation, and escalation between tiers. |
| 21 | Institutions and bulk contracts | **NOT BUILT** | `client/src/app/customer/book/labour/bulk/page.tsx:37-45` states multi-society dispatch does not exist; no contract, recurring or institution model (NOT FOUND) | Contract entity, recurring schedules, contract invoicing. |
| 22 | Demand-indexed welfare pool (regional shortfall, pro-rata active days, automatic) | **NOT BUILT** | The only automatic payout, `services/parametricInsurance.service.ts:311`, triggers on an **individual's** `earnings_below_threshold`; `days_unable_to_work` is explicitly unimplemented (`:304-310`) | Regional or society demand index, active-days proration, pool account. The existing trigger is the opposite design. |
| 23 | Welfare reserve accumulation | **PARTIAL** | `services/governance.service.ts:129` posts `welfare_fund` ledger entries from a society's welfare deduction % (default 0) | A platform welfare pool; accumulation rules; any payout from the reserve. |
| 24 | PMSBY / PMJJBY enrolment, premium from pool | **NOT BUILT** | PMSBY/PMJJBY NOT FOUND; plans are generic custom products (`scripts/seedInsurancePlans.ts`); enrolment with consent at `controllers/insurance.controller.ts:35` | Government schemes, premium payment, pool funding. |
| 25 | Workmanship guarantee (free re-work, materials only, reserve pays labour) | **PARTIAL** | `services/guarantee.service.ts:83` checks the per-category window and files a `workmanship` Complaint | Re-work dispatch, materials-only billing, guarantee-reserve payout. |
| 26 | Service-provider registration and verification | **BUILT** | Signups in `routes/auth.routes.ts`; KYC upload in `controllers/kycDocument.controller.ts`; admin review at `controllers/kyc.controller.ts:47`; required docs per role in `shared/src/types.ts:54` | — |
| 27 | Aadhaar e-KYC | **NOT BUILT** | UIDAI and e-KYC NOT FOUND; "Aadhaar" is an uploaded image reviewed by a human | UIDAI / KUA integration. |
| 28 | Police verification | **NOT BUILT** | NOT FOUND ("police" appears only in checkpoint seed data) | Entire feature. |
| 29 | DigiLocker | **NOT BUILT** | NOT FOUND | Entire integration. |
| 30 | e-Shram linkage | **NOT BUILT** | NOT FOUND | Entire integration. |
| 31 | Skill profiling and certification (NCCT/NSQF) | **PARTIAL** | Training modules, progress and certifications (`models/TrainingModule.ts`, `Certification.ts`, `TrainingProgress.ts`); skills on `HamaliProfile` | NCCT code is "ILLUSTRATIVE … not pulled from any real NCCT catalog" (`models/TrainingModule.ts:35`); no NSQF levels; no external certificate issuance. |
| 32 | Bhashini (STT, translation, TTS) | **NOT BUILT** | 0 references. i18n is static next-intl JSON (en/te/hi, 3,697 keys each) | Entire integration; no speech features anywhere. |
| 33 | SMS confirmations and IVR | **NOT BUILT** | `services/otp.service.ts:20,49` "no SMS provider … wired"; IVR NOT FOUND | SMS gateway, IVR. |
| 34 | ONDC-interoperable catalogue | **NOT BUILT** | ONDC and Beckn NOT FOUND | Entire integration. |
| 35 | TARA assistant (Llama + RAG), scan-and-diagnose, electrical/gas guardrail | **PARTIAL** | Provider chain Gemini (`gemini-3.6-flash`, `agents/providers/gemini.ts:37`) → Groq Llama (`groq.ts:18`) → Anthropic → rules; context is the caller's own DB records (`agents/tara/context.ts:12`); guardrail enforced in code at `agents/tara/diagnose.ts:38-46`; `POST /api/assistant/ask`, `/diagnose-photo` | No retrieval over a knowledge base (no embeddings or vector store). Llama only runs if `GROQ_API_KEY` is set (it wasn't in production at last check). Human approval: n/a (advice). |
| 36 | Demand forecast (XGBoost) with district cold start | **PARTIAL** | `agents/demandForecastAgent.ts` — 14-day historical booking density plus LLM summary; refuses below 20 bookings (`:13`); `POST /api/agents/demand-forecast` | No trained model; no cold-start baseline (it refuses instead). Training data: live `Booking` rows. |
| 37 | Workforce allocation (OR-Tools, fair shortlist, leader approves) | **NOT BUILT** | Forecast text is re-labelled as "workforce allocation" for leaders (`agents/demandForecastAgent.ts:42`); the leader picks members manually (`controllers/mutha.controller.ts:287`) | Optimiser, skills × availability shortlist, fairness rule. |
| 38 | Pricing check (rules + Isolation Forest) | **PARTIAL** | `agents/pricingQuoteAgent.ts:59` (historical average + LLM); rule detectors in `services/fraudDetection.service.ts:81,106,132`; wage-floor rules | No anomaly-detection model. |
| 39 | Document check (OCR + DigiLocker match) | **PARTIAL** | `agents/documentPrecheckAgent.ts:52` — vision LLM on the uploaded image, else metadata-only; admin still decides | No OCR engine, no DigiLocker match. |
| 40 | Dispute triage (LLM classifier) | **BUILT** | `agents/disputeTriageAgent.ts:17` assembles the evidence packet (chat, photos, timestamps, fare) and the LLM recommends; admin acts via `controllers/dispute.controller.ts:148` (human approval: **yes**) | Output is a recommendation, not a fixed label set. |
| 41 | Market insights (GIS heatmaps) | **BUILT** | `controllers/analytics.controller.ts:24,91-107` real pickup-coordinate aggregation → `client/src/components/map/HeatmapMap.tsx` (Leaflet); `agents/marketInsightsAgent.ts:48` week-over-week | Admin-only. |
| 42 | MongoDB Atlas geo-indexes; cluster region | **PARTIAL** | 2dsphere on Booking (pickup, drop), HamaliProfile, Vehicle, SavedAddress, Checkpoint, HaltEvent, EmergencyAlert, WarehouseHub (§6) | Region: **NOT FOUND in config** (lives inside the secret `MONGODB_URI`). |
| 43 | Horizontal scaling: stateless API, Socket.io Redis adapter, read replicas | **NOT BUILT** | No Redis package in any manifest; offer state is an in-memory `Map` (`realtime/offerEngine.ts:33`); rate limits in-memory; background loops in-process; no read-preference config (`config/db.ts:30`) | Redis adapter, shared rate-limit store, job queue, replicas. |
| 44 | Cloudinary usage | **PARTIAL** | `services/cloudinary.service.ts:47`; uploads: avatars, KYC, proof photos, manifest signatures, inspections, society photo, diagnose photos | **KYC documents (Aadhaar, PAN) go to Cloudinary with default public delivery**, not `authenticated`/`private`. |
| 45 | DPDP-style consent and purpose limitation | **NOT BUILT** | The only consent capture is insurance enrolment (`controllers/insurance.controller.ts:35`) | Signup consent, purpose registry, data export and erasure (account delete exists: `DELETE /api/auth/me`). |

## 3. Status counts

| BUILT | PARTIAL | MOCK | NOT BUILT |
|---|---|---|---|
| **14** | **13** | **1** | **17** |

Endpoints: 260 total — WORKING 221, PARTIAL 10, STUB/MOCK 2, DEAD 27. Screens: 161 total — WORKING 157, PARTIAL 2, STUB/MOCK 1, DEAD 1.

---

## 4. Full endpoint table

### Auth, roles, RBAC, rate limiting

- **Login:** phone + password (bcrypt cost 12, `controllers/auth.controller.ts:28`). OTP exists only for phone-number change, and has no SMS provider.
- **Tokens:** JWT access (15 min) + refresh (7 days, rotated via `tokenVersion`) in httpOnly `Secure` cookies (`SameSite=None` in production). Served first-party through the Vercel `/api` proxy. The client refreshes silently once on a 401, single-flight (`client/src/lib/api.ts`). Sockets use a 2-minute audience-scoped token (`services/token.service.ts`).
- **Roles — exactly 11** (`shared/src/types.ts:1-20`): `customer`, `driver`, `hamali_solo`, `mutha_leader`, `mutha_member`, `manager`, `admin`, `fleet_owner`, `warehouse_hub`, `federation_state_admin`, `federation_district_admin`. "Skilled worker" and "farm labour" are *kinds* of `hamali_solo` (`models/HamaliProfile.ts` `workerKind`), not roles.
- **RBAC:** `middleware/rbac.ts` — `requireRole(...)` (95 uses) and `requirePermission(...)` (8 uses, manager permission sets).
- **Rate limiting:** `middleware/rateLimit.ts`, in-memory. `authLimiter` 5/min per IP+path, `loginAccountLimiter` 10 failures / 15 min per phone, `globalMutationLimiter` (`:130`), and per-feature limiters (geocode, booking create/quote, agents, requests). **Measured:** the per-IP limit never trips in production because `req.ip` resolves to a changing Cloudflare edge address (`app.ts` trust-proxy comment). The per-account limiter does trip.

### Endpoints (260)

Status rules: **WORKING** = handler reads/writes the DB, validated where it takes input. **PARTIAL** = real but missing a key part (named in the note). **STUB/MOCK** = fakes the outcome. **DEAD** = mounted but no UI call site found (API-only). No router is exported-but-unmounted. **AUTH = NO** marks the 10 public endpoints.

| METHOD | PATH | ROUTE FILE | HANDLER | AUTH | ROLES / PERMISSION | LIMITER | VALIDATED | STATUS | NOTE |
|---|---|---|---|---|---|---|---|---|---|
| GET | `/api/addresses` | routes/savedAddress.routes.ts:11 | `listMyAddresses` (controllers/savedAddress.controller.ts:6) | yes | any signed-in | — | n/a | **WORKING** |  |
| POST | `/api/addresses` | routes/savedAddress.routes.ts:13 | `createMyAddress` (controllers/savedAddress.controller.ts:11) | yes | any signed-in | — | yes | **WORKING** |  |
| DELETE | `/api/addresses/:id` | routes/savedAddress.routes.ts:25 | `deleteMyAddress` (controllers/savedAddress.controller.ts:22) | yes | any signed-in | — | yes | **WORKING** |  |
| GET | `/api/admin/analytics/overview` | routes/analytics.routes.ts:12 | `getAnalyticsOverview` (controllers/analytics.controller.ts:15) | yes | perm:view_analytics | — | n/a | **WORKING** |  |
| GET | `/api/admin/audit-log` | routes/auditLog.routes.ts:14 | `listAuditLog` (controllers/auditLog.controller.ts:6) | yes | admin | — | yes | **WORKING** |  |
| GET | `/api/admin/checkpoints` | routes/checkpoint.routes.ts:65 | `listAllCheckpoints` (controllers/checkpoint.controller.ts:228) | yes | admin | — | n/a | **DEAD** | Mounted and implemented, but no UI calls it (API-only). |
| POST | `/api/admin/checkpoints` | routes/checkpoint.routes.ts:66 | `createCheckpoint` (controllers/checkpoint.controller.ts:201) | yes | admin | — | yes | **DEAD** | Mounted and implemented, but no UI calls it (API-only). |
| GET | `/api/admin/complaints` | routes/adminComplaint.routes.ts:14 | `listComplaints` (controllers/complaint.controller.ts:52) | yes | perm:resolve_complaints | — | yes | **WORKING** |  |
| PATCH | `/api/admin/complaints/:id/resolve` | routes/adminComplaint.routes.ts:21 | `resolveComplaint` (controllers/complaint.controller.ts:60) | yes | perm:resolve_complaints | — | yes | **WORKING** |  |
| GET | `/api/admin/disputes` | routes/dispute.routes.ts:36 | `listDisputes` (controllers/dispute.controller.ts:10) | yes | admin | — | yes | **WORKING** |  |
| POST | `/api/admin/disputes` | routes/dispute.routes.ts:43 | `createDispute` (controllers/dispute.controller.ts:36) | yes | admin | — | yes | **WORKING** |  |
| GET | `/api/admin/disputes/:id` | routes/dispute.routes.ts:42 | `getDispute` (controllers/dispute.controller.ts:22) | yes | admin | — | yes | **WORKING** |  |
| POST | `/api/admin/disputes/:id/messages` | routes/dispute.routes.ts:54 | `addDisputeMessage` (controllers/dispute.controller.ts:125) | yes | admin | — | yes | **WORKING** |  |
| PATCH | `/api/admin/disputes/:id/resolve` | routes/dispute.routes.ts:60 | `resolveDispute` (controllers/dispute.controller.ts:148) | yes | admin | — | yes | **WORKING** |  |
| GET | `/api/admin/fare-rules` | routes/fareRule.routes.ts:32 | `listFareRules` (controllers/fareRule.controller.ts:9) | yes | admin | — | yes | **WORKING** |  |
| POST | `/api/admin/fare-rules` | routes/fareRule.routes.ts:39 | `createFareRule` (controllers/fareRule.controller.ts:19) | yes | admin | — | yes | **WORKING** |  |
| PATCH | `/api/admin/fare-rules/:id` | routes/fareRule.routes.ts:52 | `updateFareRule` (controllers/fareRule.controller.ts:107) | yes | admin | — | yes | **WORKING** |  |
| GET | `/api/admin/federations` | routes/federation.routes.ts:12 | `listFederations` (controllers/federation.controller.ts:83) | yes | admin | — | n/a | **DEAD** | Mounted and implemented, but no UI calls it (API-only). |
| POST | `/api/admin/federations` | routes/federation.routes.ts:13 | `createFederation` (controllers/federation.controller.ts:41) | yes | admin | — | yes | **DEAD** | Mounted and implemented, but no UI calls it (API-only). |
| POST | `/api/admin/federations/admins` | routes/federation.routes.ts:29 | `createFederationAdmin` (controllers/federation.controller.ts:97) | yes | admin | — | yes | **DEAD** | Mounted and implemented, but no UI calls it (API-only). |
| GET | `/api/admin/fraud/cases` | routes/fraud.routes.ts:15 | `listFraudCases` (controllers/fraud.controller.ts:11) | yes | admin | — | yes | **WORKING** |  |
| GET | `/api/admin/fraud/cases/:id` | routes/fraud.routes.ts:21 | `getFraudCase` (controllers/fraud.controller.ts:23) | yes | admin | — | yes | **WORKING** |  |
| PATCH | `/api/admin/fraud/cases/:id/investigate` | routes/fraud.routes.ts:22 | `investigateFraudCase` (controllers/fraud.controller.ts:31) | yes | admin | — | yes | **WORKING** |  |
| PATCH | `/api/admin/fraud/cases/:id/resolve` | routes/fraud.routes.ts:28 | `resolveFraudCase` (controllers/fraud.controller.ts:56) | yes | admin | — | yes | **WORKING** |  |
| GET | `/api/admin/incentives` | routes/incentive.routes.ts:47 | `listIncentives` (controllers/incentive.controller.ts:79) | yes | admin | — | n/a | **WORKING** |  |
| GET | `/api/admin/incentives/rules` | routes/incentive.routes.ts:27 | `listIncentiveRules` (controllers/incentive.controller.ts:36) | yes | admin | — | n/a | **WORKING** |  |
| POST | `/api/admin/incentives/rules` | routes/incentive.routes.ts:28 | `createIncentiveRule` (controllers/incentive.controller.ts:15) | yes | admin | — | yes | **WORKING** |  |
| PATCH | `/api/admin/incentives/rules/:id/deactivate` | routes/incentive.routes.ts:39 | `deactivateIncentiveRule` (controllers/incentive.controller.ts:41) | yes | admin | — | yes | **WORKING** |  |
| POST | `/api/admin/incentives/run` | routes/incentive.routes.ts:46 | `runIncentives` (controllers/incentive.controller.ts:55) | yes | admin | — | no | **WORKING** |  |
| GET | `/api/admin/insurance/claims` | routes/insurance.routes.ts:58 | `listAllClaims` (controllers/insurance.controller.ts:150) | yes | admin | — | yes | **DEAD** | Mounted and implemented, but no UI calls it (API-only). |
| PATCH | `/api/admin/insurance/claims/:id` | routes/insurance.routes.ts:65 | `updateClaimStatus` (controllers/insurance.controller.ts:162) | yes | admin | — | yes | **DEAD** | Mounted and implemented, but no UI calls it (API-only). |
| PATCH | `/api/admin/insurance/kill-switch` | routes/insurance.routes.ts:124 | `updateKillSwitch` (controllers/insurance.controller.ts:298) | yes | admin | — | yes | **WORKING** |  |
| POST | `/api/admin/insurance/parametric/run-check` | routes/insurance.routes.ts:81 | `runParametricCheck` (controllers/insurance.controller.ts:192) | yes | admin | — | no | **DEAD** | Mounted and implemented, but no UI calls it (API-only). |
| GET | `/api/admin/insurance/payout-monitor` | routes/insurance.routes.ts:123 | `getPayoutMonitor` (controllers/insurance.controller.ts:279) | yes | admin | — | n/a | **WORKING** |  |
| GET | `/api/admin/insurance/plans` | routes/insurance.routes.ts:92 | `listAllPlans` (controllers/insurance.controller.ts:211) | yes | admin | — | n/a | **WORKING** |  |
| POST | `/api/admin/insurance/plans` | routes/insurance.routes.ts:93 | `createPlan` (controllers/insurance.controller.ts:217) | yes | admin | — | yes | **WORKING** |  |
| PATCH | `/api/admin/insurance/plans/:id` | routes/insurance.routes.ts:109 | `updatePlan` (controllers/insurance.controller.ts:247) | yes | admin | — | yes | **WORKING** |  |
| GET | `/api/admin/kyc-queue` | routes/kyc.routes.ts:14 | `listKycQueue` (controllers/kyc.controller.ts:20) | yes | perm:verify_kyc | — | n/a | **WORKING** |  |
| PATCH | `/api/admin/kyc-queue/:id` | routes/kyc.routes.ts:15 | `updateKycStatus` (controllers/kyc.controller.ts:47) | yes | perm:verify_kyc | — | yes | **WORKING** |  |
| GET | `/api/admin/ledger` | routes/ledger.routes.ts:24 | `listLedger` (controllers/ledger.controller.ts:22) | yes | admin | — | yes | **WORKING** |  |
| GET | `/api/admin/ledger/export` | routes/ledger.routes.ts:25 | `exportLedgerCsv` (controllers/ledger.controller.ts:66) | yes | admin | — | yes | **WORKING** |  |
| GET | `/api/admin/managers` | routes/admin.routes.ts:34 | `listManagers` (controllers/admin.controller.ts:18) | yes | admin | — | n/a | **WORKING** |  |
| POST | `/api/admin/managers` | routes/admin.routes.ts:35 | `createManager` (controllers/admin.controller.ts:23) | yes | admin | — | yes | **WORKING** |  |
| PATCH | `/api/admin/managers/:id/permissions` | routes/admin.routes.ts:41 | `updateManagerPermissions` (controllers/admin.controller.ts:54) | yes | admin | — | yes | **WORKING** |  |
| GET | `/api/admin/ops-hub` | routes/opsHub.routes.ts:13 | `getOpsHub` (controllers/opsHub.controller.ts:16) | yes | perm:view_analytics | — | n/a | **WORKING** |  |
| GET | `/api/admin/payouts` | routes/payout.routes.ts:14 | `listPayouts` (controllers/payout.controller.ts:12) | yes | admin | — | yes | **WORKING** |  |
| PATCH | `/api/admin/payouts/:id/approve` | routes/payout.routes.ts:20 | `approvePayout` (controllers/payout.controller.ts:73) | yes | admin | — | yes | **WORKING** |  |
| PATCH | `/api/admin/payouts/:id/paid` | routes/payout.routes.ts:22 | `markPayoutPaid` (controllers/payout.controller.ts:75) | yes | admin | — | yes | **WORKING** |  |
| PATCH | `/api/admin/payouts/:id/reject` | routes/payout.routes.ts:21 | `rejectPayout` (controllers/payout.controller.ts:74) | yes | admin | — | yes | **WORKING** |  |
| POST | `/api/admin/payouts/generate` | routes/payout.routes.ts:23 | `generatePayouts` (controllers/payout.controller.ts:85) | yes | admin | — | yes | **WORKING** |  |
| GET | `/api/admin/platform-commission` | routes/admin.routes.ts:92 | `getPlatformCommission` (controllers/admin.controller.ts:164) | yes | admin | — | n/a | **DEAD** | Mounted and implemented, but no UI calls it (API-only). |
| PATCH | `/api/admin/platform-commission` | routes/admin.routes.ts:93 | `updatePlatformCommission` (controllers/admin.controller.ts:184) | yes | admin | — | yes | **DEAD** | Mounted and implemented, but no UI calls it (API-only). |
| GET | `/api/admin/promo-banners` | routes/promoBanner.routes.ts:41 | `listAllBanners` (controllers/promoBanner.controller.ts:47) | yes | admin | — | n/a | **DEAD** | Mounted and implemented, but no UI calls it (API-only). |
| POST | `/api/admin/promo-banners` | routes/promoBanner.routes.ts:42 | `createBanner` (controllers/promoBanner.controller.ts:52) | yes | admin | — | yes | **DEAD** | Mounted and implemented, but no UI calls it (API-only). |
| PATCH | `/api/admin/promo-banners/:id` | routes/promoBanner.routes.ts:43 | `updateBanner` (controllers/promoBanner.controller.ts:75) | yes | admin | — | yes | **DEAD** | Mounted and implemented, but no UI calls it (API-only). |
| POST | `/api/admin/referrals/check-payouts` | routes/referral.routes.ts:30 | `checkReferralPayouts` (controllers/referral.controller.ts:101) | yes | admin | — | no | **DEAD** | Mounted and implemented, but no UI calls it (API-only). |
| GET | `/api/admin/regions` | routes/region.routes.ts:14 | `listRegions` (controllers/region.controller.ts:8) | yes | admin | — | n/a | **WORKING** |  |
| POST | `/api/admin/regions` | routes/region.routes.ts:15 | `launchRegion` (controllers/region.controller.ts:13) | yes | admin | — | yes | **WORKING** |  |
| PATCH | `/api/admin/regions/:id` | routes/region.routes.ts:16 | `setRegionEnabled` (controllers/region.controller.ts:32) | yes | admin | — | yes | **WORKING** |  |
| GET | `/api/admin/reports/export` | routes/reports.routes.ts:16 | `exportReport` (controllers/reports.controller.ts:46) | yes | admin | — | yes | **WORKING** |  |
| GET | `/api/admin/service-categories` | routes/serviceCategory.routes.ts:16 | `listAllServiceCategories` (controllers/serviceCategory.controller.ts:15) | yes | admin | — | n/a | **DEAD** | Mounted and implemented, but no UI calls it (API-only). |
| POST | `/api/admin/service-categories` | routes/serviceCategory.routes.ts:17 | `createServiceCategory` (controllers/serviceCategory.controller.ts:20) | yes | admin | — | yes | **DEAD** | Mounted and implemented, but no UI calls it (API-only). |
| PATCH | `/api/admin/service-categories/:id/active` | routes/serviceCategory.routes.ts:35 | `setServiceCategoryActive` (controllers/serviceCategory.controller.ts:50) | yes | admin | — | yes | **DEAD** | Mounted and implemented, but no UI calls it (API-only). |
| GET | `/api/admin/stats` | routes/adminStats.routes.ts:10 | `getAdminStats` (controllers/adminStats.controller.ts:16) | yes | perm:view_analytics | — | n/a | **WORKING** |  |
| GET | `/api/admin/surge-zones` | routes/surgeZone.routes.ts:15 | `listSurgeZones` (controllers/surgeZone.controller.ts:8) | yes | perm:edit_fare_rules | — | n/a | **WORKING** |  |
| POST | `/api/admin/surge-zones` | routes/surgeZone.routes.ts:16 | `createSurgeZone` (controllers/surgeZone.controller.ts:20) | yes | perm:edit_fare_rules | — | yes | **WORKING** |  |
| PATCH | `/api/admin/surge-zones/:id/end` | routes/surgeZone.routes.ts:26 | `endSurgeZone` (controllers/surgeZone.controller.ts:53) | yes | perm:edit_fare_rules | — | yes | **WORKING** |  |
| GET | `/api/admin/users` | routes/admin.routes.ts:48 | `listUsers` (controllers/admin.controller.ts:84) | yes | admin | — | yes | **WORKING** |  |
| DELETE | `/api/admin/users/:id` | routes/admin.routes.ts:78 | `updateUserStatus` (controllers/admin.controller.ts:132) | yes | admin | — | yes | **WORKING** |  |
| PATCH | `/api/admin/users/:id/role` | routes/admin.routes.ts:63 | `updateUserRole` (controllers/admin.controller.ts:110) | yes | admin | — | yes | **WORKING** |  |
| PATCH | `/api/admin/users/:id/status` | routes/admin.routes.ts:72 | `updateUserStatus` (controllers/admin.controller.ts:132) | yes | admin | — | yes | **WORKING** |  |
| POST | `/api/admin/wage-floors` | routes/wageFloor.routes.ts:40 | `createWageFloor` (controllers/wageFloor.controller.ts:114) | yes | admin | — | yes | **DEAD** | Mounted and implemented, but no UI calls it (API-only). |
| POST | `/api/agents/demand-forecast` | routes/agents.routes.ts:33 | `forecastDemand` (controllers/agents.controller.ts:73) | yes | driver, hamali_solo, mutha_member, mutha_leader, admin, manager | agentLimiter | yes | **PARTIAL** | LLM (Gemini -> Groq -> Anthropic, first configured) over real DB data; labelled rule-based fallback when no provider answers. |
| POST | `/api/agents/dispute-triage/:id` | routes/agents.routes.ts:20 | `triageDispute` (controllers/agents.controller.ts:34) | yes | admin | agentLimiter | yes | **PARTIAL** | LLM (Gemini -> Groq -> Anthropic, first configured) over real DB data; labelled rule-based fallback when no provider answers. |
| POST | `/api/agents/document-precheck` | routes/agents.routes.ts:47 | `precheckDocument` (controllers/agents.controller.ts:105) | yes | any signed-in | agentLimiter | yes | **PARTIAL** | LLM (Gemini -> Groq -> Anthropic, first configured) over real DB data; labelled rule-based fallback when no provider answers. |
| POST | `/api/agents/market-insights` | routes/agents.routes.ts:70 | `getMarketInsights` (controllers/agents.controller.ts:164) | yes | admin, manager | agentLimiter | yes | **PARTIAL** | LLM (Gemini -> Groq -> Anthropic, first configured) over real DB data; labelled rule-based fallback when no provider answers. |
| POST | `/api/agents/pricing-quote` | routes/agents.routes.ts:57 | `getPricingQuote` (controllers/agents.controller.ts:131) | yes | any signed-in | agentLimiter | yes | **PARTIAL** | LLM (Gemini -> Groq -> Anthropic, first configured) over real DB data; labelled rule-based fallback when no provider answers. |
| POST | `/api/assistant/ask` | routes/assistant.routes.ts:20 | `ask` (controllers/assistant.controller.ts:47) | yes | any signed-in | agentLimiter | yes | **PARTIAL** | LLM (Gemini -> Groq -> Anthropic, first configured) over real DB data; labelled rule-based fallback when no provider answers. |
| GET | `/api/assistant/conversations` | routes/assistant.routes.ts:30 | `listConversations` (controllers/assistant.controller.ts:102) | yes | any signed-in | agentLimiter | n/a | **WORKING** |  |
| GET | `/api/assistant/conversations/:id` | routes/assistant.routes.ts:32 | `getConversation` (controllers/assistant.controller.ts:121) | yes | any signed-in | agentLimiter | yes | **WORKING** |  |
| POST | `/api/assistant/conversations/:id/escalate` | routes/assistant.routes.ts:40 | `escalate` (controllers/assistant.controller.ts:142) | yes | any signed-in | agentLimiter | yes | **WORKING** |  |
| POST | `/api/assistant/diagnose-photo` | routes/assistant.routes.ts:52 | `diagnosePhotoEndpoint` (controllers/assistant.controller.ts:206) | yes | any signed-in | agentLimiter | yes | **PARTIAL** | LLM (Gemini -> Groq -> Anthropic, first configured) over real DB data; labelled rule-based fallback when no provider answers. |
| POST | `/api/auth/login` | routes/auth.routes.ts:87 | `login` (controllers/auth.controller.ts:234) | NO | public | authLimiter, loginAccountLimiter | yes | **WORKING** |  |
| POST | `/api/auth/logout` | routes/auth.routes.ts:98 | `logout` (controllers/auth.controller.ts:275) | yes | any signed-in | — | no | **WORKING** |  |
| DELETE | `/api/auth/me` | routes/auth.routes.ts:227 | `deleteMyAccount` (controllers/auth.controller.ts:635) | yes | any signed-in | — | no | **WORKING** |  |
| GET | `/api/auth/me` | routes/auth.routes.ts:99 | `me` (controllers/auth.controller.ts:302) | yes | any signed-in | — | n/a | **WORKING** |  |
| PATCH | `/api/auth/me/business-profile` | routes/auth.routes.ts:215 | `updateMyBusinessProfile` (controllers/auth.controller.ts:618) | yes | any signed-in | — | yes | **WORKING** |  |
| PATCH | `/api/auth/me/documents` | routes/auth.routes.ts:114 | `updateMyDocuments` (controllers/auth.controller.ts:360) | yes | any signed-in | — | yes | **WORKING** |  |
| PATCH | `/api/auth/me/locale` | routes/auth.routes.ts:191 | `updateMyLocale` (controllers/auth.controller.ts:542) | yes | any signed-in | — | yes | **WORKING** |  |
| POST | `/api/auth/me/logout-everywhere` | routes/auth.routes.ts:213 | `logoutEverywhere` (controllers/auth.controller.ts:610) | yes | any signed-in | — | no | **WORKING** |  |
| PATCH | `/api/auth/me/notification-preferences` | routes/auth.routes.ts:168 | `updateNotificationPreferences` (controllers/auth.controller.ts:515) | yes | any signed-in | — | yes | **WORKING** |  |
| PATCH | `/api/auth/me/password` | routes/auth.routes.ts:159 | `updateMyPassword` (controllers/auth.controller.ts:495) | yes | any signed-in | authLimiter | yes | **WORKING** |  |
| PATCH | `/api/auth/me/payout-details` | routes/auth.routes.ts:199 | `updateMyPayoutDetails` (controllers/auth.controller.ts:572) | yes | any signed-in | — | yes | **WORKING** |  |
| POST | `/api/auth/me/phone/confirm` | routes/auth.routes.ts:150 | `confirmPhoneChange` (controllers/auth.controller.ts:453) | yes | any signed-in | authLimiter | yes | **PARTIAL** | Verifies against a code that is never delivered by SMS. |
| POST | `/api/auth/me/phone/request-otp` | routes/auth.routes.ts:141 | `requestPhoneChangeOtp` (controllers/auth.controller.ts:423) | yes | any signed-in | authLimiter | yes | **PARTIAL** | No SMS provider: throws outside mock mode; in mock mode the code is returned in the response as devCode (otp.service.ts:34-49). |
| PATCH | `/api/auth/me/photo` | routes/auth.routes.ts:107 | `updateMyPhoto` (controllers/auth.controller.ts:322) | yes | any signed-in | — | yes | **WORKING** |  |
| PATCH | `/api/auth/me/privacy` | routes/auth.routes.ts:180 | `updateMyPrivacy` (controllers/auth.controller.ts:553) | yes | any signed-in | — | yes | **WORKING** |  |
| PATCH | `/api/auth/me/profile` | routes/auth.routes.ts:127 | `updateMyProfile` (controllers/auth.controller.ts:405) | yes | any signed-in | — | yes | **WORKING** |  |
| POST | `/api/auth/refresh` | routes/auth.routes.ts:96 | `refresh` (controllers/auth.controller.ts:246) | NO | public | — | no | **WORKING** |  |
| POST | `/api/auth/signup/customer` | routes/auth.routes.ts:17 | `signupCustomer` (controllers/auth.controller.ts:62) | NO | public | authLimiter | yes | **WORKING** |  |
| POST | `/api/auth/signup/driver` | routes/auth.routes.ts:39 | `signupDriver` (controllers/auth.controller.ts:84) | NO | public | authLimiter | yes | **WORKING** |  |
| POST | `/api/auth/signup/fleet-owner` | routes/auth.routes.ts:71 | `signupFleetOwner` (controllers/auth.controller.ts:198) | NO | public | authLimiter | yes | **WORKING** |  |
| POST | `/api/auth/signup/hamali` | routes/auth.routes.ts:54 | `signupHamali` (controllers/auth.controller.ts:117) | NO | public | authLimiter | yes | **WORKING** |  |
| POST | `/api/auth/signup/warehouse-hub` | routes/auth.routes.ts:79 | `signupWarehouseHub` (controllers/auth.controller.ts:216) | NO | public | authLimiter | yes | **WORKING** |  |
| POST | `/api/auth/socket-token` | routes/auth.routes.ts:97 | `socketToken` (controllers/auth.controller.ts:271) | yes | any signed-in | — | no | **WORKING** |  |
| PATCH | `/api/auth/switch-role` | routes/auth.routes.ts:100 | `switchRole` (controllers/auth.controller.ts:289) | yes | any signed-in | — | yes | **WORKING** |  |
| GET | `/api/availability` | routes/availability.routes.ts:10 | `getAvailability` (controllers/availability.controller.ts:34) | yes | driver, hamali_solo, mutha_member | — | n/a | **WORKING** |  |
| PATCH | `/api/availability` | routes/availability.routes.ts:17 | `setAvailability` (controllers/availability.controller.ts:56) | yes | driver, hamali_solo, mutha_member | — | yes | **WORKING** |  |
| PATCH | `/api/availability/willing-location` | routes/availability.routes.ts:44 | `setWillingLocation` (controllers/availability.controller.ts:146) | yes | driver, hamali_solo, mutha_member | — | yes | **WORKING** |  |
| GET | `/api/bookings` | routes/booking.routes.ts:123 | `listMyBookings` (controllers/booking.controller.ts:404) | yes | customer | — | n/a | **WORKING** |  |
| POST | `/api/bookings` | routes/booking.routes.ts:98 | `createBooking` (controllers/booking.controller.ts:198) | yes | customer | bookingCreateLimiter | yes | **WORKING** |  |
| GET | `/api/bookings/:id` | routes/booking.routes.ts:129 | `getMyBooking` (controllers/booking.controller.ts:436) | yes | customer | — | yes | **WORKING** |  |
| PATCH | `/api/bookings/:id/cancel` | routes/booking.routes.ts:156 | `cancelMyBooking` (controllers/booking.controller.ts:468) | yes | customer | — | yes | **WORKING** |  |
| GET | `/api/bookings/:id/guarantee` | routes/booking.routes.ts:143 | `getGuaranteeStatus` (controllers/booking.controller.ts:494) | yes | customer | — | yes | **WORKING** |  |
| POST | `/api/bookings/:id/guarantee-claim` | routes/booking.routes.ts:149 | `raiseGuaranteeClaim` (controllers/booking.controller.ts:500) | yes | customer | — | yes | **WORKING** |  |
| GET | `/api/bookings/:id/tax-invoice` | routes/booking.routes.ts:135 | `downloadTaxInvoice` (controllers/booking.controller.ts:452) | yes | customer | — | yes | **WORKING** |  |
| GET | `/api/bookings/frequent-routes` | routes/booking.routes.ts:128 | `getMyFrequentRoutes` (controllers/booking.controller.ts:416) | yes | customer | — | n/a | **WORKING** |  |
| POST | `/api/bookings/quote` | routes/booking.routes.ts:90 | `quoteBooking` (controllers/booking.controller.ts:152) | yes | customer | bookingQuoteLimiter | yes | **WORKING** |  |
| GET | `/api/checkpoints/booking/:bookingId/halts` | routes/checkpoint.routes.ts:54 | `listHaltsForBooking` (controllers/checkpoint.controller.ts:186) | yes | any signed-in | — | yes | **WORKING** |  |
| PATCH | `/api/checkpoints/halts/:id/check-out` | routes/checkpoint.routes.ts:41 | `checkOutHalt` (controllers/checkpoint.controller.ts:142) | yes | driver | — | yes | **WORKING** |  |
| POST | `/api/checkpoints/halts/check-in` | routes/checkpoint.routes.ts:33 | `checkInHalt` (controllers/checkpoint.controller.ts:118) | yes | driver | — | yes | **WORKING** |  |
| GET | `/api/checkpoints/nearby` | routes/checkpoint.routes.ts:14 | `listNearbyCheckpoints` (controllers/checkpoint.controller.ts:18) | yes | any signed-in | — | yes | **DEAD** | Mounted and implemented, but no UI calls it (API-only). |
| GET | `/api/checkpoints/route-suggestions` | routes/checkpoint.routes.ts:21 | `getRouteHaltSuggestions` (controllers/checkpoint.controller.ts:44) | yes | any signed-in | — | yes | **DEAD** | Mounted and implemented, but no UI calls it (API-only). |
| POST | `/api/complaints` | routes/complaint.routes.ts:18 | `raiseComplaint` (controllers/complaint.controller.ts:29) | yes | customer, driver, hamali_solo, mutha_leader, mutha_member | — | yes | **WORKING** |  |
| GET | `/api/complaints/mine` | routes/complaint.routes.ts:32 | `myComplaints` (controllers/complaint.controller.ts:45) | yes | any signed-in | — | n/a | **WORKING** |  |
| POST | `/api/disputes` | routes/dispute.routes.ts:21 | `createMyDispute` (controllers/dispute.controller.ts:79) | yes | customer, driver, hamali_solo, mutha_member, mutha_leader | — | yes | **WORKING** |  |
| GET | `/api/disputes/mine` | routes/dispute.routes.ts:20 | `listMyDisputes` (controllers/dispute.controller.ts:119) | yes | customer, driver, hamali_solo, mutha_member, mutha_leader | — | n/a | **WORKING** |  |
| GET | `/api/earnings/me` | routes/earnings.routes.ts:10 | `getMyEarnings` (controllers/earnings.controller.ts:202) | yes | driver, hamali_solo, mutha_member, mutha_leader | requestsLimiter | n/a | **WORKING** |  |
| GET | `/api/emergency` | routes/emergency.routes.ts:33 | `listAlerts` (controllers/emergency.controller.ts:94) | yes | admin, manager | — | yes | **WORKING** |  |
| POST | `/api/emergency` | routes/emergency.routes.ts:16 | `raiseAlert` (controllers/emergency.controller.ts:23) | yes | any signed-in | — | yes | **WORKING** |  |
| PATCH | `/api/emergency/:id/acknowledge` | routes/emergency.routes.ts:41 | `acknowledgeAlert` (controllers/emergency.controller.ts:104) | yes | admin, manager | — | yes | **WORKING** |  |
| PATCH | `/api/emergency/:id/resolve` | routes/emergency.routes.ts:49 | `resolveAlert` (controllers/emergency.controller.ts:126) | yes | admin, manager | — | yes | **WORKING** |  |
| GET | `/api/emergency/mine` | routes/emergency.routes.ts:29 | `myAlerts` (controllers/emergency.controller.ts:88) | yes | any signed-in | — | n/a | **WORKING** |  |
| GET | `/api/fare-rules/published` | routes/fareRule.routes.ts:17 | `listPublishedRates` (controllers/fareRule.controller.ts:149) | yes | any signed-in | — | yes | **WORKING** |  |
| GET | `/api/federation/:id` | routes/federation.routes.ts:59 | `getDistrictFederationDashboard` (controllers/federation.controller.ts:265) | yes | federation_state_admin, federation_district_admin | — | yes | **WORKING** |  |
| GET | `/api/federation/affiliation-requests` | routes/federation.routes.ts:54 | `listAffiliationRequests` (controllers/federation.controller.ts:290) | yes | federation_state_admin, federation_district_admin, federation_district_admin | — | n/a | **WORKING** |  |
| PATCH | `/api/federation/affiliation-requests/:muthaId/decide` | routes/federation.routes.ts:76 | `decideAffiliationRequest` (controllers/federation.controller.ts:300) | yes | federation_state_admin, federation_district_admin, federation_district_admin | — | yes | **WORKING** |  |
| GET | `/api/federation/me` | routes/federation.routes.ts:52 | `getMyFederationDashboard` (controllers/federation.controller.ts:174) | yes | federation_state_admin, federation_district_admin | — | n/a | **WORKING** |  |
| PATCH | `/api/federation/me/bounds` | routes/federation.routes.ts:65 | `updateFederationBounds` (controllers/federation.controller.ts:392) | yes | federation_state_admin, federation_district_admin, federation_district_admin | — | yes | **WORKING** |  |
| PATCH | `/api/federation/societies/:muthaId/suspend` | routes/federation.routes.ts:83 | `suspendSociety` (controllers/federation.controller.ts:324) | yes | federation_state_admin, federation_district_admin, federation_district_admin | — | yes | **WORKING** |  |
| GET | `/api/federation/training-needs` | routes/federation.routes.ts:53 | `getTrainingNeedsAssessment` (controllers/federation.controller.ts:357) | yes | federation_state_admin, federation_district_admin | — | n/a | **WORKING** |  |
| GET | `/api/feedback` | routes/feedback.routes.ts:29 | `listAll` (controllers/feedback.controller.ts:46) | yes | admin, manager | — | yes | **WORKING** |  |
| POST | `/api/feedback` | routes/feedback.routes.ts:15 | `submit` (controllers/feedback.controller.ts:17) | yes | any signed-in | — | yes | **WORKING** |  |
| PATCH | `/api/feedback/:id` | routes/feedback.routes.ts:40 | `updateStatus` (controllers/feedback.controller.ts:59) | yes | admin, manager | — | yes | **WORKING** |  |
| GET | `/api/feedback/demand` | routes/feedback.routes.ts:38 | `demandForNewServices` (controllers/feedback.controller.ts:77) | yes | admin, manager | — | n/a | **DEAD** | Mounted and implemented, but no UI calls it (API-only). |
| GET | `/api/feedback/mine` | routes/feedback.routes.ts:27 | `listMine` (controllers/feedback.controller.ts:37) | yes | any signed-in | — | n/a | **WORKING** |  |
| POST | `/api/fleet/assign-driver` | routes/fleet.routes.ts:31 | `assignDriverToVehicle` (controllers/fleet.controller.ts:130) | yes | fleet_owner | — | yes | **WORKING** |  |
| GET | `/api/fleet/health` | routes/fleet.routes.ts:40 | `getFleetHealth` (controllers/fleet.controller.ts:195) | yes | fleet_owner | — | n/a | **WORKING** |  |
| GET | `/api/fleet/maintenance` | routes/fleet.routes.ts:42 | `listMaintenanceSchedules` (controllers/fleet.controller.ts:233) | yes | fleet_owner | — | yes | **WORKING** |  |
| PATCH | `/api/fleet/maintenance/:scheduleId` | routes/fleet.routes.ts:62 | `updateMaintenanceSchedule` (controllers/fleet.controller.ts:292) | yes | fleet_owner | — | yes | **WORKING** |  |
| GET | `/api/fleet/me` | routes/fleet.routes.ts:12 | `getMyFleet` (controllers/fleet.controller.ts:40) | yes | fleet_owner | — | n/a | **WORKING** |  |
| PATCH | `/api/fleet/me` | routes/fleet.routes.ts:13 | `updateMyFleet` (controllers/fleet.controller.ts:69) | yes | fleet_owner | — | yes | **WORKING** |  |
| POST | `/api/fleet/vehicles` | routes/fleet.routes.ts:20 | `registerFleetVehicle` (controllers/fleet.controller.ts:79) | yes | fleet_owner | — | yes | **WORKING** |  |
| GET | `/api/fleet/vehicles/:vehicleId/inspections` | routes/fleet.routes.ts:69 | `listVehicleInspections` (controllers/fleet.controller.ts:319) | yes | fleet_owner | — | yes | **WORKING** |  |
| POST | `/api/fleet/vehicles/:vehicleId/inspections` | routes/fleet.routes.ts:76 | `submitVehicleInspection` (controllers/fleet.controller.ts:333) | yes | fleet_owner | — | yes | **WORKING** |  |
| POST | `/api/fleet/vehicles/:vehicleId/maintenance` | routes/fleet.routes.ts:49 | `createMaintenanceSchedule` (controllers/fleet.controller.ts:250) | yes | fleet_owner | — | yes | **WORKING** |  |
| GET | `/api/geocode` | routes/geocode.routes.ts:17 | `geocode` (controllers/geocode.controller.ts:19) | yes | any signed-in | geocodeLimiter | yes | **WORKING** |  |
| GET | `/api/geocode/reverse` | routes/geocode.routes.ts:26 | `reverseGeocodeHandler` (controllers/geocode.controller.ts:33) | yes | any signed-in | geocodeLimiter | yes | **WORKING** |  |
| PATCH | `/api/governance/bye-laws` | routes/governance.routes.ts:16 | `updateByLaws` (controllers/governance.controller.ts:42) | yes | mutha_leader, mutha_member, mutha_leader | — | yes | **WORKING** |  |
| GET | `/api/governance/commission-records/me` | routes/governance.routes.ts:56 | `getMyCommissionRecords` (controllers/governance.controller.ts:251) | yes | mutha_leader, mutha_member | — | n/a | **WORKING** |  |
| GET | `/api/governance/polls` | routes/governance.routes.ts:72 | `listPolls` (controllers/governance.controller.ts:300) | yes | mutha_leader, mutha_member | — | n/a | **WORKING** |  |
| POST | `/api/governance/polls` | routes/governance.routes.ts:58 | `createPoll` (controllers/governance.controller.ts:264) | yes | mutha_leader, mutha_member, mutha_leader | — | yes | **WORKING** |  |
| POST | `/api/governance/polls/:id/close` | routes/governance.routes.ts:79 | `closePoll` (controllers/governance.controller.ts:386) | yes | mutha_leader, mutha_member, mutha_leader | — | yes | **WORKING** |  |
| POST | `/api/governance/polls/:id/vote` | routes/governance.routes.ts:73 | `castVote` (controllers/governance.controller.ts:352) | yes | mutha_leader, mutha_member | — | yes | **WORKING** |  |
| GET | `/api/governance/shares` | routes/governance.routes.ts:38 | `listShares` (controllers/governance.controller.ts:150) | yes | mutha_leader, mutha_member | — | n/a | **WORKING** |  |
| POST | `/api/governance/shares/issue` | routes/governance.routes.ts:27 | `issueShares` (controllers/governance.controller.ts:112) | yes | mutha_leader, mutha_member, mutha_leader | — | yes | **WORKING** |  |
| GET | `/api/governance/surplus` | routes/governance.routes.ts:54 | `listSurplusDistributions` (controllers/governance.controller.ts:234) | yes | mutha_leader, mutha_member | — | n/a | **WORKING** |  |
| POST | `/api/governance/surplus/:id/distribute` | routes/governance.routes.ts:47 | `distributeSurplusForSociety` (controllers/governance.controller.ts:213) | yes | mutha_leader, mutha_member, mutha_leader | — | yes | **WORKING** |  |
| POST | `/api/governance/surplus/compute` | routes/governance.routes.ts:40 | `computeSurplusForSociety` (controllers/governance.controller.ts:170) | yes | mutha_leader, mutha_member, mutha_leader | — | yes | **WORKING** |  |
| GET | `/api/hamali-profile/me` | routes/hamaliProfile.routes.ts:13 | `getMyHamaliProfile` (controllers/hamaliProfile.controller.ts:31) | yes | hamali_solo, mutha_member | — | n/a | **WORKING** |  |
| PATCH | `/api/hamali-profile/me` | routes/hamaliProfile.routes.ts:14 | `updateMyHamaliProfile` (controllers/hamaliProfile.controller.ts:43) | yes | hamali_solo, mutha_member | — | yes | **WORKING** |  |
| GET | `/api/health` | app.ts:155 | inline | NO | public | — | n/a | **WORKING** | Reports configured AI providers and their last failure. |
| GET | `/api/incentives/my-progress` | routes/incentive.routes.ts:15 | `myIncentiveProgress` (controllers/incentive.controller.ts:91) | yes | driver, hamali_solo, mutha_member, mutha_leader | — | n/a | **WORKING** |  |
| POST | `/api/insurance/claims` | routes/insurance.routes.ts:34 | `fileClaim` (controllers/insurance.controller.ts:121) | yes | any signed-in | — | yes | **WORKING** |  |
| GET | `/api/insurance/claims/:id` | routes/insurance.routes.ts:47 | `getClaimById` (controllers/insurance.controller.ts:141) | yes | any signed-in | — | yes | **DEAD** | Mounted and implemented, but no UI calls it (API-only). |
| POST | `/api/insurance/enroll` | routes/insurance.routes.ts:27 | `enrollInPlan` (controllers/insurance.controller.ts:33) | yes | any signed-in | — | yes | **WORKING** |  |
| GET | `/api/insurance/me` | routes/insurance.routes.ts:25 | `getMyInsurance` (controllers/insurance.controller.ts:82) | yes | any signed-in | — | n/a | **WORKING** |  |
| GET | `/api/insurance/plans` | routes/insurance.routes.ts:26 | `listAvailablePlans` (controllers/insurance.controller.ts:20) | yes | any signed-in | — | n/a | **WORKING** |  |
| GET | `/api/kyc/documents` | routes/kycDocument.routes.ts:18 | `listMyKycDocuments` (controllers/kycDocument.controller.ts:41) | yes | any signed-in | — | n/a | **WORKING** |  |
| POST | `/api/kyc/documents` | routes/kycDocument.routes.ts:20 | `uploadKycDocument` (controllers/kycDocument.controller.ts:54) | yes | any signed-in | — | yes | **WORKING** |  |
| DELETE | `/api/kyc/documents/:type` | routes/kycDocument.routes.ts:30 | `deleteKycDocument` (controllers/kycDocument.controller.ts:119) | yes | any signed-in | — | yes | **DEAD** | Mounted and implemented, but no UI calls it (API-only). |
| GET | `/api/load-manifests/:bookingId` | routes/loadManifest.routes.ts:16 | `getOrCreateManifest` (controllers/loadManifest.controller.ts:32) | yes | driver | requestsLimiter | yes | **WORKING** |  |
| GET | `/api/load-manifests/:bookingId/pdf` | routes/loadManifest.routes.ts:30 | `downloadManifestPdf` (controllers/loadManifest.controller.ts:111) | yes | driver | requestsLimiter | yes | **WORKING** |  |
| POST | `/api/load-manifests/:bookingId/sign` | routes/loadManifest.routes.ts:23 | `signManifest` (controllers/loadManifest.controller.ts:68) | yes | driver | requestsLimiter | yes | **WORKING** |  |
| GET | `/api/loadboard` | routes/loadboard.routes.ts:16 | `listLoadBoard` (controllers/loadboard.controller.ts:32) | yes | driver, hamali_solo | — | n/a | **WORKING** |  |
| GET | `/api/loadboard/:bookingId/bids` | routes/loadboard.routes.ts:39 | `listBidsForBooking` (controllers/loadboard.controller.ts:149) | yes | customer, admin | — | yes | **WORKING** |  |
| POST | `/api/loadboard/:bookingId/bids` | routes/loadboard.routes.ts:18 | `placeBid` (controllers/loadboard.controller.ts:99) | yes | driver, hamali_solo | — | yes | **WORKING** |  |
| POST | `/api/loadboard/:bookingId/bids/:bidId/accept` | routes/loadboard.routes.ts:47 | `acceptBid` (controllers/loadboard.controller.ts:180) | yes | customer | — | yes | **WORKING** |  |
| POST | `/api/loadboard/:bookingId/bids/:bidId/withdraw` | routes/loadboard.routes.ts:30 | `withdrawBid` (controllers/loadboard.controller.ts:129) | yes | driver, hamali_solo | — | yes | **WORKING** |  |
| POST | `/api/mutha/affiliation-request` | routes/mutha.routes.ts:60 | `requestAffiliation` (controllers/governance.controller.ts:79) | yes | mutha_leader | requestsLimiter | yes | **WORKING** |  |
| GET | `/api/mutha/district-federations` | routes/mutha.routes.ts:20 | `listDistrictFederations` (controllers/mutha.controller.ts:85) | yes | mutha_leader | requestsLimiter | n/a | **WORKING** |  |
| POST | `/api/mutha/earnings-discrepancy` | routes/mutha.routes.ts:46 | `flagEarningsDiscrepancy` (controllers/mutha.controller.ts:190) | yes | mutha_member | requestsLimiter | yes | **WORKING** |  |
| POST | `/api/mutha/jobs/:bookingId/assign` | routes/mutha.routes.ts:72 | `assignJobMembers` (controllers/mutha.controller.ts:287) | yes | mutha_leader | requestsLimiter | yes | **WORKING** |  |
| POST | `/api/mutha/leave` | routes/mutha.routes.ts:44 | `leaveMutha` (controllers/mutha.controller.ts:154) | yes | mutha_member | requestsLimiter | no | **WORKING** |  |
| GET | `/api/mutha/me` | routes/mutha.routes.ts:19 | `getMyMutha` (controllers/mutha.controller.ts:20) | yes | mutha_leader | requestsLimiter | n/a | **WORKING** |  |
| PATCH | `/api/mutha/me` | routes/mutha.routes.ts:22 | `updateMyGroup` (controllers/mutha.controller.ts:226) | yes | mutha_leader | requestsLimiter | yes | **WORKING** |  |
| DELETE | `/api/mutha/members/:userId` | routes/mutha.routes.ts:34 | `removeMember` (controllers/mutha.controller.ts:100) | yes | mutha_leader | requestsLimiter | yes | **WORKING** |  |
| GET | `/api/mutha/my-group` | routes/mutha.routes.ts:42 | `getMyGroupAsMember` (controllers/mutha.controller.ts:126) | yes | mutha_member | requestsLimiter | n/a | **WORKING** |  |
| GET | `/api/notifications` | routes/notification.routes.ts:13 | `listMyNotifications` (controllers/notification.controller.ts:24) | yes | any signed-in | — | yes | **WORKING** |  |
| PATCH | `/api/notifications/:id/read` | routes/notification.routes.ts:25 | `markRead` (controllers/notification.controller.ts:93) | yes | any signed-in | — | yes | **WORKING** |  |
| PATCH | `/api/notifications/read-all` | routes/notification.routes.ts:26 | `markAllRead` (controllers/notification.controller.ts:100) | yes | any signed-in | — | no | **WORKING** |  |
| GET | `/api/notifications/unread-count` | routes/notification.routes.ts:19 | `getUnreadCount` (controllers/notification.controller.ts:70) | yes | any signed-in | — | yes | **WORKING** |  |
| GET | `/api/payments/:bookingId` | routes/payment.routes.ts:51 | `getPaymentForBooking` (controllers/payment.controller.ts:175) | yes | customer | — | yes | **WORKING** |  |
| POST | `/api/payments/:bookingId/cod` | routes/payment.routes.ts:45 | `createCodPayment` (controllers/payment.controller.ts:84) | yes | customer | — | yes | **WORKING** |  |
| POST | `/api/payments/:bookingId/cod/confirm` | routes/payment.routes.ts:29 | `confirmCodPayment` (controllers/payment.controller.ts:117) | yes | any signed-in | — | yes | **WORKING** |  |
| POST | `/api/payments/:bookingId/mock-capture` | routes/payment.routes.ts:52 | `mockCapturePayment` (controllers/payment.controller.ts:235) | yes | customer | — | yes | **STUB/MOCK** | Marks payment success with a fake id; 404s unless MOCK_EXTERNAL_SERVICES=true (payment.controller.ts:236). The client Pay button calls this. |
| GET | `/api/payments/cod/pending` | routes/payment.routes.ts:28 | `listPendingCodForWorker` (controllers/payment.controller.ts:148) | yes | any signed-in | — | n/a | **WORKING** |  |
| POST | `/api/payments/order/:bookingId` | routes/payment.routes.ts:39 | `createPaymentOrder` (controllers/payment.controller.ts:43) | yes | customer | — | yes | **STUB/MOCK** | Returns order_mock_* unless MOCK=false AND Razorpay keys set (payment.service.ts:22). No client opens Razorpay Checkout. |
| POST | `/api/payments/webhook` | routes/payment.routes.ts:13 | `paymentWebhook` (controllers/payment.controller.ts:188) | NO | public | — | no | **PARTIAL** | Real HMAC check, but verifyWebhookSignature returns true when MOCK=true or RAZORPAY_WEBHOOK_SECRET is unset (payment.service.ts:49). |
| GET | `/api/pricing/guide` | routes/pricing.routes.ts:19 | `getCategoryGuide` (controllers/pricing.controller.ts:264) | yes | any signed-in | — | yes | **WORKING** |  |
| GET | `/api/pricing/mine` | routes/pricing.routes.ts:31 | `getMyPricing` (controllers/pricing.controller.ts:41) | yes | any signed-in | — | n/a | **WORKING** |  |
| PUT | `/api/pricing/mine` | routes/pricing.routes.ts:41 | `upsertMyPricing` (controllers/pricing.controller.ts:46) | yes | any signed-in | — | yes | **WORKING** |  |
| GET | `/api/pricing/mine/floors` | routes/pricing.routes.ts:33 | `getMyFloors` (controllers/pricing.controller.ts:87) | yes | any signed-in | — | yes | **WORKING** |  |
| POST | `/api/pricing/quote` | routes/pricing.routes.ts:89 | `quoteWork` (controllers/pricing.controller.ts:237) | yes | any signed-in | — | yes | **WORKING** |  |
| GET | `/api/pricing/society/floors` | routes/pricing.routes.ts:66 | `listSocietyFloors` (controllers/pricing.controller.ts:105) | yes | any signed-in | — | n/a | **WORKING** |  |
| PUT | `/api/pricing/society/floors` | routes/pricing.routes.ts:68 | `setSocietyFloor` (controllers/pricing.controller.ts:117) | yes | mutha_leader | — | yes | **WORKING** |  |
| GET | `/api/pricing/units` | routes/pricing.routes.ts:16 | `getUnitDeclarations` (controllers/pricing.controller.ts:271) | yes | any signed-in | — | n/a | **DEAD** | Mounted and implemented, but no UI calls it (API-only). |
| GET | `/api/pricing/workers` | routes/pricing.routes.ts:82 | `listWorkersForCategory` (controllers/pricing.controller.ts:184) | yes | any signed-in | — | yes | **WORKING** |  |
| GET | `/api/promo-banners` | routes/promoBanner.routes.ts:11 | `listLiveBanners` (controllers/promoBanner.controller.ts:19) | yes | any signed-in | — | yes | **WORKING** |  |
| GET | `/api/public/stats` | routes/publicStats.routes.ts:11 | `getPublicStats` (controllers/publicStats.controller.ts:37) | NO | public | — | n/a | **WORKING** |  |
| GET | `/api/quotations` | routes/quotation.routes.ts:17 | `listMine` (controllers/quotation.controller.ts:33) | yes | any signed-in | — | yes | **WORKING** |  |
| POST | `/api/quotations` | routes/quotation.routes.ts:26 | `create` (controllers/quotation.controller.ts:77) | yes | customer | — | yes | **WORKING** |  |
| GET | `/api/quotations/:id` | routes/quotation.routes.ts:23 | `getOne` (controllers/quotation.controller.ts:54) | yes | any signed-in | — | yes | **WORKING** |  |
| POST | `/api/quotations/:id/accept` | routes/quotation.routes.ts:39 | `accept` (controllers/quotation.controller.ts:89) | yes | customer | — | yes | **WORKING** |  |
| POST | `/api/quotations/:id/milestones/:index/confirm` | routes/quotation.routes.ts:70 | `confirmMilestonePayment` (controllers/quotation.controller.ts:125) | yes | customer | — | yes | **WORKING** |  |
| POST | `/api/quotations/:id/negotiate` | routes/quotation.routes.ts:62 | `negotiate` (controllers/quotation.controller.ts:120) | yes | customer | — | yes | **WORKING** |  |
| POST | `/api/quotations/:id/reject` | routes/quotation.routes.ts:54 | `reject` (controllers/quotation.controller.ts:115) | yes | customer | — | yes | **WORKING** |  |
| POST | `/api/quotations/:id/schedule-visit` | routes/quotation.routes.ts:92 | `schedule` (controllers/quotation.controller.ts:152) | yes | any signed-in | — | yes | **WORKING** |  |
| POST | `/api/quotations/:id/submit` | routes/quotation.routes.ts:108 | `submit` (controllers/quotation.controller.ts:164) | yes | any signed-in | — | yes | **WORKING** |  |
| POST | `/api/quotations/:id/variations` | routes/quotation.routes.ts:127 | `raiseVariation` (controllers/quotation.controller.ts:173) | yes | any signed-in | — | yes | **WORKING** |  |
| POST | `/api/quotations/:id/visit-done` | routes/quotation.routes.ts:100 | `markVisitDone` (controllers/quotation.controller.ts:159) | yes | any signed-in | — | yes | **WORKING** |  |
| POST | `/api/quotations/variations/:variationId/decide` | routes/quotation.routes.ts:79 | `decideVariation` (controllers/quotation.controller.ts:130) | yes | customer | — | yes | **WORKING** |  |
| POST | `/api/ratings` | routes/rating.routes.ts:25 | `submitRating` (controllers/rating.controller.ts:54) | yes | customer, driver, hamali_solo, mutha_member, mutha_leader | — | yes | **WORKING** |  |
| POST | `/api/ratings/:bookingId/defer` | routes/rating.routes.ts:16 | `deferRating` (controllers/rating.controller.ts:131) | yes | customer, driver, hamali_solo, mutha_member, mutha_leader | — | yes | **WORKING** |  |
| GET | `/api/ratings/mine` | routes/rating.routes.ts:23 | `getMyRatings` (controllers/rating.controller.ts:166) | yes | any signed-in | — | n/a | **WORKING** |  |
| GET | `/api/ratings/pending` | routes/rating.routes.ts:12 | `getPendingRating` (controllers/rating.controller.ts:83) | yes | any signed-in | — | n/a | **WORKING** |  |
| POST | `/api/referrals/code` | routes/referral.routes.ts:16 | `createMyReferralCode` (controllers/referral.controller.ts:57) | yes | driver, hamali_solo, fleet_owner | — | no | **DEAD** | Mounted and implemented, but no UI calls it (API-only). |
| POST | `/api/referrals/invite` | routes/referral.routes.ts:17 | `inviteReferral` (controllers/referral.controller.ts:65) | yes | driver, hamali_solo, fleet_owner | — | yes | **WORKING** |  |
| GET | `/api/referrals/me` | routes/referral.routes.ts:15 | `getMyReferrals` (controllers/referral.controller.ts:22) | yes | driver, hamali_solo, fleet_owner | — | n/a | **WORKING** |  |
| GET | `/api/requests` | routes/requests.routes.ts:16 | `listRequests` (controllers/requests.controller.ts:67) | yes | driver, hamali_solo, mutha_leader | requestsLimiter | n/a | **WORKING** |  |
| POST | `/api/requests/:id/accept` | routes/requests.routes.ts:24 | `acceptRequest` (controllers/requests.controller.ts:207) | yes | driver, hamali_solo, mutha_leader | requestsLimiter | yes | **WORKING** |  |
| POST | `/api/requests/:id/complete` | routes/requests.routes.ts:60 | `completeJob` (controllers/requests.controller.ts:290) | yes | driver, hamali_solo, mutha_leader | requestsLimiter | yes | **WORKING** |  |
| POST | `/api/requests/:id/proof-photo` | routes/requests.routes.ts:68 | `uploadProofPhoto` (controllers/requests.controller.ts:354) | yes | driver, hamali_solo, mutha_leader | requestsLimiter | yes | **WORKING** |  |
| POST | `/api/requests/:id/reject` | routes/requests.routes.ts:36 | `rejectRequest` (controllers/requests.controller.ts:242) | yes | driver, hamali_solo, mutha_leader | requestsLimiter | yes | **WORKING** |  |
| POST | `/api/requests/:id/start` | routes/requests.routes.ts:52 | `startJob` (controllers/requests.controller.ts:265) | yes | driver, hamali_solo, mutha_leader | requestsLimiter | yes | **WORKING** |  |
| POST | `/api/requests/:id/withdraw` | routes/requests.routes.ts:44 | `withdrawRequest` (controllers/requests.controller.ts:254) | yes | hamali_solo | requestsLimiter | yes | **WORKING** |  |
| GET | `/api/requests/mine` | routes/requests.routes.ts:18 | `myAssignedBookings` (controllers/requests.controller.ts:384) | yes | driver, hamali_solo, mutha_leader, mutha_member | requestsLimiter | n/a | **WORKING** |  |
| GET | `/api/search` | routes/search.routes.ts:12 | `search` (controllers/search.controller.ts:14) | yes | any signed-in | — | yes | **WORKING** |  |
| GET | `/api/service-categories` | routes/serviceCategory.routes.ts:11 | `listServiceCategories` (controllers/serviceCategory.controller.ts:9) | yes | any signed-in | — | n/a | **WORKING** |  |
| GET | `/api/training/certifications` | routes/training.routes.ts:23 | `getMyCertifications` (controllers/training.controller.ts:135) | yes | driver, hamali_solo, fleet_owner | — | n/a | **WORKING** |  |
| POST | `/api/training/modules/:moduleId/complete` | routes/training.routes.ts:16 | `completeTrainingModule` (controllers/training.controller.ts:55) | yes | driver, hamali_solo, fleet_owner | — | yes | **WORKING** |  |
| GET | `/api/training/progress` | routes/training.routes.ts:14 | `getMyTrainingProgress` (controllers/training.controller.ts:25) | yes | driver, hamali_solo, fleet_owner | — | n/a | **WORKING** |  |
| GET | `/api/vehicles/me` | routes/vehicle.routes.ts:12 | `getMyVehicle` (controllers/vehicle.controller.ts:7) | yes | driver | — | n/a | **WORKING** |  |
| PATCH | `/api/vehicles/me` | routes/vehicle.routes.ts:13 | `updateMyVehicle` (controllers/vehicle.controller.ts:24) | yes | driver | — | yes | **WORKING** |  |
| GET | `/api/wage-floors` | routes/wageFloor.routes.ts:18 | `listWageFloors` (controllers/wageFloor.controller.ts:34) | yes | any signed-in | — | yes | **DEAD** | Mounted and implemented, but no UI calls it (API-only). |
| GET | `/api/wage-floors/applicable` | routes/wageFloor.routes.ts:25 | `getApplicableFloor` (controllers/wageFloor.controller.ts:60) | yes | any signed-in | — | yes | **DEAD** | Mounted and implemented, but no UI calls it (API-only). |
| POST | `/api/warehouse-hub/dock-slots` | routes/warehouseHub.routes.ts:36 | `createDockSlot` (controllers/warehouseHub.controller.ts:108) | yes | warehouse_hub | — | yes | **WORKING** |  |
| PATCH | `/api/warehouse-hub/dock-slots/:id` | routes/warehouseHub.routes.ts:29 | `updateDockSlotStatus` (controllers/warehouseHub.controller.ts:68) | yes | warehouse_hub | — | yes | **WORKING** |  |
| GET | `/api/warehouse-hub/me` | routes/warehouseHub.routes.ts:14 | `getMyHub` (controllers/warehouseHub.controller.ts:13) | yes | warehouse_hub | — | n/a | **WORKING** |  |
| PATCH | `/api/warehouse-hub/me` | routes/warehouseHub.routes.ts:15 | `updateMyHub` (controllers/warehouseHub.controller.ts:48) | yes | warehouse_hub | — | yes | **WORKING** |  |


## 5. Full screen table by role

**161 screens** (Public / marketing 10; Auth & onboarding 13; Customer 23; Worker — driver 15; Worker — loading (hamali) 14; Worker — skilled (household trades) 13; Worker — farm labour 13; Society leader (Mutha) 15; Society member 9; District federation 1; State federation 1; Admin / manager 22; Fleet owner 7; Warehouse hub 5).

Data-source detection follows each page's local imports three levels deep, looking for `api.*`, polling hooks, socket or booking-flow hooks. Inbound links count `href`, `router.push/replace` and `${base}/…` templates.


#### Public / marketing — 10 screens

| PATH | FILE | WHAT IT SHOWS | DATA | STATUS | NOTE |
|---|---|---|---|---|---|
| `/` | app/(marketing)/page.tsx | Built against the Stitch editorial landing design. | real API | **WORKING** |  |
| `/about` | app/(marketing)/about/page.tsx | The federation's own account of itself. The live figures are deliberately | static | **WORKING** | Static content. |
| `/contact` | app/(marketing)/contact/page.tsx | Two real addresses and the in-product route. A member with a problem on a | static | **WORKING** | Static content. |
| `/faq` | app/(marketing)/faq/page.tsx | Page component (84 lines) | static | **WORKING** | Static content. |
| `/how-it-works` | app/(marketing)/how-it-works/page.tsx | The three audiences the platform actually serves, set in the landing | static | **WORKING** | Static content. |
| `/offline` | app/offline/page.tsx | What the service worker shows when the network is gone. | static | **WORKING** | Service-worker offline fallback. |
| `/pricing` | app/(marketing)/pricing/page.tsx | The published rate schedule, set as the open register the landing page's | static | **WORKING** | Static content. |
| `/safety` | app/(marketing)/safety/page.tsx | Six protections, each one a feature that is actually running — the | static | **WORKING** | Static content. |
| `/styleguide` | app/styleguide/page.tsx | Each block names the screenshot its anatomy was read from. */ | static | **DEAD** | Internal design reference, not linked from the product. |
| `/terms-of-service` | app/terms-of-service/page.tsx | Page component (73 lines) | static | **WORKING** | Static content. |

#### Auth & onboarding — 13 screens

| PATH | FILE | WHAT IT SHOWS | DATA | STATUS | NOTE |
|---|---|---|---|---|---|
| `/forgot-password` | app/forgot-password/page.tsx | What happens when somebody forgets their password. | static | **PARTIAL** | Honest dead end: no self-service reset because no SMS/email provider exists (page.tsx). |
| `/language-selection` | app/language-selection/page.tsx | Page component (70 lines) | static | **WORKING** | Static content. |
| `/login` | app/login/page.tsx | Sign in. One screen, one job. | real API | **WORKING** |  |
| `/onboarding-walkthrough` | app/onboarding-walkthrough/page.tsx | Page component (82 lines) | static | **WORKING** | Static content. |
| `/otp-verification` | app/otp-verification/page.tsx | OTP verification screen — UI-ONLY, intentionally disconnected. | none | **STUB/MOCK** | UI only — "Send code" makes no API call (page.tsx:49-55); not linked from anywhere. |
| `/role-selection` | app/role-selection/page.tsx | Page component (49 lines) | static | **WORKING** | Static content. |
| `/signup/agri-worker` | app/signup/agri-worker/page.tsx | Renders <WorkerSignupForm> | real API | **WORKING** |  |
| `/signup/customer` | app/signup/customer/page.tsx | Built against client/public/design/signup_customer.html. | real API | **WORKING** |  |
| `/signup/driver` | app/signup/driver/page.tsx | Built against client/public/design/signup_worker.html — the shared | real API | **WORKING** |  |
| `/signup/fleet-owner` | app/signup/fleet-owner/page.tsx | Built against client/public/design/signup_business.html — the shared | real API | **WORKING** |  |
| `/signup/hamali` | app/signup/hamali/page.tsx | Built against client/public/design/signup_worker.html — the shared | real API | **WORKING** |  |
| `/signup/skilled-worker` | app/signup/skilled-worker/page.tsx | Renders <WorkerSignupForm> | real API | **WORKING** |  |
| `/signup/warehouse-hub` | app/signup/warehouse-hub/page.tsx | Built against client/public/design/signup_business.html — the shared | real API | **WORKING** |  |

#### Customer — 23 screens

| PATH | FILE | WHAT IT SHOWS | DATA | STATUS | NOTE |
|---|---|---|---|---|---|
| `/assistant` | app/assistant/page.tsx | TARA — one assistant screen, every role. | real API | **WORKING** |  |
| `/customer/book` | app/customer/book/page.tsx | Page component (27 lines) | static | **WORKING** | Compatibility redirect to the per-mode booking screens. |
| `/customer/book/household` | app/customer/book/household/page.tsx | /customer/book/household used to be its own long booking form, carrying a | real API | **WORKING** | No inbound link — reachable by URL only. |
| `/customer/book/labour` | app/customer/book/labour/page.tsx | Built against client/public/design/hamali_labour_standard.html. | real API | **WORKING** |  |
| `/customer/book/labour/bulk` | app/customer/book/labour/bulk/page.tsx | Built against client/public/design/hamali_labour_bulk.html. | real API | **PARTIAL** | Captures a large consignment; states in-code that multi-society dispatch does not exist (page.tsx:37-45). |
| `/customer/book/transport` | app/customer/book/transport/page.tsx | Built against client/public/design/goods_transport.html. | real API | **WORKING** |  |
| `/customer/dashboard` | app/customer/dashboard/page.tsx | The customer's Household home. | real API | **WORKING** |  |
| `/customer/hire/[slug]` | app/customer/hire/[slug]/page.tsx | Hiring a tradesperson at their own published rate. | real API | **WORKING** |  |
| `/customer/history` | app/customer/history/page.tsx | Built against client/public/design/booking_history_1.html. | real API | **WORKING** |  |
| `/customer/insurance` | app/customer/insurance/page.tsx | Renders <InsuranceDashboard> | real API | **WORKING** |  |
| `/customer/notifications` | app/customer/notifications/page.tsx | Renders <NotificationCenter> | real API | **WORKING** |  |
| `/customer/profile` | app/customer/profile/page.tsx | Built against client/public/design/customer_profile_1.html. | real API | **WORKING** |  |
| `/customer/quotations` | app/customer/quotations/page.tsx | The customer's quotations, newest first. */ | real API | **WORKING** |  |
| `/customer/quotations/[id]` | app/customer/quotations/[id]/page.tsx | One quotation, from the customer's side. | real API | **WORKING** |  |
| `/customer/quotations/new` | app/customer/quotations/new/page.tsx | Asking a worker to come and look. | real API | **WORKING** |  |
| `/customer/ratings` | app/customer/ratings/page.tsx | The pending-ratings screen. | real API | **WORKING** |  |
| `/customer/scan` | app/customer/scan/page.tsx | Scan and Diagnose. | real API | **WORKING** |  |
| `/customer/service/[slug]` | app/customer/service/[slug]/page.tsx | Built against client/public/design/service_detail_booking_1.html. | real API | **WORKING** |  |
| `/customer/services` | app/customer/services/page.tsx | Everything bookable, in one place. | real API | **WORKING** |  |
| `/customer/support` | app/customer/support/page.tsx | Built against client/public/design/support_complaints.html. | real API | **WORKING** |  |
| `/customer/track` | app/customer/track/page.tsx | Page component (14 lines) | static | **WORKING** | Redirect to /customer/history. |
| `/customer/track/[bookingId]` | app/customer/track/[bookingId]/page.tsx | Named trade, when one was booked. Absent on a bare crew or truck dispatch. */ | real API | **WORKING** | Payment tab uses mock-capture (see payments). |
| `/emergency` | app/emergency/page.tsx | The SOS screen — feature 8's missing half. | real API | **WORKING** |  |

#### Worker — driver — 15 screens

| PATH | FILE | WHAT IT SHOWS | DATA | STATUS | NOTE |
|---|---|---|---|---|---|
| `/driver/active-job/[bookingId]` | app/driver/active-job/[bookingId]/page.tsx | Renders <WorkerActiveJob> | real API | **WORKING** |  |
| `/driver/active-job/[bookingId]/manifest` | app/driver/active-job/[bookingId]/manifest/page.tsx | Built against client/public/design/worker_load_manifest.html. | real API | **WORKING** |  |
| `/driver/certifications` | app/driver/certifications/page.tsx | Renders <CertificationsScreen> | real API | **WORKING** |  |
| `/driver/dashboard` | app/driver/dashboard/page.tsx | Renders <WorkerDashboard> | real API | **WORKING** |  |
| `/driver/earnings` | app/driver/earnings/page.tsx | Renders <WorkerEarnings> | real API | **WORKING** |  |
| `/driver/insurance` | app/driver/insurance/page.tsx | Renders <InsuranceDashboard> | real API | **WORKING** |  |
| `/driver/loadboard` | app/driver/loadboard/page.tsx | Renders <LoadBoardPage> | real API | **WORKING** |  |
| `/driver/notifications` | app/driver/notifications/page.tsx | Renders <NotificationCenter> | real API | **WORKING** |  |
| `/driver/pricing` | app/driver/pricing/page.tsx | Re-exports WorkerPricingScreen | real API | **WORKING** |  |
| `/driver/profile` | app/driver/profile/page.tsx | Built against client/public/design/worker_profile.html. | real API | **WORKING** |  |
| `/driver/quotations` | app/driver/quotations/page.tsx | Re-exports WorkerQuotationsScreen | real API | **WORKING** |  |
| `/driver/quotations/[id]` | app/driver/quotations/[id]/page.tsx | Re-exports WorkerQuotationDetailScreen | real API | **WORKING** |  |
| `/driver/referrals` | app/driver/referrals/page.tsx | Page component (27 lines) | real API | **WORKING** | No inbound link — reachable by URL only. |
| `/driver/requests` | app/driver/requests/page.tsx | Renders <RequestsQueue> | real API | **WORKING** |  |
| `/driver/training` | app/driver/training/page.tsx | Renders <TrainingScreen> | real API | **WORKING** |  |

#### Worker — loading (hamali) — 14 screens

| PATH | FILE | WHAT IT SHOWS | DATA | STATUS | NOTE |
|---|---|---|---|---|---|
| `/hamali/active-job/[bookingId]` | app/hamali/active-job/[bookingId]/page.tsx | Renders <WorkerActiveJob> | real API | **WORKING** |  |
| `/hamali/certifications` | app/hamali/certifications/page.tsx | Renders <CertificationsScreen> | real API | **WORKING** |  |
| `/hamali/dashboard` | app/hamali/dashboard/page.tsx | Renders <WorkerDashboard> | real API | **WORKING** |  |
| `/hamali/earnings` | app/hamali/earnings/page.tsx | Renders <WorkerEarnings> | real API | **WORKING** |  |
| `/hamali/insurance` | app/hamali/insurance/page.tsx | Renders <InsuranceDashboard> | real API | **WORKING** |  |
| `/hamali/loadboard` | app/hamali/loadboard/page.tsx | Renders <LoadBoardPage> | real API | **WORKING** |  |
| `/hamali/notifications` | app/hamali/notifications/page.tsx | Renders <NotificationCenter> | real API | **WORKING** |  |
| `/hamali/pricing` | app/hamali/pricing/page.tsx | Re-exports WorkerPricingScreen | real API | **WORKING** |  |
| `/hamali/profile` | app/hamali/profile/page.tsx | A worker should find their cover without being told it exists. | real API | **WORKING** |  |
| `/hamali/quotations` | app/hamali/quotations/page.tsx | Re-exports WorkerQuotationsScreen | real API | **WORKING** |  |
| `/hamali/quotations/[id]` | app/hamali/quotations/[id]/page.tsx | Re-exports WorkerQuotationDetailScreen | real API | **WORKING** |  |
| `/hamali/referrals` | app/hamali/referrals/page.tsx | Page component (27 lines) | real API | **WORKING** | No inbound link — reachable by URL only. |
| `/hamali/requests` | app/hamali/requests/page.tsx | Renders <RequestsQueue> | real API | **WORKING** |  |
| `/hamali/training` | app/hamali/training/page.tsx | Renders <TrainingScreen> | real API | **WORKING** |  |

#### Worker — skilled (household trades) — 13 screens

| PATH | FILE | WHAT IT SHOWS | DATA | STATUS | NOTE |
|---|---|---|---|---|---|
| `/skilled/active-job/[bookingId]` | app/skilled/active-job/[bookingId]/page.tsx | Renders <WorkerActiveJob> | real API | **WORKING** |  |
| `/skilled/certifications` | app/skilled/certifications/page.tsx | Renders <CertificationsScreen> | real API | **WORKING** | No inbound link — reachable by URL only. |
| `/skilled/dashboard` | app/skilled/dashboard/page.tsx | Renders <WorkerDashboard> | real API | **WORKING** |  |
| `/skilled/earnings` | app/skilled/earnings/page.tsx | Renders <WorkerEarnings> | real API | **WORKING** |  |
| `/skilled/insurance` | app/skilled/insurance/page.tsx | Renders <InsuranceDashboard> | real API | **WORKING** |  |
| `/skilled/notifications` | app/skilled/notifications/page.tsx | Renders <NotificationCenter> | real API | **WORKING** |  |
| `/skilled/pricing` | app/skilled/pricing/page.tsx | Re-exports WorkerPricingScreen | real API | **WORKING** |  |
| `/skilled/profile` | app/skilled/profile/page.tsx | A worker should find their cover without being told it exists. | real API | **WORKING** |  |
| `/skilled/quotations` | app/skilled/quotations/page.tsx | Re-exports WorkerQuotationsScreen | real API | **WORKING** |  |
| `/skilled/quotations/[id]` | app/skilled/quotations/[id]/page.tsx | Re-exports WorkerQuotationDetailScreen | real API | **WORKING** |  |
| `/skilled/referrals` | app/skilled/referrals/page.tsx | Page component (27 lines) | real API | **WORKING** | No inbound link — reachable by URL only. |
| `/skilled/requests` | app/skilled/requests/page.tsx | Renders <RequestsQueue> | real API | **WORKING** |  |
| `/skilled/training` | app/skilled/training/page.tsx | Renders <TrainingScreen> | real API | **WORKING** |  |

#### Worker — farm labour — 13 screens

| PATH | FILE | WHAT IT SHOWS | DATA | STATUS | NOTE |
|---|---|---|---|---|---|
| `/agri/active-job/[bookingId]` | app/agri/active-job/[bookingId]/page.tsx | Renders <WorkerActiveJob> | real API | **WORKING** |  |
| `/agri/certifications` | app/agri/certifications/page.tsx | Renders <CertificationsScreen> | real API | **WORKING** | No inbound link — reachable by URL only. |
| `/agri/dashboard` | app/agri/dashboard/page.tsx | Renders <WorkerDashboard> | real API | **WORKING** |  |
| `/agri/earnings` | app/agri/earnings/page.tsx | Renders <WorkerEarnings> | real API | **WORKING** |  |
| `/agri/insurance` | app/agri/insurance/page.tsx | Renders <InsuranceDashboard> | real API | **WORKING** |  |
| `/agri/notifications` | app/agri/notifications/page.tsx | Renders <NotificationCenter> | real API | **WORKING** |  |
| `/agri/pricing` | app/agri/pricing/page.tsx | Re-exports WorkerPricingScreen | real API | **WORKING** |  |
| `/agri/profile` | app/agri/profile/page.tsx | A worker should find their cover without being told it exists. | real API | **WORKING** |  |
| `/agri/quotations` | app/agri/quotations/page.tsx | Re-exports WorkerQuotationsScreen | real API | **WORKING** |  |
| `/agri/quotations/[id]` | app/agri/quotations/[id]/page.tsx | Re-exports WorkerQuotationDetailScreen | real API | **WORKING** |  |
| `/agri/referrals` | app/agri/referrals/page.tsx | Page component (27 lines) | real API | **WORKING** | No inbound link — reachable by URL only. |
| `/agri/requests` | app/agri/requests/page.tsx | Renders <RequestsQueue> | real API | **WORKING** |  |
| `/agri/training` | app/agri/training/page.tsx | Renders <TrainingScreen> | real API | **WORKING** |  |

#### Society leader (Mutha) — 15 screens

| PATH | FILE | WHAT IT SHOWS | DATA | STATUS | NOTE |
|---|---|---|---|---|---|
| `/mutha/active-jobs` | app/mutha/active-jobs/page.tsx | Built against client/public/design/society_active_jobs.html. | real API | **WORKING** |  |
| `/mutha/assign-members` | app/mutha/assign-members/page.tsx | Page component (166 lines) | real API | **WORKING** |  |
| `/mutha/create-group` | app/mutha/create-group/page.tsx | " onChange={handlePhoto} className="hidden" /> | real API | **WORKING** |  |
| `/mutha/dashboard` | app/mutha/dashboard/page.tsx | Built against client/public/design/society_dashboard.html. | real API | **WORKING** |  |
| `/mutha/earnings` | app/mutha/earnings/page.tsx | Built against client/public/design/society_earnings.html. | real API | **WORKING** |  |
| `/mutha/governance` | app/mutha/governance/page.tsx | Built against client/public/design/society_governance.html. | real API | **WORKING** |  |
| `/mutha/insurance` | app/mutha/insurance/page.tsx | Renders <InsuranceDashboard> | real API | **WORKING** |  |
| `/mutha/members` | app/mutha/members/page.tsx | Built against client/public/design/society_members.html. | real API | **WORKING** |  |
| `/mutha/notifications` | app/mutha/notifications/page.tsx | Renders <NotificationCenter> | real API | **WORKING** |  |
| `/mutha/operations` | app/mutha/operations/page.tsx | Page component (88 lines) | real API | **WORKING** |  |
| `/mutha/pricing` | app/mutha/pricing/page.tsx | Re-exports WorkerPricingScreen | real API | **WORKING** |  |
| `/mutha/profile` | app/mutha/profile/page.tsx | Built against client/public/design/society_profile.html. | real API | **WORKING** |  |
| `/mutha/quotations` | app/mutha/quotations/page.tsx | Re-exports WorkerQuotationsScreen | real API | **WORKING** |  |
| `/mutha/quotations/[id]` | app/mutha/quotations/[id]/page.tsx | Re-exports WorkerQuotationDetailScreen | real API | **WORKING** |  |
| `/mutha/requests` | app/mutha/requests/page.tsx | Built against client/public/design/society_requests.html. | real API | **WORKING** |  |

#### Society member — 9 screens

| PATH | FILE | WHAT IT SHOWS | DATA | STATUS | NOTE |
|---|---|---|---|---|---|
| `/mutha-member/earnings` | app/mutha-member/earnings/page.tsx | Phase 3.1 — /mutha-member/insurance existed as a route with no | real API | **WORKING** |  |
| `/mutha-member/governance` | app/mutha-member/governance/page.tsx | Page component (242 lines) | real API | **WORKING** |  |
| `/mutha-member/insurance` | app/mutha-member/insurance/page.tsx | Renders <InsuranceDashboard> | real API | **WORKING** |  |
| `/mutha-member/job` | app/mutha-member/job/page.tsx | Built against client/public/design/crew_job_assignment.html. | real API | **WORKING** |  |
| `/mutha-member/notifications` | app/mutha-member/notifications/page.tsx | Renders <NotificationCenter> | real API | **WORKING** |  |
| `/mutha-member/pricing` | app/mutha-member/pricing/page.tsx | Re-exports WorkerPricingScreen | real API | **WORKING** |  |
| `/mutha-member/profile` | app/mutha-member/profile/page.tsx | A worker should find their cover without being told it exists. | real API | **WORKING** |  |
| `/mutha-member/quotations` | app/mutha-member/quotations/page.tsx | Re-exports WorkerQuotationsScreen | real API | **WORKING** |  |
| `/mutha-member/quotations/[id]` | app/mutha-member/quotations/[id]/page.tsx | Re-exports WorkerQuotationDetailScreen | real API | **WORKING** |  |

#### District federation — 1 screens

| PATH | FILE | WHAT IT SHOWS | DATA | STATUS | NOTE |
|---|---|---|---|---|---|
| `/federation-district/dashboard` | app/federation-district/dashboard/page.tsx | Renders <FederationDashboardView> | real API | **WORKING** |  |

#### State federation — 1 screens

| PATH | FILE | WHAT IT SHOWS | DATA | STATUS | NOTE |
|---|---|---|---|---|---|
| `/federation-state/dashboard` | app/federation-state/dashboard/page.tsx | Renders <FederationDashboardView> | real API | **WORKING** |  |

#### Admin / manager — 22 screens

| PATH | FILE | WHAT IT SHOWS | DATA | STATUS | NOTE |
|---|---|---|---|---|---|
| `/admin/analytics` | app/admin/analytics/page.tsx | Page component (96 lines) | real API | **WORKING** |  |
| `/admin/audit-log` | app/admin/audit-log/page.tsx | Page component (131 lines) | real API | **WORKING** |  |
| `/admin/complaints` | app/admin/complaints/page.tsx | Page component (120 lines) | real API | **WORKING** |  |
| `/admin/dashboard` | app/admin/dashboard/page.tsx | Built against client/public/design/admin_overview.html. | real API | **WORKING** |  |
| `/admin/disputes` | app/admin/disputes/page.tsx | Page component (85 lines) | real API | **WORKING** |  |
| `/admin/disputes/[id]` | app/admin/disputes/[id]/page.tsx | Page component (269 lines) | real API | **WORKING** |  |
| `/admin/emergencies` | app/admin/emergencies/page.tsx | The operations side of an SOS. | real API | **WORKING** |  |
| `/admin/fares` | app/admin/fares/page.tsx | Page component (210 lines) | real API | **WORKING** |  |
| `/admin/fraud-alerts` | app/admin/fraud-alerts/page.tsx | Page component (229 lines) | real API | **WORKING** |  |
| `/admin/incentives` | app/admin/incentives/page.tsx | Page component (164 lines) | real API | **WORKING** |  |
| `/admin/insurance` | app/admin/insurance/page.tsx | Page component (270 lines) | real API | **WORKING** |  |
| `/admin/kyc-queue` | app/admin/kyc-queue/page.tsx | Page component (205 lines) | real API | **WORKING** |  |
| `/admin/ledger` | app/admin/ledger/page.tsx | Page component (148 lines) | real API | **WORKING** |  |
| `/admin/managers` | app/admin/managers/page.tsx | ) are untouched; all fetch/mutation | real API | **WORKING** |  |
| `/admin/notifications` | app/admin/notifications/page.tsx | Renders <NotificationCenter> | real API | **WORKING** |  |
| `/admin/ops-hub` | app/admin/ops-hub/page.tsx | Page component (110 lines) | real API | **WORKING** |  |
| `/admin/payouts` | app/admin/payouts/page.tsx | Page component (168 lines) | real API | **WORKING** |  |
| `/admin/profile` | app/admin/profile/page.tsx | Page component (109 lines) | real API | **WORKING** |  |
| `/admin/regions` | app/admin/regions/page.tsx | Page component (99 lines) | real API | **WORKING** |  |
| `/admin/reports` | app/admin/reports/page.tsx | Page component (122 lines) | real API | **WORKING** |  |
| `/admin/surge-zones` | app/admin/surge-zones/page.tsx | Page component (180 lines) | real API | **WORKING** |  |
| `/admin/users` | app/admin/users/page.tsx | Page component (66 lines) | real API | **WORKING** |  |

#### Fleet owner — 7 screens

| PATH | FILE | WHAT IT SHOWS | DATA | STATUS | NOTE |
|---|---|---|---|---|---|
| `/fleet-owner/dashboard` | app/fleet-owner/dashboard/page.tsx | Built against client/public/design/fleet_owner_dashboard.html. | real API | **WORKING** |  |
| `/fleet-owner/insurance` | app/fleet-owner/insurance/page.tsx | Renders <InsuranceDashboard> | real API | **WORKING** |  |
| `/fleet-owner/maintenance` | app/fleet-owner/maintenance/page.tsx | "Book Repair" per row, ChecklistItem-driven: cycling a row to | real API | **WORKING** |  |
| `/fleet-owner/notifications` | app/fleet-owner/notifications/page.tsx | Renders <NotificationCenter> | real API | **WORKING** |  |
| `/fleet-owner/profile` | app/fleet-owner/profile/page.tsx | Page component (156 lines) | real API | **WORKING** |  |
| `/fleet-owner/training` | app/fleet-owner/training/page.tsx | The fleet owner's copy of the training academy. It sits inside the | real API | **WORKING** |  |
| `/fleet-owner/vehicles/[vehicleId]/inspection` | app/fleet-owner/vehicles/[vehicleId]/inspection/page.tsx | Page component (228 lines) | real API | **WORKING** |  |

#### Warehouse hub — 5 screens

| PATH | FILE | WHAT IT SHOWS | DATA | STATUS | NOTE |
|---|---|---|---|---|---|
| `/warehouse-hub/dashboard` | app/warehouse-hub/dashboard/page.tsx | Built against client/public/design/warehouse_hub_dashboard.html. | real API | **WORKING** |  |
| `/warehouse-hub/docks` | app/warehouse-hub/docks/page.tsx | Built against client/public/design/warehouse_hub_dock_slots.html. | real API | **WORKING** |  |
| `/warehouse-hub/insurance` | app/warehouse-hub/insurance/page.tsx | Renders <InsuranceDashboard> | real API | **WORKING** |  |
| `/warehouse-hub/notifications` | app/warehouse-hub/notifications/page.tsx | Renders <NotificationCenter> | real API | **WORKING** |  |
| `/warehouse-hub/profile` | app/warehouse-hub/profile/page.tsx | Page component (217 lines) | real API | **WORKING** |  |


**PWA.** Manifest at `client/src/app/manifest.ts` (standalone, portrait, icons from Cloudinary). Service worker at `client/public/sw.js` (100 lines): network-first navigations, cache-first `/_next/static`, **never** caches `/api`, `/offline` fallback. Registered in production only (`components/ui/PwaProvider.tsx:37-47`). Installable.

**i18n.** `client/src/i18n/messages/{en,te,hi}.json`, **3,697 keys each at exact parity**. Te: 99.2% of values in Telugu script. Hi: 99.3% in Devanagari. The remainder are emails, UPI/IFSC placeholders and "%" labels. Hard-coded JSX strings outside next-intl were not measured. **Bhashini is not called anywhere (0 references).**

**Permissions.** Location: `navigator.geolocation.getCurrentPosition` on tap only, in `components/customer/LocationChip.tsx`, and **also on mount** in `lib/useBookingFlow.ts:87`. Notifications: `Notification.requestPermission()` from a click in `lib/useNotificationPermission.ts`. The customer is asked on the tracking screen at `matched`/`accepted` (`app/customer/track/[bookingId]/page.tsx`); the worker dashboards still ask on first load (`components/worker/WorkerDashboard.tsx`). A real notification is sent on status change while the tab is hidden (`lib/bookingAlerts.ts`).

**Mode switcher.** Real filtering. `lib/customerMode.ts` derives mode from the URL. `lib/bookingMode.ts` buckets bookings by category slug. Server-side, `services/notificationMode.ts` scopes notifications, and search is scoped per mode (`tests/search.test.ts`, `tests/notificationMode.test.ts`). The promotional carousel shows on Household only.

---

## 6. Data models

57 models in `server/src/models` (plus `WorkerPricingProfile`, whose `model<…>(` call spans lines). **8 carry 2dsphere indexes** (bold below). **No model defines any `pre()` hook**, so nothing at schema level blocks updates to ledger or audit rows.

| MODEL | FILE | FIELDS | REFS | INDEXES (geo in bold) |
|---|---|---|---|---|
| AssistantConversation | models/AssistantConversation.ts | role, text, evidence, confidence, provider, suggestedCategorySlug | Complaint, User | { userId: 1, updatedAt: -1 } |
| AuditLog | models/AuditLog.ts | actorId, actorRole, action, targetType, targetId, details, timestamp | User | { timestamp: -1 } |
| Bid | models/Bid.ts | bookingId, bidderId, bidderRole, amount, message, status | Booking, User | { bookingId: 1, status: 1 }; { bookingId: 1, bidderId: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } } |
| Booking | models/Booking.ts | customerId, type, region, serviceCategorySlug, pricingMode, unitType, quantity, frozenUnitDeclaration, quotationId, preferredWorkerId, cargoDetails, pickupLocation, dropLocation, stops, requiredVehicles, requiredHamaliCount, assignedDriverIds, assignedHamaliIds, assignedMuthaId, rejectedByUserIds, status, fareBreakdown, distanceKm, statusHistory, proofPhotos, diagnosisPhotoUrl, diagnosisSummary, scheduledFor, openForBidding | Mutha, Quotation, User | **{ pickupLocation: '2dsphere' }**; **{ dropLocation: '2dsphere' }**; { customerId: 1, status: 1 }; { region: 1, status: 1 }; { status: 1, scheduledFor: 1 } |
| Certification | models/Certification.ts | userId, title, endorsedSkills, issuedAt, validUntil, status, qrPayload | User | { userId: 1, title: 1 }, { unique: true } |
| ChatMessage | models/ChatMessage.ts | bookingId, senderId, senderRole, text | Booking, User | { bookingId: 1, createdAt: 1 } |
| Checkpoint | models/Checkpoint.ts | name, location, type, cctvAvailable, securityRating, operatingHours, verifiedBy, amenities, corridor | — | **{ location: '2dsphere' }**; { corridor: 1 } |
| CommissionRecord | models/CommissionRecord.ts | bookingId, muthaId, workerId, grossAmount, commissionRatePct, commissionAmount, welfareRatePct, welfareAmount, netAmount | Booking, Mutha, User | { bookingId: 1, workerId: 1 }, { unique: true }; { workerId: 1, createdAt: -1 }; { muthaId: 1, createdAt: -1 } |
| Complaint | models/Complaint.ts | bookingId, raisedByUserId, againstUserId, againstMuthaId, category, description, status, resolutionNote, handledByUserId, resolvedAt | Booking, Mutha, User | { description: 'text' }, { name: 'complaint_search' } |
| Dispute | models/Dispute.ts | from, message, at | Booking, User | { status: 1, createdAt: -1 } |
| DockSlot | models/DockSlot.ts | hubId, label, status, currentBookingId, etaAt | Booking, WarehouseHub | { hubId: 1, label: 1 }, { unique: true } |
| EmergencyAlert | models/EmergencyAlert.ts | raisedByUserId, raisedByRole, kind, note, bookingId, location, status, acknowledgedByUserId, acknowledgedAt, resolvedByUserId, resolvedAt, resolutionNote | Booking, User | { status: 1, createdAt: 1 }; **{ location: '2dsphere' }, { sparse: true }** |
| FareRule | models/FareRule.ts | region, category, baseFare, perKmRate, minimumFare, surgeMultiplier, setByAdminId, effectiveFrom, active | User | { region: 1, category: 1, active: 1 } |
| Federation | models/Federation.ts | phone, email, address | Federation | { parentFederationId: 1 }; { type: 1, region: 1 }; { registrationNumber: 1 }, { unique: true } |
| Feedback | models/Feedback.ts | userId, userRole, category, message, requestedService, screenshotUrl, status, adminNote, handledByUserId | User | { userId: 1, createdAt: -1 }; { category: 1, status: 1 } |
| Fleet | models/Fleet.ts | ownerId, name, vehicleIds, driverIds | User, Vehicle | — (plus any field-level unique/index) |
| FraudCase | models/FraudCase.ts | userId, signalIds, severity, status, notes, resolvedByAdminId, resolvedAt | FraudSignal, User | { status: 1, createdAt: -1 } |
| FraudSignal | models/FraudSignal.ts | userId, detectorType, severity, evidence, caseId, detectedAt | FraudCase, User | { userId: 1, detectedAt: -1 } |
| GateEvent | models/GateEvent.ts | hubId, type, bookingId, vehicleId, userId, note | Booking, User, Vehicle, WarehouseHub | { hubId: 1, createdAt: -1 } |
| GovernmentWageFloor | models/GovernmentWageFloor.ts | state, zone, skillBand, monthlyRate, basicComponent, vdaComponent, dailyRate, hourlyRate, workingDaysPerMonth, workingHoursPerDay, scheduledEmployment, notificationNumber, notificationDate, effectiveFrom, effectiveUntil, sourceType, sourceUrl, sourceNote, setByAdminId, active | User | { state: 1, zone: 1, skillBand: 1, active: 1 } |
| HaltEvent | models/HaltEvent.ts | bookingId, driverId, checkpointId, arrivalTime, departureTime, driverGeoAtHalt, photoProofUrl, odometerReading, sealIntact | Booking, Checkpoint, User | { bookingId: 1, arrivalTime: 1 }; **{ driverGeoAtHalt: '2dsphere' }** |
| HamaliProfile | models/HamaliProfile.ts | userId, type, workerKind, muthaId, skills, physicalCapacityKg, availabilityStatus, currentLocation, willingLocation | Mutha, User | **{ currentLocation: '2dsphere' }**; **{ willingLocation: '2dsphere' }, { sparse: true }** |
| Incentive | models/Incentive.ts | targetUserId, targetMuthaId, period, ratingAvgAtGrant, bonusAmount, criteriaSnapshot, grantedByAdminId | Mutha, User | — (plus any field-level unique/index) |
| IncentiveRule | models/IncentiveRule.ts | minRatingAvg, minCompletedJobs, bonusAmount, region, active, createdByAdminId | User | — (plus any field-level unique/index) |
| InsuranceClaim | models/InsuranceClaim.ts | userId, policyId, incidentDescription, incidentDate, status, payoutAmount, photos, reviewedByUserId, reviewNote | InsurancePolicy, User | { userId: 1, createdAt: -1 }; { status: 1, createdAt: -1 } |
| InsurancePlan | models/InsurancePlan.ts | name, type, category, coverageAmount, description, forRoles, active, premium, defaultTrigger | — | { active: 1, category: 1 } |
| InsurancePolicy | models/InsurancePolicy.ts | userId, planId, status, startDate, endDate | InsurancePlan, User | { userId: 1, status: 1 } |
| LedgerEntry | models/LedgerEntry.ts | type, entityType, entityId, amount, status, description, region, timestamp | — | { timestamp: -1 }; { type: 1, timestamp: -1 } |
| LoadManifest | models/LoadManifest.ts | sku, description, weightKg, quantity | Booking | — (plus any field-level unique/index) |
| MaintenanceSchedule | models/MaintenanceSchedule.ts | vehicleId, fleetId, type, dueAt, dueMileageKm, description, status, completedAt | Fleet, Vehicle | { fleetId: 1, status: 1 } |
| MemberShare | models/MemberShare.ts | userId, muthaId, shareCount, shareValue, issuedAt | Mutha, User | { userId: 1, muthaId: 1 }, { unique: true }; { muthaId: 1 } |
| Mutha | models/Mutha.ts | name, leaderId, memberIds, region, photo, inviteCode, ratingAvg, ratingCount, activeJobsCount, societyRegistrationNumber, registeredUnderAct, districtFederationId, affiliationStatus, commissionRatePct, welfareDeductionRatePct | Federation, User | { districtFederationId: 1, affiliationStatus: 1 }; { name: 'text' }, { name: 'mutha_search' } |
| Notification | models/Notification.ts | userId, type, title, body, link, read | User | { userId: 1, createdAt: -1 }; { userId: 1, read: 1 } |
| ParametricTrigger | models/ParametricTrigger.ts | checkedAt, periodIndex, periodStart, periodEnd, actualValue, triggered, paidAt, payoutId, payoutFailureReason | InsurancePolicy, Payout | { policyId: 1 } |
| Payment | models/Payment.ts | bookingId, amount, method, status, razorpayOrderId, razorpayPaymentId, codConfirmedBy | Booking, User | { bookingId: 1 } |
| Payout | models/Payout.ts | userId, amount, period, status, breakdown, source, sourceRefId, decidedByAdminId, decidedAt | User | { status: 1, createdAt: -1 }; { userId: 1, source: 1, status: 1, createdAt: -1 } |
| PlatformSetting | models/PlatformSetting.ts | parametricPayoutsEnabled, platformCommissionPct | — | — (plus any field-level unique/index) |
| Poll | models/Poll.ts | label, value | Mutha, User | { muthaId: 1, status: 1 } |
| PromoBanner | models/PromoBanner.ts | title, body, ctaLabel, ctaHref, imageUrl, mode, region, startsAt, endsAt, order, active, sourceKey, createdByAdminId | User | { active: 1, mode: 1, order: 1 } |
| Quotation | models/Quotation.ts | description, unitType, quantity, rate, amount, isMaterial, materialIsEstimate | Booking, User | { customerId: 1, updatedAt: -1 }; { workerId: 1, status: 1, updatedAt: -1 } |
| Rating | models/Rating.ts | bookingId, fromUserId, toUserId, toMuthaId, score, comment | Booking, Mutha, User | { bookingId: 1, fromUserId: 1 }, { unique: true } |
| RatingDeferral | models/RatingDeferral.ts | bookingId, userId, remindAt | Booking, User | { bookingId: 1, userId: 1 }, { unique: true }; { userId: 1, remindAt: 1 } |
| Referral | models/Referral.ts | referrerId, referredPhone, referredUserId, status, bonusAmount, code | User | { referrerId: 1, referredPhone: 1 }, { unique: true }; { code: 1 }; { status: 1 } |
| Region | models/Region.ts | name, enabled, launchedByAdminId | User | — (plus any field-level unique/index) |
| SavedAddress | models/SavedAddress.ts | userId, label, address, coordinates | User | { userId: 1 }; **{ coordinates: '2dsphere' }** |
| ServiceCategory | models/ServiceCategory.ts | name, slug, icon, accentColor, pricingUnit, requiredSkills, requiresVehicle, requiresMaterials, defaultDurationMinutes, minWorkers, dispatchType, guaranteeEligible, guaranteePeriodDays, active | — | { active: 1 }; { name: 'text', slug: 'text' }, { name: 'service_category_search' } |
| SocietyRateFloor | models/SocietyRateFloor.ts | societyId, categorySlug, mode, unitType, minimumRate, setByLeaderId, setByPollId | Mutha, Poll, User | — (plus any field-level unique/index) |
| SurgeZone | models/SurgeZone.ts | name, multiplier, expiresAt, isManual, createdBy | User | { name: 1, expiresAt: -1 } |
| SurplusDistribution | models/SurplusDistribution.ts | userId, shareCount, amount | Mutha, User | { muthaId: 1, periodStart: 1, periodEnd: 1 }, { unique: true } |
| TrainingModule | models/TrainingModule.ts | title, description, durationMinutes, order, forRoles, content, ncctProgrammeCode, cPecAligned, tradeArea | — | { order: 1 } |
| TrainingProgress | models/TrainingProgress.ts | userId, moduleId, status, completedAt | TrainingModule, User | { userId: 1, moduleId: 1 }, { unique: true } |
| User | models/User.ts | type, url, status, rejectionReason, expiryDate, uploadedAt, reviewedAt, reviewedByAdminId | Federation, User | { name: 'text' }, { name: 'user_search' } |
| VariationOrder | models/VariationOrder.ts | quotationId, bookingId, requestedByWorkerId, customerId, description, amount, status, requestedAt, customerApprovedAt, rejectedAt, customerNote | Booking, Quotation, User | — (plus any field-level unique/index) |
| Vehicle | models/Vehicle.ts | ownerId, type, capacityKg, registrationNumber, photos, insuranceExpiryAt, verified, currentLocation, willingLocation, availabilityStatus, assignedDriverId, complianceStatus | User | **{ currentLocation: '2dsphere' }**; **{ willingLocation: '2dsphere' }, { sparse: true }** |
| VehicleInspection | models/VehicleInspection.ts | item, result, note | Fleet, User, Vehicle | { vehicleId: 1, createdAt: -1 } |
| Vote | models/Vote.ts | pollId, userId, optionIndex, votedAt | Poll, User | { pollId: 1, userId: 1 }, { unique: true } |
| WarehouseHub | models/WarehouseHub.ts | ownerId, name, location, address, totalDockSlots, operatingHours, gateContacts | User | **{ location: '2dsphere' }** |
| WorkerPricingProfile | models/WorkerPricingProfile.ts | workerId, categorySlug, modesOffered, hourly, perUnit, perTask, active | User | see file |

---

## 7. Real-time, Redis, payments and ledger

**Socket.io** (`server/src/realtime/`). The handshake is authenticated (`socketAuth.ts`, socket token or cookie).

| Event | Direction | Emitted by | Listened by |
|---|---|---|---|
| `booking:join` / `booking:leave` | client → server | `lib/useBookingSocket` | `handlers.ts:20,56` (room membership, sends chat history) |
| `booking:chat_history` | server → client | `handlers.ts:43` | booking socket hook |
| `booking:chat_message` | both | client chat panel / `handlers.ts:119` (persists `ChatMessage`, broadcasts) | chat panel |
| `booking:location` | worker → server | worker active-job screen | `handlers.ts:88` (assigned worker, `in_progress` only) |
| `booking:location_update` | server → room | `handlers.ts:115` | customer track map |
| `booking:offer` | server → one worker | `offerEngine.ts` via `emitters.emitBookingOffer` | `lib/useIncomingOffer.ts` |
| `booking:offer_response` | worker → server | `useIncomingOffer.ts:65` | `handlers.ts:62` |
| `booking:offer_closed`, `booking:matched`, `booking:status` | server → client | `emitters.ts` | offer card / track page |

**Redis adapter: not installed, not configured.** Redis appears only in a comment (`middleware/rateLimit.ts:5`). Offer state (`offerEngine.ts:33`) and rate-limit counters are per-process memory, so a second instance would split them.

**Background jobs.** Two in-process `setInterval` loops started in `server.ts:74-75`: scheduled-booking release every 60 s (`scheduledBooking.service.ts:17`) and incentive runner daily (`scheduledIncentiveRunner.service.ts:53`). No queue, no cron. Parametric checks run on worker page load and via the admin `run-check` endpoint. Referral payouts: admin endpoint only (no UI). Boot seeders: categories, training, wage floors, promo banners.

**Payments.**
- Razorpay order creation is real code but gated (`payment.service.ts:22`).
- The client never loads Checkout. It calls `POST /api/payments/:bookingId/mock-capture`, which 404s when `MOCK_EXTERNAL_SERVICES=false`.
- The webhook route is public (correct), but `verifyWebhookSignature` returns `true` if MOCK is on or `RAZORPAY_WEBHOOK_SECRET` is unset. A crafted `payment.captured` for a known order id would then mark it paid and post revenue to the ledger (`payment.controller.ts:188-230`).
- `timingSafeEqual` throws on a length mismatch, giving a 500 instead of a 400.
- COD: customer creates it, the assigned worker confirms (`:117`). There is no reconciliation report.

**Ledger.** `models/LedgerEntry.ts` types include commission, welfare_fund, equity, surplus and revenue. The single writer is `services/ledger.service.ts:21` (`create` only). No update or delete endpoint exists. **Append-only by convention only** — no schema hook, DB permission split or hash chaining. The comment at `ledger.service.ts:17` ("Not yet wired into real booking/payment/payout flows") is stale: payment, payout, governance, commission and parametric flows all write to it.

---

## 8. Tests and security findings

**Test run (this audit).** Local, in-memory MongoDB, no network, no production writes: **server 63/63 suites, 605/605 tests passed (exit 0)**; **client 9/9 files, 54/54 tests passed (exit 0)**.

659 tests across 72 files: 63 server suites, 9 client files.

| Claims | Covering suites |
|---|---|
| 1–2, 6 | `booking`, `scheduledBooking`, `matching`, `fare`, `fareRule`, `workerKinds`, `requests` |
| 4–5 | `workPricing` (27), `quotation` (20), `wageFloor` (18) |
| 7 | `realtime`, `sessionTransport` |
| 9 | `rating` |
| 10–12 | `payment` (18, mock mode), `e2eMoneyChain`, `taxInvoice`, `earnings`, `adminPlatformCommission`, `ledger`, `payoutGeneration` |
| 13–16, 18, 20 | `federation`, `governance`, `mutha`, `selfServiceDispute`, `complaint` |
| 19 | `auditLog` |
| 22–25 | `parametricInsurance`, `insuranceEnrollment`, `emergencyAndGuarantee` |
| 26 | `kycDocument`, `availability`, `profileSecurity`, `auth` |
| 35–41 | `assistant` (21, incl. safety guardrail), `aiProviderChain`, `agentsRbac`, `scanAndPromo`, `analytics` |
| mode scoping | `search`, `notificationMode` |

**Security findings, most severe first.**
1. **KYC documents publicly retrievable by URL.** Aadhaar/PAN images upload with Cloudinary's default public delivery (`cloudinary.service.ts:47`, called from `kycDocument.controller.ts:73`). Use `type: 'authenticated'` with signed URLs.
2. **Webhook signature bypass when the secret is missing** (`payment.service.ts:49`). A production deploy without `RAZORPAY_WEBHOOK_SECRET` accepts forged captures.
3. **OTP returned in the API response in mock mode** (`otp.service.ts:34`, `devCode`). Harmful if any production environment runs with MOCK=true.
4. **Per-IP rate limits ineffective in production** (Cloudflare edge IP). Login is still protected per account; signup and other IP-keyed limits are not.
5. **In mock mode, KYC uploads store a fake URL as a real document** (`kycDocument.controller.ts:73` ignores `mock`).
6. `SameSite=None` on first-party session cookies. Could now be `Lax` for CSRF depth once cached PWAs refresh.

**Clean:**
- No secrets committed: tracked `.env*` files are `client/.env.production` (public URLs only) and `server/.env.example` (placeholders).
- CORS is a single allowed origin (`app.ts:91`) and helmet is on.
- 142 of 154 mutating endpoints have route-level validators; the 12 without take no body, except the webhook.

**Code health.** TODO/FIXME/HACK/XXX in source: **0**. Dead or orphaned code:
- 27 API-only endpoints with no UI caller (marked DEAD above).
- `/otp-verification` (UI-only stub, unlinked) and `/styleguide`.
- Referral and certification pages in every worker area have no inbound link.
- Duplicated logic: the `/skilled` and `/agri` areas are thin copies of the `/hamali` page wrappers (shared components, separate route files).
- Worker dashboards still ask for notification permission on first load; the booking flow asks for location on mount (`useBookingFlow.ts:87`), contradicting the tap-only rule used elsewhere.

---

## 9. Recommended build order

Ranked by: (a) visible in a 2-minute judge demo, (b) claimed on slides, (c) effort. Things a judge can click into and find broken come first.

| # | Gap | Demo-visible | On slides | Effort | Why now |
|---|---|---|---|---|---|
| 1 | **Online payment**: add Razorpay Checkout (test keys) on the client, or make mock-capture work independently of the Cloudinary flag | Yes — "Pay" after a job | Claim 10 | S | Likely 404s in production today. |
| 2 | **Customer confirms completion**: an "Confirm job done" step (or OTP handover) before `completed` | Yes — end of the core loop | Claim 8 | S | Core-flow claim with nothing behind it. |
| 3 | **Wage-floor dataset expiry**: honour `effectiveUntil` or extend it, and label the source on screen | Yes — the 422 rate message | Claim 5 | S | Expires 2026-09-30. |
| 4 | **KYC documents private** (`type: 'authenticated'`, signed URLs) | Only if asked | Claims 27, 44 | S | Aadhaar exposure is the worst single finding. |
| 5 | **Webhook**: require the secret whenever MOCK=false | No | Claim 10 | S | Forged payment captures. |
| 6 | **Fee split as claimed**: customer-side 10% with 5/3/1/1 ledger postings, or change the slide | Yes — fare breakdown | Claim 12 | M | Slides and receipts disagree. |
| 7 | **Urgent booking**: flag + priority dispatch (wider radius, first in the offer queue) | Yes | Claim 3 | M | — |
| 8 | **Demand-indexed welfare pool** (regional index, pro-rata active days, auto payout) | Partly — dashboard | Claims 22–23 | L | Current trigger is the opposite design. |
| 9 | **Disputes routed to society/federation** | Partly | Claim 20 | M | Routing field + role checks. |
| 10 | **Leader books for phone-less members** | Yes on society screens | Claim 17 | M | — |
| 11 | **TARA retrieval** over a small help/policy corpus (real RAG) | Yes | Claim 35 | M | — |
| 12 | **Redis adapter + shared rate-limit store** | No | Claim 43 | M | Scaling claim with zero code. |
| 13 | Government integrations (e-KYC, DigiLocker, e-Shram, police, Bhashini, SMS/IVR, ONDC) | Only if claimed live | 27–34 | L each | Present as roadmap unless sandboxed. |
| 14 | Consent capture at signup + purpose notice | Yes at signup | Claim 45 | S | — |

---

## Appendix A — Repo map, stack, deployment, environment

**Monorepo** (npm workspaces, root `package.json`): `shared` → `server` → `client`.

| Package | Framework | Entry | Scripts |
|---|---|---|---|
| `shared/` (`@fyro/shared`) | TypeScript types and constants | `dist/types.js` | `build` |
| `server/` | Express 4.22.2 + Mongoose 8.24.3 + Socket.io 4.8.3 | `src/server.ts` → `dist/server.js` | `dev`, `build`, `start`, `test` (jest), `seed:admin|demo|training|federations|categories|checkpoints|fares|insurance|wage-floors` |
| `client/` | Next.js 14.2.5 (App Router), React 18.3.1, next-intl 4.13.7, Tailwind 3.4.19, Leaflet 1.9.4 | `src/app` | `dev`, `build`, `start`, `lint` (no ESLint config present), `test` (vitest) |

Other versions (installed): TypeScript 5.4.5, razorpay 2.9.8, cloudinary 2.10.0, jsonwebtoken 9.0.3, bcrypt 5.1.1, helmet 7.2.0, express-rate-limit 7.5.1, zod 3.25.76, pdfkit 0.19.1, @anthropic-ai/sdk 0.120.0, jest 29.7.0, vitest 3.2.7, mongodb-memory-server 9.5.0. **Redis: not a dependency anywhere.**

**Deployment**

| File | Deploys |
|---|---|
| `render.yaml` | Web service `fyro-server`, free plan, `npm ci --include=dev && npm run build:server`, `node server/dist/server.js`. Sets `MOCK_EXTERNAL_SERVICES="true"` (dashboard values override). |
| `client/vercel.json` | Vercel project rooted at `client/`, install and build run from the repo root. |
| `client/next.config.js` | Rewrites `/api/*` → Render (`API_PROXY_TARGET` or the hard-coded Render URL) so the session cookie is first-party. |
| Dockerfile / CI workflows | **NOT FOUND** |

**Environment variables (names only).** Server (`server/src/config/env.ts`) — required: `CLIENT_ORIGIN`, `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ADMIN_PHONE`, `ADMIN_PASSWORD`. Optional: `NODE_ENV`, `PORT`, `MOCK_EXTERNAL_SERVICES` (default **true**), `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET`, `LOCATIONIQ_API_KEY`, `RAZORPAY_KEY_ID/KEY_SECRET/WEBHOOK_SECRET`, `PARAMETRIC_PAYOUTS_ENABLED`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `GROQ_API_KEY`, `AI_PROVIDER`, `PLATFORM_GSTIN`, `PLATFORM_LEGAL_NAME`, `TRUST_PROXY_HOPS`. Client: `NEXT_PUBLIC_API_BASE`, `NEXT_PUBLIC_SOCKET_URL`, `NEXT_PUBLIC_HERO_VIDEO_URL`, `API_PROXY_TARGET`.

`MOCK_EXTERNAL_SERVICES` switches Cloudinary (`cloudinary.service.ts:34`), Razorpay orders (`payment.service.ts:22`), webhook verification (`:49`), the mock-capture route (`payment.controller.ts:236`) and OTP delivery (`otp.service.ts:34-49`) together. One flag cannot give real uploads and mock payments at the same time.
