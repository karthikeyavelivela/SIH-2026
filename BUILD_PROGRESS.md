# FYRO — SIH final build progress

Branch: `sih-final-build` (from `main` @ `43dda15`). Source of truth for the starting state: `FYRO_BUILD_AUDIT.md`.
Baseline tests: server 605 (63 suites), client 54 (9 files).

Status legend: TODO / IN PROGRESS / DONE / BLOCKED (reason).

## Tasks

| ID | Task | Status | Commit | Notes |
|---|---|---|---|---|
| SETUP | Branch, progress file, audit committed | DONE | 5b757b2 |  |
| P0.1 | Split mock flags; real Razorpay test mode; verify endpoint; webhook hardening; COD reconciliation | DONE | 038be8a | Checkout+verify, webhook hardening, boot guard, COD reconciliation |
| P0.2 | Customer confirms completion (awaiting_confirmation, code, auto-confirm) | DONE | 1384719 | code + confirm/report + auto-confirm; single finalize path |
| P0.3 | Wage floor dates, staleness, per-task/unit conversion, source display, admin screen | DONE | 18dae72 | dates+stale, per-task/unit conversion, source citations, admin screen |
| P0.4 | Security: private KYC + signed URLs + migration, masked Aadhaar, OTP devCode, CF IP keying, headers | DONE | b86b8de | private KYC + signed links + migration, CF IP keying, headers |
| PHASE-0-TESTS | Full server + client suites | DONE |  | server 662/664 full run: sessionTransport timeout under load (fixed, 90s) + 1 not reproduced on re-run; client 66/66 |
| P1.1 | Fee split: rate + 10% (5/3/1/1), settlement, ledger, invoice | DONE | f154c26 | fee on top, 4-way ledger split, worker keeps 100%, admin screen |
| P1.2 | Demand-indexed welfare pool | DONE | 6800f64 | weekly demand index, district pools, capped pro-rata payouts |
| P1.3 | Workmanship guarantee loop | DONE | 6338e50 | re-work booking, materials-only pricing, reserve-paid labour, training after 2 claims |
| P1.4 | Urgent booking | DONE | 22fba0c | urgent flag, 3/6/10 km rings, 12 s countdown, urgent-first feeds |
| P1.5 | Dispute routing by level with SLA | TODO | | |
| P1.6 | Institutions and bulk contracts | TODO | | |
| P1.7 | Proxy members (no phone) | TODO | | |
| P1.8 | Consent and privacy (+ C0 verification data + permission fixes) | TODO | | |
| PHASE-1-TESTS | Full suites | TODO | | |
| P2.1 | fyro-ml Python service (forecast / allocate / price-anomaly) + mlClient | TODO | | |
| P2.2 | Allocation UI (recommended crew) + fairness panel | TODO | | |
| P2.3 | TARA: provider order, knowledge base, retrieval, citations | TODO | | |
| P2.4 | Document pre-check with OCR | TODO | | |
| PHASE-2-TESTS | Full suites + pytest | TODO | | |
| P3.1 | Redis scaling (adapter, rate-limit store, offer state, BullMQ, read prefs) | TODO | | |
| PHASE-3-TESTS | Full suites | TODO | | |
| P4.1 | Aadhaar Paperless Offline e-KYC | TODO | | |
| P4.2 | Bhashini ASR/TTS/translate | TODO | | |
| P4.3 | SMS + IVR + real forgot-password | TODO | | |
| P4.4 | DigiLocker, e-Shram, police verification, PMSBY/PMJJBY, ONDC catalogue | TODO | | |
| STAGE-A-FINAL | All suites, tsc, production builds | TODO | | |
| B1 | DEPLOY_CHECKLIST.md | TODO | | |
| B2 | Summary, then STOP | TODO | | |

## Env vars introduced

| Name | Service | Default | Purpose |
|---|---|---|---|
| MOCK_PAYMENTS | Render API | falls back to MOCK_EXTERNAL_SERVICES | true = fake orders + /mock-capture mounted; false = real Razorpay (test mode) |
| MOCK_UPLOADS | Render API | falls back to MOCK_EXTERNAL_SERVICES | true = fake Cloudinary URLs |
| MOCK_OTP | Render API | falls back to MOCK_EXTERNAL_SERVICES | true = no SMS sent |
| RAZORPAY_KEY_ID | Render API | unset | Razorpay test key id (public; also returned to Checkout) |
| RAZORPAY_KEY_SECRET | Render API | unset | Razorpay test key secret (verify HMAC) |
| RAZORPAY_WEBHOOK_SECRET | Render API | unset | Webhook HMAC secret; required at boot when MOCK_PAYMENTS=false in production |
| AUTO_CONFIRM_HOURS | Render API | 24 | Hours before an unconfirmed finished job is confirmed automatically |
| TRUST_CLOUDFLARE | Render API | false | Key per-IP rate limits on CF-Connecting-IP (true on Render, which is behind Cloudflare) |
| WELFARE_TRIGGER_INDEX | Render API | 0.6 | Demand index below which the district pool pays |
| WELFARE_PAYOUT_CAP_PCT | Render API | 40 | Most of the pool one weekly check may pay |
| WELFARE_PER_MEMBER_CAP | Render API | 1000 | Most one member receives per week (rupees) |
| WELFARE_MIN_SOCIETY_MEMBERS | Render API | 5 | Smallest society checked on its own |
| WELFARE_MIN_ACTIVE_DAYS | Render API | 8 | Days available/working in 28 to count as active |
| WELFARE_MIN_HISTORY_WEEKS | Render API | 4 | Weeks of history needed before an index is computed |
| INDIVIDUAL_EARNINGS_TRIGGER | Render API | false | Old per-worker earnings trigger (tests only) |
| URGENT_RADII_KM | Render API | 3,6,10 | Urgent search rings in km (then the ordinary 25 km) |
| URGENT_OFFER_TIMEOUT_MS | Render API | 12000 | Countdown for an urgent offer (ordinary: 20000) |
| DISPUTE_SLA_HOURS | Render API | 48 | Hours a dispute waits at one level before escalating by itself |

## Migrations needed

| Order | Script | Dry run | Apply |
|---|---|---|---|
| 1 | server/src/scripts/migrateKycPrivate.ts | `npm run migrate:kyc-private --workspace server` | `npm run migrate:kyc-private --workspace server -- --apply` |
| 2 | none (P1.1 is forward-only) | `Bookings priced before P1.1 keep total = worker rate and settle with the old 1% + bye-law deductions; nothing to backfill` | `n/a` |

## HUMAN INPUT NEEDED

(filled in as tasks surface them)
- Razorpay TEST-mode key id, key secret and webhook secret (Razorpay dashboard, Test mode). Webhook URL: https://<render-api>/api/payments/webhook with events payment.captured, payment.failed, order.paid.
- Wage floor (P0.3): the seeded AP figures come from a secondary compilation and expire 2026-09-30. To replace them, enter in /admin/wage-floors, per zone and skill band: monthly rate (basic + VDA), scheduled employment, notification number, notification date, effective from/until, sourceType=gazette, and the gazette URL. Also enter the notifications that actually cover domestic work and agricultural labour (the seeded one is Shops and Commercial Establishments).
- P0.4: after deploy, run the KYC migration dry run on Render (Shell tab), review the report, then run it with --apply. Until then, older KYC documents stay publicly reachable by URL (no longer listed anywhere in the API).
- P1.1: confirm with a tax professional that 18% GST applies to the FYRO service fee (taxInvoice.service.ts SERVICE_FEE_RATE, shown inclusive), alongside the existing 5% GTA and 18% labour rates.
- P1.1: society commissionRatePct / welfareDeductionRatePct are deprecated (no longer deducted from members). District federation caps on them now only matter for bookings priced before the fee; decide whether federations should instead cap society rate floors.
- P1.2: the welfare parameters (trigger 0.6, 40% pool cap, Rs 1,000 per member per week, 8 active days in 28, 5-member societies, 4 weeks minimum history) are the build brief's defaults, not federation decisions. Confirm or change them (env vars) before the pool pays real money.

