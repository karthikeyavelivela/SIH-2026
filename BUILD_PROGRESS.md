# FYRO — SIH final build progress

Branch: `sih-final-build` (from `main` @ `43dda15`). Source of truth for the starting state: `FYRO_BUILD_AUDIT.md`.
Baseline tests: server 605 (63 suites), client 54 (9 files).

Status legend: TODO / IN PROGRESS / DONE / BLOCKED (reason).

## Tasks

| ID | Task | Status | Commit | Notes |
|---|---|---|---|---|
| SETUP | Branch, progress file, audit committed | IN PROGRESS | | |
| P0.1 | Split mock flags; real Razorpay test mode; verify endpoint; webhook hardening; COD reconciliation | TODO | | |
| P0.2 | Customer confirms completion (awaiting_confirmation, code, auto-confirm) | TODO | | |
| P0.3 | Wage floor dates, staleness, per-task/unit conversion, source display, admin screen | TODO | | |
| P0.4 | Security: private KYC + signed URLs + migration, masked Aadhaar, OTP devCode, CF IP keying, headers | TODO | | |
| PHASE-0-TESTS | Full server + client suites | TODO | | |
| P1.1 | Fee split: rate + 10% (5/3/1/1), settlement, ledger, invoice | TODO | | |
| P1.2 | Demand-indexed welfare pool | TODO | | |
| P1.3 | Workmanship guarantee loop | TODO | | |
| P1.4 | Urgent booking | TODO | | |
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

## Migrations needed

| Order | Script | Dry run | Apply |
|---|---|---|---|

## HUMAN INPUT NEEDED

(filled in as tasks surface them)
