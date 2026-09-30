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
| P1.5 | Dispute routing by level with SLA | DONE | 63719ef | levels + 48h SLA + scoped resolver queues + triage for all |
| P1.6 | Institutions and bulk contracts | DONE | 67f7084 | institution accounts, contracts lifecycle, visit generation, monthly GST invoice |
| P1.7 | Proxy members (no phone) | DONE | (this commit) | leader-managed members, KYC/payout with consent, claim code + public /claim-account; also fixed date-dependent contracts test |
| P1.8 | Consent and privacy (+ C0 verification data + permission fixes) | DONE | (this commit) | versioned ConsentRecord + signup step + /privacy (en/te/hi) + profile consent/export; location on tap; notification prompt after first job; seed/cleanup:verification; R10 exclusions |
| PHASE-1-TESTS | Full suites | DONE | (this commit) | server 739/739 (76 suites) + tsc clean; client 83/83 + tsc clean |
| P2.1 | fyro-ml Python service (forecast / allocate / price-anomaly) + mlClient | DONE | (this commit) | ml/ FastAPI (XGBoost, OR-Tools CP-SAT, IsolationForest), train.py with honest metrics, mlClient 3 s timeout + rules fallback, forecast agent + hourly-rate check wired, /api/health ml status, render.yaml service; pytest 19, server 13 |
| P2.2 | Allocation UI (recommended crew) + fairness panel | DONE | (this commit) | POST /api/mutha/allocation/recommend (ML or rules, labelled), AllocationLog recommendation-vs-final, RecommendedCrew on /mutha/requests + assign-members (covers contract visits), GET /api/federation/fairness + FairnessPanel; server 8, client 3 |
| P2.3 | TARA: provider order, knowledge base, retrieval, citations | DONE | (this commit) | order Groq, Gemini, Anthropic, rules; /api/health activeProvider; server/knowledge/*.md (10 files) + KnowledgeChunk + buildKnowledge; Gemini embeddings or IDF-lexical fallback, optional Atlas vector index; citations in evidence; escalate line; hazard guardrail (gas/electrical/structural) runs before any model; 20 tests |
| P2.4 | Document pre-check with OCR | DONE | (this commit) | tesseract.js (eng/tel/hin) behind DOC_OCR_ENABLED (off); pure analysis (masked/unmasked Aadhaar, PAN/GSTIN/DL shapes, fuzzy name, year); only an unmasked Aadhaar refuses an upload (422, nothing kept), everything else is a recommendation on the document for the admin; synthetic fixtures + make_fixtures.py; real-OCR test opt-in (RUN_OCR_TESTS=1), verified passing; 20 tests |
| PHASE-2-TESTS | Full suites + pytest | DONE | (this commit) | server 798 passed + 3 opt-in skipped (80 suites), client 86/86, pytest 19/19, tsc clean (server, client) |
| P3.1 | Redis scaling (adapter, rate-limit store, offer state, BullMQ, read prefs) | DONE | (this commit) | active only when REDIS_URL set: @socket.io/redis-adapter, rate-limit-redis (9 limiters, own prefixes), offer state write-through to Redis with seq-guarded countdowns + per-booking lock, BullMQ repeatable jobs for scheduled-booking release / incentives / welfare check / contract visits, secondaryPreferred on analytics/federation-dashboard/report reads, /api/health redis; 18 tests (ioredis-mock, mocked bullmq) |
| PHASE-3-TESTS | Full suites | TODO | | |
| P4.1 | Aadhaar Paperless Offline e-KYC | DONE (flag off; certificate needs confirming) | (this commit) | POST/GET /api/kyc/documents/aadhaar-offline behind AADHAAR_OFFLINE_EKYC_ENABLED: in-memory AES-zip open with the share phrase, XML-DSig verified against server/certs, data read only from the signed bytes, only reference id / last 4 / timestamp / name-match / cert fingerprint kept, XML+photo+share code never stored or logged, one file one account, freshness window; 22 server + 5 client tests on a self-signed test fixture (test mode only) |
| P4.2 | Bhashini ASR/TTS/translate | DONE (flag off; untested against live Bhashini) | (this commit) | ULCA pipeline (config call then compute) for ASR, TTS and en/te/hi translation behind BHASHINI_ENABLED + credentials; POST /api/assistant/voice (speech in, same TARA path incl. safety guardrail, speech out), POST /api/chat/:messageId/translate (participants only), status endpoints; mic button and Translate link only appear when ready; text always works; 18 server + 4 client tests with a stand-in following Bhashini's published shapes |
| P4.3 | SMS + IVR + real forgot-password | DONE (flags off; needs provider accounts) | (this commit) | sms.service (MSG91 flow API or Twilio, fixed en/te/hi templates, never throws), OTP + password-reset + booking-confirmed + proxy-assignment messages, real forgot-password (same answer for unknown numbers, per-phone limit, signs out everywhere; screen explains itself when SMS is off), Exotel webhooks GET /api/ivr/exotel/next-assignment and callback-request (shared-secret URL, plain-text te/hi answers, leaders hear their phone-less members' next jobs) + CallbackRequest list for admins; 26 server + 3 client tests. Found and fixed a 500 in reset completion when nothing is pending |
| P4.4 | DigiLocker, e-Shram, police verification, PMSBY/PMJJBY, ONDC catalogue | DONE (DigiLocker flag off; scheme premium figures empty) | (this commit) | ONDC-ready catalogue (GET /api/ondc/catalog/:societyId, labelled an export, no network claim); e-Shram UAN + private card photo, coverage shown as recorded-not-verified; police verification (upload, leader/admin review, 12 months, 30/7-day + expiry reminders, profile badge); PMSBY/PMJJBY enrolment records through the member's bank + yearly premium from the district pool via a new scheme_premium ledger entry (claimed before paid, dry run, held when figures missing); DigiLocker Fetch for PAN and driving licence (spec v1.12 OAuth+PKCE, state single-use, HMAC-verified, stored for review; Aadhaar deliberately not fetched); server 5+19+39+14 tests, client 7+5+6 |
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
| REDIS_URL | Render API | unset | Redis (Render Key Value or Upstash). Set it to run on more than one instance; unset = all in memory |
| GROQ_API_KEY | Render API | unset | Primary TARA/agent model (Llama); with AI_PROVIDER=auto it is tried first |
| GEMINI_API_KEY | Render API | unset | Second provider, and the knowledge-base embeddings; without it retrieval is lexical |
| GEMINI_EMBEDDING_MODEL | Render API | gemini-embedding-001 | Embedding model name |
| KNOWLEDGE_VECTOR_INDEX | Render API | unset | Name of an Atlas Vector Search index on KnowledgeChunk.embedding, if one exists |
| DOC_OCR_ENABLED | Render API | unset (off) | Runs OCR on KYC image uploads; heavy, downloads eng/tel/hin language data on first use |
| OCR_LANG_PATH | Render API | unset | Directory or URL of tesseract traineddata files, to avoid the download |
| AADHAAR_OFFLINE_EKYC_ENABLED | Render API | unset (off) | Turns on Aadhaar Paperless Offline e-KYC. Do not enable until the UIDAI certificate in server/certs is confirmed |
| AADHAAR_XML_MAX_AGE_DAYS | Render API | 7 | Oldest offline file accepted, from its own timestamp |
| BHASHINI_ENABLED | Render API | unset (off) | Turns on voice and translation |
| BHASHINI_USER_ID / BHASHINI_API_KEY | Render API | unset | ULCA account credentials |
| BHASHINI_CONFIG_URL / BHASHINI_PIPELINE_ID | Render API | ULCA defaults | Overrides if Bhashini changes them |
| SMS_PROVIDER | Render API | unset (off) | msg91 or twilio; unset = no SMS |
| MSG91_AUTH_KEY | Render API | unset | MSG91 auth key |
| SMS_TEMPLATE_IDS | Render API | unset | JSON `{ "otp": { "en": "<MSG91 flow id>", "te": "...", "hi": "..." }, ... }` for otp, password_reset, booking_confirmed, proxy_assignment |
| TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM | Render API | unset | Twilio, if chosen instead of MSG91 |
| IVR_ENABLED | Render API | unset (off) | Turns on the Exotel webhooks |
| IVR_SHARED_SECRET | Render API | unset | 24+ character secret placed in the Exotel URLs (`?token=`); Exotel does not sign requests |
| EXOTEL_NUMBER | Render API | unset | The virtual number people ring, for display |
| DIGILOCKER_ENABLED | Render API | unset (off) | Turns on "Fetch from DigiLocker" |
| DIGILOCKER_CLIENT_ID / DIGILOCKER_CLIENT_SECRET | Render API | unset | From the API Setu / DigiLocker partner registration |
| DIGILOCKER_REDIRECT_URI | Render API | unset | Exactly the URI registered with DigiLocker: `https://<web-app>/digilocker/callback` |
| DIGILOCKER_BASE_URL | Render API | `https://api.digitallocker.gov.in` | Override if the sandbox is on another host |
| ML_SERVICE_URL | Render API | unset | Base URL of the fyro-ml service; unset = rules |
| ML_SERVICE_TOKEN | Render API + Render ML | unset | Shared secret (16+ chars), identical on both services |
| MONGODB_URI_READONLY | local (train.py only) | unset | Read-only Atlas user for training; never set on a server |
| MIN_SOCIETY_BOOKINGS / MIN_TRAIN_DAYS | Render ML | 50 / 60 | Cold-start and training thresholds |
| VERIFICATION_ENABLED | Render API / local | unset | Lets `npm run seed:verification` create the isolated isVerification accounts; leave unset otherwise |

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
- P1.6: contract visits are billed monthly (statement + consolidated GST invoice), but collecting the monthly payment still uses the per-visit Pay now / cash flow. A single monthly online payment for a contract is not built yet.
- P1.8 privacy notice (/privacy): the grievance officer's name, email and phone, and the retention periods for KYC documents, chats and location history. The page currently says these are not yet published; it does not invent them. Fill the `retentionPending` and `grievancePending` strings (en/te/hi, namespace `privacyNotice`) when known, and bump PRIVACY_NOTICE_VERSION in shared/src/types.ts so people are asked to agree again.
- P1.8: have the privacy notice text reviewed by counsel before public launch; it is written from what the app actually does, not from legal advice.
- C0: run `VERIFICATION_ENABLED=true npm run seed:verification --workspace server` against production once (Render shell is paid-only; run it locally against the production MONGODB_URI), copy the printed passwords, then unset the flag.
- P2.1: create a READ-ONLY Atlas database user and run `python ml/scripts/train.py` locally with MONGODB_URI_READONLY (Render's shell is paid-only). Until there is enough real completed-booking history per category, nothing is trained and forecasts come back as cold-start baselines; the API then says so. Decide whether a second Render web service (fyro-ml, free plan, sleeps when idle) is acceptable; if not, leave ML_SERVICE_URL unset and everything uses rules.
- P2.1: movable festivals (Ugadi, Diwali, Eid, Dasara, etc.) for `ml/app/calendar_data.py` from the Andhra Pradesh government holiday list, and AP-specific crop-season windows from the AP Department of Agriculture. Only fixed-date national holidays and coarse Kharif/Rabi months are included now, each with a source note.
- P2.3: fill the knowledge-base placeholders (search for `[[TO BE CONFIRMED` in server/knowledge/): the bye-laws summary, the cancellation and refund policy, the FYRO helpline number and hours, the grievance officer, the GST rate on the service fee, and the federations' confirmation of the welfare parameters. TARA says "FYRO has not confirmed this yet" for each until they are filled.
- P2.3: after deploying, run `npm run build:knowledge --workspace server` locally against the production MONGODB_URI with GEMINI_API_KEY set (Render's shell is paid-only). Optionally create an Atlas Vector Search index on KnowledgeChunk.embedding and set KNOWLEDGE_VECTOR_INDEX; otherwise retrieval is in-process.
- P2.3: set AI_PROVIDER=auto (default) with GROQ_API_KEY to make Groq primary; AI_PROVIDER=groq pins to Groq alone with no fallback.
- P2.4: decide whether to turn DOC_OCR_ENABLED on in production. Tesseract with Telugu and Hindi needs a few hundred MB of memory per recognition, which a free Render instance may not have; if it runs out, leave it off (uploads then simply have no pre-check) or host the traineddata files and set OCR_LANG_PATH.
- P3.1: create a Redis (Render Key Value or Upstash) and set REDIS_URL. Until then FYRO runs exactly as before, on one instance, with everything in memory. After setting it, check `/api/health` shows `redis: { configured: true, connected: true }` and the boot log says `Recurring jobs: bullmq`. The shared rate-limit counting is rate-limit-redis's and could not be run against the test fake (it cannot execute Lua scripts), so confirm it once against the live Redis: exceed a limit from one instance and check the other refuses too.
- P3.1: Redis must be reachable with a plain `redis://` or `rediss://` URL; BullMQ needs a Redis that allows `maxmemory-policy noeviction` (Upstash and Render Key Value do).
- P3.1: the auto-confirm, dispute-SLA and wage-floor-alert runners are idempotent sweeps and still run on every instance; only the four jobs that must not repeat moved to BullMQ.
- P4.1 (IMPORTANT): UIDAI's page (https://uidai.gov.in/en/aadhaar-paperless-offline-e-kyc) links ONE certificate file for every date range it lists, and that file (`server/certs/uidai-okyc-publickey.cer`, downloaded 2026-09-30, SHA-256 E7:23:06:42:...:A5:78) is CN=hcl-aua, valid 2018-01-03 to 2019-01-03. FYRO verifies by public key and ignores the validity dates, but files signed today may use a different key, in which case every real file will be refused. Before setting AADHAAR_OFFLINE_EKYC_ENABLED=true: confirm with UIDAI that this is the key that signs current files, or test one offline file of your own, and add the current certificate to server/certs/ if it differs. Nothing has been run against a real UIDAI file.
- P4.2: create a Bhashini (ULCA) account and set BHASHINI_USER_ID and BHASHINI_API_KEY in Render, then BHASHINI_ENABLED=true. The requests follow Bhashini's published pipeline API (config call, then the returned inference URL and key), but nothing in this codebase has been run against the live service, so try one spoken question and one chat translation right after enabling. Audio is recorded as 16 kHz WAV in the browser; if ASR quality is poor, revisit the sampling rate in lib/voice.ts.
- P4.3 SMS (MSG91): register DLT templates with the wording in `server/src/services/sms.service.ts` (SMS_TEMPLATES, en/te/hi), with variables named exactly as listed there (`{OTP}` becomes `##OTP##` on MSG91; `WORKER`, `WHEN`, `MEMBER`, `PLACE`). Create one MSG91 Flow per template and language, map each to its DLT template id on the MSG91 panel, and put the flow ids in SMS_TEMPLATE_IDS. A language with no flow falls back to the English one. Until this is done set nothing and SMS stays off (forgot-password then shows the honest "ask your leader" screen). Twilio sends the rendered text and needs its own India DLT registration.
- P4.3 IVR (Exotel): in the Exotel dashboard point the flow's dynamic-URL applets at `https://<render-api>/api/ivr/exotel/next-assignment?token=<IVR_SHARED_SECRET>&lang=te` (and `lang=hi`) for the leader line, and `.../callback-request?token=...&lang=te` for the callback option. Exotel calls them with `CallSid`, `From` and (from a Gather) `digits`, and the plain-text answer is what gets spoken. Which Exotel applet reads a dynamic text response aloud, and in which voice, is an Exotel setting I could not verify from its public docs; check it with a test call. Staff see callback requests at GET /api/admin/callback-requests and ring people back by hand.
- P4.3: a member who has NO phone has no number to call from, so the line is for a society leader (by their own registered phone), who hears the jobs of their phone-less members. The booking SMS to such a member goes to the leader instead.
- P4.4 PMSBY/PMJJBY: an admin must enter the CURRENT annual premium (and cover, if wanted) for each scheme with a source link, at PUT /api/admin/scheme-plans/pmsby and /pmjjby (or via the admin API). Until then the figures are empty, renewals are held, not debited, and members are told so. I did not guess them. Also decide whether the welfare pool should really carry these premiums; the pool balance the federation sees already subtracts them. Run `POST /api/admin/scheme-plans/renewals/run` (dry run by default) to see what a renewal would debit before a real one.
- P4.4 DigiLocker: register an app on API Setu / DigiLocker as a Requester and set DIGILOCKER_ENABLED, DIGILOCKER_CLIENT_ID, DIGILOCKER_CLIENT_SECRET and DIGILOCKER_REDIRECT_URI. Only PAN (PANCR) and driving licence (DRVLC) are requested, because those are the document types the API specification names and FYRO needs; an Aadhaar is deliberately not fetched. The flow follows DigiLocker's Requester API Specification v1.12 and was tested only against a stand-in that follows it, never against DigiLocker itself. The sandbox host is not documented in that specification, so set DIGILOCKER_BASE_URL if API Setu gives a different one.
- P4.4 e-Shram: the federation dashboard shows how many members have RECORDED a UAN. It is not checked against the e-Shram portal and says so.
- P4.4 ONDC: the catalogue is an export in Beckn/ONDC shape, checked only against FYRO's own schema. Joining the ONDC network (registration as a participant, and ONDC's own validation) is a separate process FYRO has not started.
- P4.4 police verification: decide whether a society leader may approve their own members' certificates (as built), or whether only admins should. The reminders run daily; the first ones go out at the next run after an approval is within 30 days of ending.
