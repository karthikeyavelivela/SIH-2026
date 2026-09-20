# FYRO

**A cooperative labour marketplace for India.** Built for SIH problem statement **26089** — Labour Cooperative Federations, Ministry of Cooperation / NCCT.

| | |
|---|---|
| **Live app** | [fyro.vercel.app](https://fyro.vercel.app) |
| **Live API** | [sih-2026-f63s.onrender.com](https://sih-2026-f63s.onrender.com) · [`/api/health`](https://sih-2026-f63s.onrender.com/api/health) |
| **Stack** | Next.js 14 App Router · Express + Mongoose · MongoDB Atlas · Vercel + Render |
| **Scale** | 131 screens · 253 API routes · 57 data models · 59 test suites, 554 server + 42 client tests · 3,538 strings × 3 languages |

A customer books a household trade, a hamali crew or a truck in under a minute. A worker gets an offer with a visible countdown and is paid transparently, with every deduction itemised. A cooperative society sets its own bye-laws, holds votes that actually execute, and distributes its surplus to shareholding members. A district federation caps what its societies may charge. All of it is real: no screen shows a number that was not computed from a record in the database.

> **The difference between this and a gig platform is not the UI.** It is that the worker is a member of an organisation that sets the rate, takes a published cut, and pays a dividend — and that every one of those mechanisms is enforced server-side rather than described in a pitch deck.

---

## What makes it a cooperative

### Work-based pricing — four modes, because Indian trades do not price by the hour

Every competing implementation of this problem statement prices labour hourly. A carpenter does not.

| Mode | Priced as | Typical trades |
|---|---|---|
| **Hourly** | `rate × max(hours, minimum block)` | Cleaning, house help, caregiving, gardening, loading |
| **Per unit** | `rate × max(quantity, minimum)` | Carpentry, wiring, painting |
| **Per task** | the published fixed price | Plumbing repairs, fan fitting, AC service |
| **Quotation** | the frozen accepted total, never recomputed | Rewires, bespoke carpentry, renovation |

**The ambiguity that causes real disputes.** "₹300 per sq ft" means either the visible front face of a wardrobe or the *developed area* counting every internal shelf — a gap of up to 40% of the bill, and the single most common carpentry argument in India. FYRO refuses to let that ambiguity exist. A worker publishing a per-unit rate must pick a unit from a controlled list, enforced at three layers (validator, schema, pricing function). The customer reads the full declaration before confirming. That exact sentence then **freezes onto the booking** and prints on the invoice — in whichever language the customer actually read.

Five unit types: `sq_ft_face`, `sq_ft_developed`, `per_point`, `per_running_ft`, `per_item`.

### Three floors under every rate

```
  government minimum wage      ← statute. Not ours. Refuses, names the notification.
        ↑
  society bye-law floor        ← the cooperative's promise to its own members
        ↑
  worker's published rate      ← theirs
        ↓
  federation commission cap    ← the district federation's ceiling on society cuts
```

The **statutory floor** is anchored to Government of Andhra Pradesh Notification **G/3186486/2026** (23 March 2026, Commissioner of Labour, Vijayawada, under the Minimum Wages Act 1948; effective 1 April 2026). Two zones, four skill bands, a Variable Dearness Allowance revised twice yearly against the CPI.

The notification publishes a **monthly** figure, so the hourly floor the platform enforces is *derived* — and the derivation is printed wherever the floor appears, because it is the part a worker would be entitled to argue with:

```
₹13,407 a month ÷ 26 working days ÷ 8 hours = ₹64.46 an hour   (Zone I, skilled)
```

Publishing below it is refused, not clamped:

> `422` — *"Your hourly rate works out at ₹50 an hour, below the ₹64.46 an hour statutory minimum for skilled work in Andhra Pradesh (₹13407 a month ÷ 26 days ÷ 8 hours, Notification G/3186486/2026)."*

Refusing rather than clamping is deliberate: silently raising a worker's published rate puts a number on the board they never chose, and they would discover it when a customer booked it.

**What it deliberately does not check.** A per-unit or per-task price has no measured duration behind it. ₹400 to replace a hinge is not a ₹400 hourly rate and it is not a ₹50 one, and inventing a divisor to settle it would mean refusing lawful rates on the strength of a guess. Those modes are left alone, and every screen showing the floor says which rates it covers. A state whose notification has not been entered has *no* floor — not a floor of zero, and not another state's figures borrowed.

> ⚠️ **On the rupee figures.** The gazette PDF itself could not be retrieved (the AP Labour Department's minimum-wages page serves no document; the compliance libraries hosting it require a login). The seeded figures are transcribed from published secondary compilations that agree on every anchor, and every stored row is stamped `sourceType: 'secondary_compilation'` so the platform never claims more authority for them than it has. Replacing them is one `POST /api/admin/wage-floors` per row, which supersedes rather than overwrites.

### Transparent money

**1% platform commission**, published, plus the society's own bye-law cut. Both are taken on **gross** and never compounded on each other, and each is disclosed on its own line — never folded into one unexplained smaller number.

```
Job total                          ₹9,600
  FYRO commission (1%)              −₹96
  Society reserve (6%)             −₹576
  Society welfare fund (2%)        −₹192
  ───────────────────────────────────────
  Worker takes home               ₹8,736
  At or above the AP Government minimum wage (Notification G/3186486/2026)
```

**History is never rewritten.** Every completed job's platform cut is a posted `LedgerEntry` and every society deduction is a `CommissionRecord`; both are read back rather than recomputed. When the commission moved from 10% to 1%, a job charged at 10% kept reading as 10% — verified on production, where one worker's three jobs correctly report `[1, 10]` as the rates applied.

### Governance that executes

Member shares with a real equity ledger. Polls that *do* something when they close — a leader-election poll reassigns leadership, a rate-card poll moves the society's rates, a rate-floor poll moves the floor beneath its members. Surplus distribution computed from posted ledger entries and frozen into line items, write-once.

*Run on production:* ₹24 of genuinely retained income from a completed job, ₹2.40 per share across 10 shares, posted to the ledger. Re-running the same period returns `409`; so does re-distributing.

---

## The eleven required features

| # | Feature | Status |
|---|---|---|
| 01 | Provider registration & verification | **Built** — per-role signup, KYC upload, admin approve/reject, `complianceStatus` enforced at offer, bid and accept |
| 02 | Skill profiling & certification | **Built** — skills, capacity, sequential training academy, auto-issued certification |
| 03 | Booking & scheduling | **Built** — three flows, instant or scheduled 30 minutes to 14 days out; the client never prices anything |
| 04 | Geo-located matching | **Built** — 2dsphere against live position and a worker's own wider "willing" radius, sequential offer engine |
| 05 | Digital payments & invoicing | **Mock mode** — Razorpay order/verify/webhook and COD are wired and the GST invoice issues only against a real successful payment, but **no live money has moved**: production runs without keys |
| 06 | Rating & feedback | **Built** — two-way and mandatory; a completed job must be rated before either side starts the next |
| 07 | Welfare & insurance | **Built** — per-role plans, consented enrolment, claims, and *parametric* payouts with a kill switch and a daily cap |
| 08 | Emergency & on-demand booking | **Built** — press-and-hold SOS from any role, no booking or location required, into an ops queue, with 112 stated above it |
| 09 | Federation administration | **Built** — state rollup, district tier, society console; affiliation, suspension and bye-law ceilings all reachable from the UI |
| 10 | Multilingual application | **Built** — English / తెలుగు / हिंदी, 3,538 keys each at exact parity, cookie-based with no URL change |
| 11 | AI demand forecasting & allocation | **Built** — six agents on real data, each carrying confidence and evidence, none able to execute anything |

Beyond the brief: transit custody with real NH16 and NH65 toll plazas as checkpoints, load manifests and e-way bill capture, an open-for-bidding load board, workmanship guarantee claims, fleet management, warehouse hubs with dock slots, referrals, incentive schemes, fraud signals, a full audit log, a dispute channel separate from complaints, global role-scoped search, and an installable PWA.

---

## AI agents

Six purpose-built agents in `server/src/agents/` — each answering one question a human on the platform actually has. Never a general-purpose chatbot bolted to the UI.

| | Agent | Answers |
|---|---|---|
| **A** | **TARA** (support) | A caller's question about *their own* bookings, complaints and policies — scoped server-side to `req.user.id`, same IDOR discipline as every "my data" route. Maps a described symptom to the right trade in all three languages, and can price a job from rates real workers published in that person's own region |
| **B** | **Dispute triage** | Assembles the real evidence packet — chat log, proof photos, status timestamps, fare breakdown — and recommends an outcome weighing both sides |
| **C** | **Demand forecasting** | Real 14-day booking density → an earnings hint (worker), a surge recommendation (admin), a workforce allocation hint (society leader) |
| **D** | **Document pre-check** | Pre-screens a just-uploaded KYC document (wrong type, expired, unreadable, cropped) with real vision on the actual image, before a human looks |
| **E** | **Pricing & quote** | "Is this fare fair?" — grounded in the active `FareRule` *and* what bookings in this exact region and category actually settled for, surfacing it honestly when the two diverge |
| **F** | **Market insights** | Real week-over-week volume, revenue and utilisation narrative for one region or platform-wide |

**Five rules, enforced structurally rather than by convention:**

| Rule | How |
|---|---|
| Never a bare verdict | `AgentResult` always carries `summary` + `confidence` + a non-empty `evidence` array |
| Never fabricated data | Every agent is handed already-fetched database records as `context`, and instructed to answer "not enough data" rather than invent a plausible number |
| Never mistaken for human | `AgentResultCard` renders an accent rule and an "AI" chip on every agent surface, uniformly |
| Never acts on its own | Every card ends *"Recommended, not applied — a human decides."* |
| Never silently faked | With no key configured the result is labelled `mock: true` and computed from the same real context, and the UI shows a **DEMO MODE** badge |

### Provider chain

Text generation runs **Gemini → Groq → Anthropic → rule-based**, first one that answers. Vision (agent D) requires a vision-capable provider. Failures are logged as they happen, so a vendor that is quietly always failing is visible in the logs rather than hidden behind a working fallback; when all of them fail the caller gets the honest rule-based answer with a visible note, never a 500.

```
Controller → fetches real data for this request
  → runXAgent(context)
     → callAgent({ systemPrompt, userPrompt, context })   ← the single place the mock/live
        → providers.generate() — gemini → groq → anthropic     split and the guardrails live
        → none configured or all failed → rule-based, mock: true
  → cached 5 min in memory (never called on every page load)
  → AuditLog written: who ran what, confidence, mock or not
→ AgentResultCard renders it
```

Which provider is live is printed once at boot and reported by `/api/health`. Setting `GEMINI_API_KEY` reorders the chain with no code change and no deploy beyond the automatic restart.

---

## Quickstart

```bash
npm ci --include=dev          # installs, and builds the shared workspace via postinstall
```

Create `server/.env`. The schema is Zod-validated at boot and the process **refuses to start** on a missing required variable — see `server/src/config/env.ts`.

```bash
CLIENT_ORIGIN=http://localhost:3000
MONGODB_URI=mongodb://127.0.0.1:27017/fyro
JWT_ACCESS_SECRET=<32+ characters>
JWT_REFRESH_SECRET=<32+ characters>
ADMIN_PHONE=9999999999
ADMIN_PASSWORD=<8+ characters>
```

Everything else is optional; absent means that integration runs in mock mode — `CLOUDINARY_*`, `RAZORPAY_*`, `LOCATIONIQ_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `ANTHROPIC_API_KEY`.

```bash
npm run dev:server            # :4000
npm run dev:client            # :3000, separate terminal
```

### Seeding

Order matters — the admin must exist before anything that records an author, and federations before fare rules.

```bash
cd server
npm run seed:admin            # root admin from ADMIN_PHONE / ADMIN_PASSWORD
npm run seed:federations      # 6 state federations, 43 district federations
npm run seed:categories       # the 12 service categories
npm run seed:fares            # 43 regions × 4 vehicle/labour classes
npm run seed:demo             # one demo login per role (see below)
npm run seed:training         # the training curriculum
npm run seed:checkpoints      # 12 NH16/NH65 toll plazas (not yet run on production)
npm run seed:insurance        # per-role insurance plans
npm run seed:wage-floors      # statutory floors — also seeds itself at boot
```

The training curriculum and the wage floors **seed themselves at server start**, idempotently. A seed script only helps if somebody remembers to run it, and both of these had a failure mode worse than a short list: an unseeded wage floor enforces nothing while every screen still claims a fair-wage guarantee.

### Demo logins

All use password `Demo1234!`.

| Phone | Role | | Phone | Role |
|---|---|---|---|---|
| `9000000010` | Customer | | `9000000014` | Society member |
| `9000000011` | Driver | | `9000000015` | Fleet owner |
| `9000000012` | Hamali (solo) | | `9000000016` | Warehouse hub |
| `9000000013` | Society leader | | `9000000017` | Manager |

The root admin is not a demo account — it is created from `ADMIN_PHONE` / `ADMIN_PASSWORD`, so on a deployed instance only whoever set those can sign in as one.

### Tests

```bash
npm run test:server           # Jest + supertest + mongodb-memory-server — 59 suites, 554 tests
npm test --workspace client   # Vitest + Testing Library — 42 tests
npm run build:server          # typecheck + build, what Render runs
npm run build:client          # typecheck + build, what Vercel runs
```

---

## Layout

```
server/src/
  agents/        the six agents + the provider chain, shared client, cache, types
  controllers/   route handlers
  models/        Mongoose schemas — 57
  routes/        Express routers + express-validator rules
  services/      pricing, geocoding, governance, wage floors, payments, ledger
  scripts/       seeders
  tests/         59 suites
client/src/
  app/           App Router, one folder per role — customer/, driver/, hamali/,
                 mutha/, mutha-member/, fleet-owner/, warehouse-hub/, admin/
  components/    shared UI, design-system primitives under fy/
  i18n/          en/te/hi catalogues — see i18n/README.md
  lib/           API client, hooks, booking flow, media manifest
shared/          types both sides agree on (npm workspace, built to dist/)
```

`shared/` is a real build step, not a path alias. After editing `shared/src/types.ts`, run `npm run build:shared` — the server imports from `dist/`.

---

## Decisions worth knowing

**Nothing is priced on the client.** The browser sends a quantity and a mode; it never sends a price, and a price it did send would be ignored. Every fare comes back from `POST /api/bookings/quote` or `POST /api/pricing/quote`.

**Frozen, not recomputed.** An accepted quotation's total, a booking's unit declaration, a society's commission record, the platform's fee — all written once at the moment they are agreed and read back afterwards. Recomputation at read time silently rewrites history the next time a rate moves.

**Provider chains everywhere, degrading visibly.** Geocoding runs LocationIQ → Photon → fail-visibly (a single-provider version once took every booking on production down). AI runs Gemini → Groq → Anthropic → rule-based. In both, the failure is *shown*, never hidden behind a plausible default.

**Region is the pricing key, and it is correctable.** It is derived from the pickup address against the regions that actually carry a fare rule, backfilled from coordinates when a saved address carries none, and editable by the customer on every booking screen — because the server never cross-checks it against the coordinates, so letting a person correct it is real rather than cosmetic.

**Locale is a cookie, not a URL segment.** `/customer/dashboard` is the same URL in all three languages. Every new string ships with real Telugu and Hindi in the same commit; a parity check fails the build otherwise.

**Safe area and fixed chrome are computed, not guessed.** The bottom tab bar publishes its own height as a CSS variable and the sticky action bar publishes its measured height; nothing hardcodes an offset. This exists because two screens once hardcoded 64px under an 80px bar and clipped their own primary button.

---

## Deployment

`render.yaml` describes the API service; the client deploys to Vercel from `client/`. Secrets are set in the dashboards, never committed — `JWT_*` are generated by Render, the rest are `sync: false`.

To turn on live AI in production, set `GEMINI_API_KEY` (free at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)) in Render → Environment. The chain reorders itself on the automatic restart and `/api/health` reports which provider is live.

---

## Status, honestly

**Not built, and named rather than glossed:**

- **Live payments** — Razorpay is wired end to end but production has no keys. Defensible in a demo if you say so; not if the pitch claims "payments integrated".
- **OTP / SMS login** — no SMS provider. The screen exists and says on its face that it verifies nothing. Real authentication is phone + password.
- **Password reset** — no SMS or email channel exists to send one through. "Forgot password?" says that plainly and names who *can* reset it, rather than showing a form that does nothing.
- **Native mobile binary** — an installable PWA, not React Native. A deliberate scope call.
- **Trustee boards, charter PDFs, vehicle telemetry** — in the designs, never in the data model. Left out rather than faked.
