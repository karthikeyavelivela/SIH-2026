# FYRO deploy checklist

For the `sih-final-build` branch (PR #4 into `main`). Nothing here contains a real secret: the example column shows the *format* only. Put real values in the Render and Vercel dashboards, never in the repo.

How to read the tables: **Required** means the service will not start or a core flow is broken without it. **Flag** means the feature is off until you turn it on. "Breaks without it" says what stops working.

---

## 1. Environment variables

### 1a. Render: API (`fyro-server`, Node)

**Core, required**

| Name | Required | Purpose | Example format | Breaks without it |
|---|---|---|---|---|
| `NODE_ENV` | yes | `production` | `production` | Dev-only behaviour (mock codes) stays possible |
| `CLIENT_ORIGIN` | yes | The web app's exact origin, for CORS and cookies | `https://your-app.vercel.app` | Server refuses to start |
| `MONGODB_URI` | yes | Atlas connection string | `mongodb+srv://user:***@cluster/db` | Server refuses to start |
| `JWT_ACCESS_SECRET` | yes | Signs access tokens, 32+ chars (Render generates it) | random, 32+ chars | Server refuses to start |
| `JWT_REFRESH_SECRET` | yes | Signs refresh tokens, 32+ chars (Render generates it) | random, 32+ chars | Server refuses to start |
| `ADMIN_PHONE` / `ADMIN_PASSWORD` | yes | Root admin created by `seed:admin` | `9999999999` / 8+ chars | No admin sign-in |
| `TRUST_CLOUDFLARE` | yes on Render | Keys per-IP rate limits on `CF-Connecting-IP` | `true` | Limits key on the proxy's address, so one user's traffic can lock others out |

**Mock switches.** Each falls back to `MOCK_EXTERNAL_SERVICES` when unset.

| Name | Required | Purpose | Example | Breaks without it |
|---|---|---|---|---|
| `MOCK_EXTERNAL_SERVICES` | no | Master default for the three below | `true` | (default `true`: everything mocked) |
| `MOCK_PAYMENTS` | yes for live payments | `false` = real Razorpay (test mode is fine) | `false` | Payments are fake; `/mock-capture` stays mounted |
| `MOCK_UPLOADS` | yes for live uploads | `false` = real Cloudinary | `false` | KYC uploads are refused outside tests (503), by design |
| `MOCK_OTP` | no | `true` = no SMS sent; dev codes returned (never in production) | `false` once SMS is live | With `false` and no SMS provider, OTP sending fails loudly |

**Payments (Razorpay).** With `MOCK_PAYMENTS=false` in production the server **refuses to start** unless all three are set.

| Name | Required | Purpose | Example | Breaks without it |
|---|---|---|---|---|
| `RAZORPAY_KEY_ID` | if live payments | Public key id (also sent to Checkout) | `rzp_test_xxxxxxxx` | Boot refusal |
| `RAZORPAY_KEY_SECRET` | if live payments | Verifies payment signatures | `***` | Boot refusal |
| `RAZORPAY_WEBHOOK_SECRET` | if live payments | Verifies webhooks | `***` | Boot refusal |

**Uploads (Cloudinary)**

| Name | Required | Purpose | Example | Breaks without it |
|---|---|---|---|---|
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | yes with `MOCK_UPLOADS=false` | Private KYC storage and signed links | `***` | Uploads and the KYC migration fail |

**AI and TARA**

| Name | Required | Purpose | Example | Breaks without it |
|---|---|---|---|---|
| `AI_PROVIDER` | no | `auto` = Groq, then Gemini, then Anthropic, then rules. A named provider pins to it alone. `mock` forces rules | `auto` | (default `auto`) |
| `GROQ_API_KEY` | recommended | Primary model (Llama) | `gsk_***` | Falls to the next provider |
| `GEMINI_API_KEY` | recommended | Second provider **and** knowledge-base embeddings | `***` | TARA finds guide passages by matching words, not meaning |
| `GEMINI_MODEL` / `GEMINI_EMBEDDING_MODEL` | no | Override model names if Google retires one | model id | (defaults) |
| `ANTHROPIC_API_KEY` | no | Third provider | `sk-ant-***` | Falls to rules |
| `KNOWLEDGE_VECTOR_INDEX` | no | Name of an Atlas Vector Search index on `KnowledgeChunk.embedding` | `knowledge_vec` | In-process cosine is used (fine at this size) |

**Machine learning** (see 1b)

| Name | Required | Purpose | Example | Breaks without it |
|---|---|---|---|---|
| `ML_SERVICE_URL` | flag | fyro-ml base URL | `https://fyro-ml.onrender.com` | Forecasts, crew suggestions and price checks use rules, labelled `rules` |
| `ML_SERVICE_TOKEN` | flag | Shared secret, 16+ chars, **identical** on both services | random | As above |

**Scaling**

| Name | Required | Purpose | Example | Breaks without it |
|---|---|---|---|---|
| `REDIS_URL` | flag | Shared rate limits, offer state, Socket.io rooms, BullMQ jobs | `rediss://default:***@host:6379` | Nothing: runs on one instance in memory. Do **not** run two instances without it |

**Platform and money rules**

| Name | Required | Purpose | Example | Breaks without it |
|---|---|---|---|---|
| `PLATFORM_GSTIN` | before real invoices | Printed on tax invoices | `37ABCDE1234F1Z5` (format) | Invoices print "Not yet registered" |
| `PLATFORM_LEGAL_NAME` | no | Invoice header | `FYRO Logistics Platform` | (default) |
| `AUTO_CONFIRM_HOURS` | no | Hours before a finished job auto-confirms | `24` | (default 24) |
| `PARAMETRIC_PAYOUTS_ENABLED` | no | Kill switch for automatic insurance payouts | `true` | (default `true`) |
| `WELFARE_TRIGGER_INDEX` | no | Demand index below which the pool pays | `0.6` | (default) |
| `WELFARE_PAYOUT_CAP_PCT` | no | Most of the pool one check pays | `40` | (default) |
| `WELFARE_PER_MEMBER_CAP` | no | Rupees per member per week | `1000` | (default) |
| `WELFARE_MIN_SOCIETY_MEMBERS` / `_MIN_ACTIVE_DAYS` / `_MIN_HISTORY_WEEKS` | no | 5 / 8 / 4 | | (defaults) |
| `URGENT_RADII_KM` / `URGENT_OFFER_TIMEOUT_MS` | no | `3,6,10` / `12000` | | (defaults) |
| `DISPUTE_SLA_HOURS` | no | Hours per dispute level | `48` | (default) |
| `LOCATIONIQ_API_KEY` | no | Address lookup (falls back to a keyless service) | `***` | Tighter rate limits on geocoding |

**Integrations, all off until set**

| Name | Flag | Purpose | Example | Breaks without it |
|---|---|---|---|---|
| `SMS_PROVIDER` | flag | `msg91` or `twilio` | `msg91` | No SMS; forgot-password shows the "ask your leader" screen |
| `MSG91_AUTH_KEY` | if msg91 | | `***` | |
| `SMS_TEMPLATE_IDS` | if msg91 | JSON of flow ids: `{"otp":{"en":"...","te":"...","hi":"..."},"password_reset":{...},"booking_confirmed":{...},"proxy_assignment":{...}}` | JSON | That message cannot be sent |
| `TWILIO_ACCOUNT_SID` / `_AUTH_TOKEN` / `_FROM` | if twilio | | `AC...`, `***`, `+1...` | |
| `IVR_ENABLED` | flag | Exotel webhooks | `true` | Webhooks answer 403 |
| `IVR_SHARED_SECRET` | if IVR | 24+ chars, put in the Exotel URLs as `?token=` | random | Webhooks answer 403 |
| `EXOTEL_NUMBER` | no | The number people ring (display) | `080XXXXXXXX` | |
| `BHASHINI_ENABLED` | flag | Voice and chat translation | `true` | No microphone or Translate link; text always works |
| `BHASHINI_USER_ID` / `BHASHINI_API_KEY` | if Bhashini | ULCA credentials | `***` | |
| `BHASHINI_CONFIG_URL` / `BHASHINI_PIPELINE_ID` | no | Overrides if Bhashini changes them | | (defaults) |
| `DIGILOCKER_ENABLED` | flag | "Fetch from DigiLocker" (PAN, driving licence) | `true` | Button says it is not switched on |
| `DIGILOCKER_CLIENT_ID` / `_CLIENT_SECRET` | if DigiLocker | API Setu / DigiLocker partner app | `***` | |
| `DIGILOCKER_REDIRECT_URI` | if DigiLocker | Exactly the registered URI | `https://your-app.vercel.app/digilocker/callback` | DigiLocker rejects the redirect |
| `DIGILOCKER_BASE_URL` | no | If the sandbox is on another host | url | (documented host) |
| `AADHAAR_OFFLINE_EKYC_ENABLED` | flag | Aadhaar offline e-KYC. **Read 3.5 first** | `true` | Card says not switched on |
| `AADHAAR_XML_MAX_AGE_DAYS` | no | Oldest file accepted | `7` | (default) |
| `DOC_OCR_ENABLED` | flag | OCR pre-check of KYC images. Memory-hungry | `true` | Uploads simply have no pre-check |
| `OCR_LANG_PATH` | no | Where tesseract language data lives, to skip its download | path/url | First OCR downloads it |
| `VERIFICATION_ENABLED` | only while seeding | Lets `seed:verification` run | `true` | Seed script refuses |

Never set in production: `UIDAI_TEST_CERT_DIR` (ignored outside tests anyway), `INDIVIDUAL_EARNINGS_TRIGGER` (tests only).

### 1b. Render: ML (`fyro-ml`, Python, second free-plan service)

| Name | Required | Purpose | Example | Breaks without it |
|---|---|---|---|---|
| `ML_SERVICE_TOKEN` | yes | Same value as the API's | random, 16+ chars | Every route except `/health` answers 503 |
| `PYTHON_VERSION` | set in `render.yaml` | `3.11.9` | | |
| `MIN_SOCIETY_BOOKINGS` | no | Below this, forecasts are marked cold start | `50` | (default) |
| `MIN_TRAIN_DAYS` | no | Fewest days a category needs to be trained | `60` | (default) |
| `ML_MODELS_DIR` | no | Where trained models are read from | path | (default `ml/models`) |

The free plan sleeps when idle; the API times out at 3 seconds and uses rules, so the first call after a quiet spell may be labelled `rules`.

### 1c. Vercel: web client

| Name | Required | Purpose | Example | Breaks without it |
|---|---|---|---|---|
| `NEXT_PUBLIC_API_BASE` | yes | The Render API's public URL | `https://fyro-server.onrender.com` | Every API call fails (the build warns) |
| `NEXT_PUBLIC_SOCKET_URL` | no | Socket.io URL if different from the API | url | Uses `NEXT_PUBLIC_API_BASE` |
| `NEXT_PUBLIC_HERO_VIDEO_URL` | no | Landing-page video | url | No video |

---

## 2. Razorpay dashboard

Test mode is fine for the competition.

- Webhook URL: `https://<render-api>/api/payments/webhook`
- Events to enable: `payment.captured`, `payment.failed`, `order.paid`
- Copy the webhook secret into `RAZORPAY_WEBHOOK_SECRET` on Render.

Render's shell is paid-only, so anything marked "run" below is run **from your own machine** in the repo, with the production values set for that one terminal session only (`$env:MONGODB_URI = "..."` in PowerShell), then closed.

---

## 3. Migrations and one-time jobs, in order

1. **KYC to private storage** (needs `MONGODB_URI`, `CLOUDINARY_*`, `MOCK_UPLOADS=false`, plus the other required env vars, since the script loads the same config; `CLIENT_ORIGIN`, the two JWT secrets, `ADMIN_PHONE` and `ADMIN_PASSWORD` can be throwaway values). Deploy PR #4 first.
   ```
   npm run migrate:kyc-private --workspace server
   npm run migrate:kyc-private --workspace server -- --apply
   ```
   Read the dry-run report before `--apply`. Safe to re-run. Until applied, older KYC images stay publicly reachable by URL (no longer listed anywhere in the API).
2. **Fee model.** No script. Bookings priced before P1.1 keep the old pricing and settle under the old rules; nothing to backfill. Society `commissionRatePct` / `welfareDeductionRatePct` are deprecated and no longer deducted from workers.
3. **Seeds** (idempotent): `npm run seed:admin`, `seed:categories`, `seed:wage-floors`, `seed:fares`, `seed:training`, `seed:insurance`, `seed:federations`, `seed:demo`, all with `--workspace server`. (Wage floors and training also seed themselves on boot.)
4. **Knowledge base for TARA**: `npm run build:knowledge --workspace server` (set `GEMINI_API_KEY` for this terminal to get embeddings). Re-run whenever a file in `server/knowledge/` changes.
5. **Aadhaar offline e-KYC certificate.** Read `server/certs/README.md`. The certificate UIDAI links is dated 2018 to 2019. **Confirm it is the key that signs current files** (or add the current one) **before** setting `AADHAAR_OFFLINE_EKYC_ENABLED=true`.
6. **ML training** (only once there is real completed-booking history): create a **read-only** Atlas user, then
   ```
   cd ml
   python -m venv .venv
   .venv/Scripts/python -m pip install -r requirements.txt
   $env:MONGODB_URI_READONLY = "mongodb+srv://<read-only user>..."
   .venv/Scripts/python scripts/train.py
   ```
   It trains only categories with enough data and writes `metrics.json` with MAE beside the naive baseline. With too little data it trains nothing and says so. Commit `ml/models/` so the deployed service can load it.
7. **Verification data** (for the production check only):
   ```
   $env:VERIFICATION_ENABLED = "true"
   npm run seed:verification --workspace server
   ```
   Copy the printed passwords once, then unset the flag. Afterwards, `npm run cleanup:verification --workspace server` shows what it would delete; add `-- --apply` to delete.
8. **Scheme premiums** (PMSBY and PMJJBY): as an admin, `PUT /api/admin/scheme-plans/pmsby` and `/pmjjby` with `{ "premiumAnnual": ..., "sourceUrl": "https://..." }`. Then `POST /api/admin/scheme-plans/renewals/run` (a dry run by default) to see what a renewal would debit.

---

## 4. Merge and deploy

1. Check PR #4 (`sih-final-build` into `main`) is green and review the diff. There is only one PR; do not open another.
2. Merge PR #4 into `main`.
3. Confirm **Render** started a new deploy of `fyro-server` (and `fyro-ml` if you use it) and that the deploy is live.
4. Confirm **Vercel** redeployed the client from `main`.
5. Open `https://<render-api>/api/health` and check:
   - `ok: true`
   - `activeProvider`: `groq` if `GROQ_API_KEY` is set (else `gemini`, `anthropic`, or `rules`)
   - `ml`: `{ configured: true, reachable: true }` if you use it, else `{ configured: false }`
   - `redis`: `{ configured: true, connected: true }` if you use it
6. If you use Redis, the boot log should say `Recurring jobs: bullmq`. Then confirm shared rate limiting once against the live Redis: exceed a limit from one place and check a second place is refused too (it could not be tested against the test fake, which cannot run Lua scripts).
7. Run the steps in section 3 that apply.

---

## 5. Human input needed

Nothing below is guessed in the code. Each item shows a placeholder, says it is unconfirmed, or keeps a feature off until you supply it.

**Urgent**
- **Wage floors.** The seeded Andhra Pradesh figures expire **30 Sep 2026**; after that they are still enforced but marked "update pending". In `/admin/wage-floors` enter the current notification: number, date, monthly rate per zone and skill band, effective dates, gazette link. Include the notifications covering domestic work and agricultural labour (the seeded one is Shops and Commercial Establishments).
- **Payments.** Keep `MOCK_PAYMENTS=true`, or set the three Razorpay values (section 1a) and the webhook (section 2).
- **KYC migration.** Section 3, step 1.

**Decisions**
- **Welfare pool rules**: trigger 0.6 of normal demand, at most 40% of the pool per check, ₹1,000 per member per week, 8 active days in 28, 5-member minimum. These are the brief's defaults; confirm or change them (env vars).
- **Privacy notice** (`/privacy`): the grievance officer's name, email and phone, and retention periods for KYC documents, chats and location. The page currently says these are not yet published. Fill `retentionPending` and `grievancePending` (en/te/hi, namespace `privacyNotice`), then bump `PRIVACY_NOTICE_VERSION` in `shared/src/types.ts` so people are asked to agree again. Have counsel read the notice before public launch.
- **GST**: confirm 18% on the service fee with a CA (`taxInvoice.service.ts`, `SERVICE_FEE_RATE`), and `PLATFORM_GSTIN`.
- **Federation caps**: society commission rates are no longer taken from workers. Should district federations cap society rate floors instead?
- **PMSBY / PMJJBY** premium and cover figures with a source link (section 3, step 8). Until entered, renewals are held, not debited. Also confirm the district pool should carry these premiums.
- **Police verification**: may a society leader approve their own members' certificates (as built), or only admins?

**TARA knowledge base**: search `server/knowledge/` for `[[TO BE CONFIRMED`. Supply the bye-laws summary, the cancellation and refund policy, FYRO helpline number and hours, and the grievance officer. TARA says "FYRO has not confirmed this yet" for each until filled.

**Calendar data for forecasting** (`ml/app/calendar_data.py`): movable festivals (Ugadi, Diwali, Eid, Dasara and others) from the Andhra Pradesh government holiday list, and AP-specific crop windows from the Department of Agriculture. Only fixed-date national holidays and coarse Kharif/Rabi months are included.

**Accounts and keys, one per feature** (each stays off until provided)

| Feature | Set up | Env var names |
|---|---|---|
| ML service | Atlas read-only user; decide whether a second Render service is acceptable | `MONGODB_URI_READONLY` (local training only), `ML_SERVICE_URL`, `ML_SERVICE_TOKEN` |
| TARA | Groq and Gemini keys | `GROQ_API_KEY`, `GEMINI_API_KEY` |
| Scaling | Redis (Render Key Value or Upstash; must allow `noeviction`) | `REDIS_URL` |
| Voice and translation | Bhashini (ULCA) account | `BHASHINI_ENABLED`, `BHASHINI_USER_ID`, `BHASHINI_API_KEY` |
| SMS | MSG91 (DLT templates registered, one flow per template and language) or Twilio | `SMS_PROVIDER`, `MSG91_AUTH_KEY`, `SMS_TEMPLATE_IDS` |
| Phone line | Exotel virtual number and flow (URLs in the next section) | `IVR_ENABLED`, `IVR_SHARED_SECRET`, `EXOTEL_NUMBER` |
| DigiLocker | API Setu / DigiLocker Requester app with the redirect URI registered | `DIGILOCKER_ENABLED`, `DIGILOCKER_CLIENT_ID`, `DIGILOCKER_CLIENT_SECRET`, `DIGILOCKER_REDIRECT_URI` |
| Aadhaar offline e-KYC | Confirm the UIDAI certificate (section 3, step 5) | `AADHAAR_OFFLINE_EKYC_ENABLED` |
| OCR pre-check | Enough memory for tesseract with Telugu and Hindi | `DOC_OCR_ENABLED` |

### Blocked or partly built: exact steps

- **SMS (MSG91).** Register DLT templates with the wording in `server/src/services/sms.service.ts` (`SMS_TEMPLATES`, en/te/hi), variables named exactly as listed there (`{OTP}` becomes `##OTP##` on MSG91; `WORKER`, `WHEN`, `MEMBER`, `PLACE`). Create one MSG91 Flow per template and language, map each to its DLT template id on the MSG91 panel, put the flow ids in `SMS_TEMPLATE_IDS`, set `SMS_PROVIDER=msg91`, `MSG91_AUTH_KEY`, and `MOCK_OTP=false`. A language with no flow falls back to English. Twilio sends the rendered text and needs its own India DLT registration.
- **Exotel.** In the Exotel dashboard point the flow's dynamic-URL applets at:
  - `https://<render-api>/api/ivr/exotel/next-assignment?token=<IVR_SHARED_SECRET>&lang=te` (and `lang=hi`) for society leaders, who hear the next jobs of members without phones;
  - `https://<render-api>/api/ivr/exotel/callback-request?token=<IVR_SHARED_SECRET>&lang=te` for "call me back".
  Exotel sends `CallSid`, `From` and, from a Gather, `digits`; the plain-text answer is what gets spoken. Which Exotel applet reads a dynamic text answer aloud, and in which voice, could not be confirmed from Exotel's public documentation: check it with a test call. Staff see callback requests at `GET /api/admin/callback-requests` and ring back by hand.
- **DigiLocker.** Register the app, set the four variables. Only PAN and driving licence are requested (Aadhaar is deliberately not fetched). Built to DigiLocker's Requester API Specification v1.12 and tested only against a stand-in; the sandbox host is not in that specification, so set `DIGILOCKER_BASE_URL` if API Setu gives a different one.
- **Bhashini.** Built to its published pipeline API, never run against the live service. Right after enabling, try one spoken question and one chat translation.
- **Aadhaar offline e-KYC.** Section 3, step 5. Nothing has been tested with a real UIDAI file.
- **ML.** Until there is enough real data per category, nothing is trained and forecasts come back as cold-start baselines; the API says so.
- **ONDC.** `GET /api/ondc/catalog/:societyId` is an export in catalogue shape. FYRO is not an ONDC network participant and the output has not been through ONDC's validators; joining the network is a separate process.
- **e-Shram.** Numbers are recorded by members and counted; they are not checked against the e-Shram portal, and the screens say so.
