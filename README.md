# FYRO

**"Ola/Rapido for logistics"** — a real-time marketplace matching customers to truck drivers and Hamali (loading/unloading) labor, built pan-India for the SIH26089 problem statement around Labour Cooperative Federations under the Ministry of Cooperation / NCCT.

- **Live app:** [fyro.vercel.app](https://fyro.vercel.app)
- **Live API:** [sih-2026-f63s.onrender.com](https://sih-2026-f63s.onrender.com)
- **Stack:** Next.js (client) · Express + MongoDB (server) · deployed on Vercel + Render + MongoDB Atlas

A customer can book cargo transport or Hamali labor in under a minute, see honest live-matching state (never a fake instant match), track the assigned worker on a real map, and pay/rate at the end. Workers see a job offer with a visible countdown and get paid transparently. See [`PRODUCT.md`](./PRODUCT.md) for the full product brief and [`DESIGN.md`](./DESIGN.md) for the design system.

---

## AI Agents

FYRO ships six purpose-built AI agents (`server/src/agents/`), each answering one specific question a human on the platform actually has — never a general-purpose chatbot bolted onto the UI. Every agent follows the same non-negotiable rules, enforced structurally, not by convention:

| Rule | How it's enforced |
|---|---|
| **Never a bare verdict** | `AgentResult` (`agents/types.ts`) always carries `summary` + `confidence` (`low`/`moderate`/`high`) + a non-empty `evidence` array — a model has to show its work, not just assert a conclusion. |
| **Never fabricated data** | Every agent is handed real, already-fetched database records as `context` — actual bookings, fare rules, chat logs, documents — and is instructed to say "not enough data" (`confidence:'low'`) rather than invent a plausible-sounding number. |
| **Never mistaken for human-authored** | `AgentResultCard.tsx` renders a 2px accent rule + an "AI" chip on every agent surface in the app, uniformly — no screen can accidentally present a model's output as a person's. |
| **Never acts on its own** | Every card ends with *"Recommended, not applied — a human decides."* An agent only ever informs a click (approve KYC, resolve a dispute, set a surge zone); it never performs the action itself. |
| **Never silently fake in a demo** | Running without a configured API key returns a clearly labeled **`mock: true`** result — computed from the same real `context` a live call would have used, so even the demo reflects real numbers, never placeholder ones. The UI shows a **"DEMO MODE"** badge whenever `mock: true`. |

### The six agents

| | Agent | Answers | Consumed by |
|---|---|---|---|
| **A** | **Support** | A caller's question about their own bookings/complaints/policies — scoped server-side to `req.user.id` only, same IDOR discipline as every other "my data" route | Any authenticated role |
| **B** | **Dispute Triage** | Assembles the real evidence packet (chat log, proof photos, status timestamps, fare breakdown) for one dispute and recommends an outcome that weighs both sides | Admin, before `resolveDispute` |
| **C** | **Demand Forecasting** | Real 14-day booking density → an earnings-opportunity hint (worker), a surge-multiplier recommendation (admin), or a workforce-allocation hint (mutha leader) | Worker / admin / mutha leader dashboards |
| **D** | **Document Pre-check** | Pre-screens one just-uploaded KYC document (wrong type, expired, unreadable, cropped) using real Claude vision on the actual image — before a human reviewer looks at it | KYC review flow |
| **E** | **Pricing & Quote** | "Is this fare fair?" — grounded in the active `FareRule` **and** what bookings in this exact region+category actually settled for recently; surfaces it honestly when the two diverge | Booking flow, rate-setting |
| **F** | **Market Insights** | Real week-over-week volume/revenue/utilization trend narrative for one region or platform-wide | Admin/manager analytics |

### Architecture

Every text-only agent funnels through one function — `callAgent()` in `server/src/agents/client.ts` — so the mock/live split, JSON-response parsing, and the "never invents data" guardrail are enforced in exactly one place instead of once per agent. (Agent D's vision call bypasses it for the image content block but follows the identical discipline.) Model calls use the [Claude API](https://console.anthropic.com/) directly via `@anthropic-ai/sdk`, model `claude-sonnet-5`.

```
Controller (agents.controller.ts)
  → fetches real data for this request (Booking, Dispute, FareRule, ...)
  → runXAgent(...)
      → builds context from real data only
      → callAgent({ systemPrompt, userPrompt, context })
          → no ANTHROPIC_API_KEY? → mockResult(context), mock:true
          → else → real Claude call → parse JSON → mock:false
  → cached() 5 min in-memory (agents/cache.ts) — never called on every page load
  → AuditLog entry written (who ran what, confidence, mock or not)
→ AgentResultCard.tsx renders it — AI chip, confidence bar, evidence, DEMO MODE badge if mock
```

**Turning on live agents in production:** set `ANTHROPIC_API_KEY` on the server's environment (Render dashboard → Environment tab — never in a file or committed anywhere). That's the entire switch; no code changes needed. This is **deliberately independent** of the `MOCK_EXTERNAL_SERVICES` flag that gates payments/uploads/SMS elsewhere in the codebase — see the doc comment on `callAgent()` for why reusing that flag for agents would have broken an unrelated feature. Full walkthrough: [`DEPLOY.md`](./DEPLOY.md#turning-on-live-ai-agents-phase-4).

**Verifying it's actually live:** open any agent surface (e.g. `/customer/book` for Pricing & Quote) — the "DEMO MODE" badge is gone once `mock:false` comes back from the API. No separate admin toggle or debug flag; the same badge that marks a demo response marks its absence.

---

## Getting started

```bash
npm ci --include=dev              # installs + builds the shared workspace (postinstall)
npm run dev:server                # server on :4000
npm run dev:client                # client on :3000, separate terminal
```

Requires a `.env` in `server/` — see `server/src/config/env.ts` for the full schema (Zod-validated at boot; the process refuses to start on a missing required var). At minimum: `CLIENT_ORIGIN`, `MONGODB_URI`, `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` (32+ chars), `ADMIN_PHONE`, `ADMIN_PASSWORD`. Everything else — Cloudinary, Razorpay, `ANTHROPIC_API_KEY` — is optional; absent means that integration runs in mock mode.

```bash
npm run test:server               # server test suite (Jest)
npm run build:server              # typecheck + build (what Render runs)
npm run build:client              # typecheck + build (what Vercel runs)
```

## Project structure

```
server/src/
  agents/          the six AI agents + shared client/cache/types (see above)
  controllers/      route handlers
  models/            Mongoose schemas
  routes/            Express routers + express-validator rules
  services/           payment/cloudinary/otp/geocode — same mock/real split pattern as agents
client/src/
  app/                Next.js App Router pages, one folder per role (customer/, driver/, admin/, ...)
  components/         shared UI, including AgentResultCard.tsx and per-role AgentWidgets
shared/               types shared between client and server (npm workspace)
```

## More docs

- [`PRODUCT.md`](./PRODUCT.md) — users, purpose, design principles
- [`DESIGN.md`](./DESIGN.md) / [`DESIGN_INVENTORY.md`](./DESIGN_INVENTORY.md) — design system and screen inventory
- [`DEPLOY.md`](./DEPLOY.md) — full deployment walkthrough (Vercel + Render + Atlas), including turning on live AI agents and real Cloudinary/Razorpay
- [`SIH_READINESS.md`](./SIH_READINESS.md), [`AUDIT_REPORT.md`](./AUDIT_REPORT.md) / [`_V2`](./AUDIT_REPORT_V2.md) / [`_V3`](./AUDIT_REPORT_V3.md) — audit history against the problem statement, including live production verification notes
