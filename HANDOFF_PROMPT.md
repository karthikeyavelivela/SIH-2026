# FYRO continuation prompt — paste this into a new chat

You are continuing work on FYRO ("Find Your Right One"), a production multi-tenant
logistics marketplace (trucks + Hamali labor) for Andhra Pradesh. Live at
`fyro.vercel.app` (client, Vercel) and `sih-2026-f63s.onrender.com` (server, Render),
MongoDB Atlas. Repo root: `C:\Users\veliv\Desktop\sih`, git remote
`karthikeyavelivela/SIH-2026`, branch `main`.

**Read `AUDIT_REPORT.md` and `AUDIT_REPORT_V2.md` in the repo root before writing any
code.** They are the full history of what was found broken and what was fixed, with
file:line evidence. Do not re-derive this from scratch.

## Standing instruction — read this first

Work through every phase below, in order, **without stopping to ask permission and
without waiting for confirmation between phases.** Just proceed. Commit and push in
reviewable chunks as you go — don't batch everything into one giant commit at the
end. If you hit something that is genuinely destructive/irreversible in a way this
document doesn't already authorize (see Rules below), or a hard external blocker
only the user can unblock (a credential, a dashboard click), don't halt the whole
session over it — note it clearly, keep working on everything else, and only ask a
direct question if truly nothing else productive remains to do.

## Critical environment facts, learned the hard way this session

- **`server/.env`'s `MONGODB_URI` MUST include an explicit database name**
  (`.../fyro?appName=...`, not `.../?appName=...`). Omitting it makes Mongoose
  silently connect to a database literally named `test` — a real bug that
  invalidated an entire earlier session's "verified live" claims against local dev
  before it was caught. `server/src/config/db.ts` now throws loudly if this is
  missing — if you ever see that error, fix the `.env`, don't bypass the check.
- **Production verification means hitting `sih-2026-f63s.onrender.com` and
  `fyro.vercel.app` directly** (curl, or a live browser), not just localhost.
  Local and prod share the same Atlas cluster/database now that the URI is fixed,
  but the deployed code is a separate thing from your working tree until you push
  and it builds — always confirm both.
- **Vercel**: CLI is installed and logged in on this machine already (account
  `velivelakarthikeya-3940`, project `fyro`, under team
  `karthikeyas-projects-11c04219`). Root Directory is `client/`. There's a
  `client/vercel.json` overriding install/build commands to run from the repo root
  (`cd .. && npm install` / `cd .. && npm run build:client`) — this fixed a real
  ~2-day production outage caused by `@fyro/shared` not resolving from the
  workspace-unaware default build. Don't remove it. Use `npx vercel ls fyro`,
  `npx vercel inspect <url> --logs` to check deploy status/build failures directly
  — this is faster than guessing.
- **Render**: no CLI/API/MCP access exists for this service from this environment.
  Cannot set environment variables or trigger anything there without the user.
- **Demo accounts** (all password `Demo1234!` unless noted), real, seeded in the
  actual production database `fyro`:
  customer `9000000010`, driver `9000000011`, hamali_solo `9000000012`,
  mutha_leader `9000000013`, mutha_member `9000000014`, fleet_owner `9000000015`,
  warehouse_hub `9000000016`. Admin is separate: phone/password come from
  `server/.env`'s `ADMIN_PHONE`/`ADMIN_PASSWORD` (currently `9999999999` /
  `ChangeMe123!`), seeded via `npm run seed:admin`.
- **`ANTHROPIC_API_KEY` is not set anywhere** (not in `server/.env`, not in Render).
  All 4 AI agents run in mock mode, correctly labeled "DEMO MODE — NO LIVE MODEL
  CALL". This blocks Phase 0.1 and Phase 1 below until the user sets it in Render's
  dashboard — cannot be done from this session. Keep working through every other
  phase in the meantime; don't block on this one item.

## The phase plan — execute in order, don't skip

```
═══════════════════════════════════════════════════════════════════
PHASE 0 — CONFIGURATION AND PROOF
═══════════════════════════════════════════════════════════════════
STATUS: mostly done already (see AUDIT_REPORT_V2.md and the git log for commits
6815ce3 and earlier). Re-verify quickly, then move on:

0.1 Agents out of mock mode — BLOCKED on ANTHROPIC_API_KEY (see above). Once it's
    set, verify each of the 4 agents returns a genuine model response in
    production and the mock-mode label disappears.
0.2 DONE — proven live on production with real IDs: earnings payout
    (Payout 6a894372af81c7ec79e869c6, ₹257.74, paid) and parametric payout
    (Payout 6a89a2aa357082f676263db7, ₹111, paid), both with matching
    LedgerEntry records and proven idempotent by re-running live. One honest gap
    found: there is no notification-sending system anywhere in the codebase (no
    model, no service) — "worker receives the notification" was not and cannot
    yet be true. That's Phase 5.7's job.
0.3 DONE — fleet_owner/warehouse_hub and training modules confirmed seeded and
    visible via the live production API (not just Mongo).
0.4 DONE — refresh-token rotation, Socket.io auth/room-membership, and
    payoutAmount bounds all proven live. Rate limiting audited (22 files, 60+
    mutating routes had none) and closed with a global floor
    (`globalMutationLimiter` in `server/src/middleware/rateLimit.ts`, wired in
    `app.ts`). Found and fixed a related bug: `trust proxy` was never set, which
    would have broken both that limiter's IP fallback and the Phase 6 fraud
    detector's signupIp signal.

═══════════════════════════════════════════════════════════════════
PHASE 1 — AGENT LOCALIZATION (small, high value)
═══════════════════════════════════════════════════════════════════
Blocked on 0.1's API key for the "verify a genuine Telugu response" step, but the
CODE changes don't need to wait:
- Pass the caller's locale (from the user record — check if User has a locale/
  language field; if not, you'll need to add one, matching how `NEXT_LOCALE` is
  set client-side in `client/src/i18n/setLocale.ts`) into every agent prompt in
  `server/src/agents/*.ts`, instructing the model to respond in that language.
- Localize the agent UI chrome: confidence labels, evidence headers, "Recommended,
  not applied" footer, error states — these already went through next-intl this
  session (`client/src/i18n/messages/{en,hi,te}.json`'s `agents` namespace) for
  the CHROME; this phase is about the model's actual response text, which is a
  different thing.
- Once 0.1 is unblocked, verify with a real Telugu-locale user asking the support
  agent a real question and confirming a genuine Telugu response.

═══════════════════════════════════════════════════════════════════
PHASE 2 — SERVER-SIDE i18n
═══════════════════════════════════════════════════════════════════
Currently 0%. Build a server message catalog (en/hi/te) mirroring the client's key
discipline (`client/src/i18n/messages/*.json`). Locale-aware error formatting in
`ApiError` and every controller error path. Resolve locale from the authenticated
user record → request header → English fallback, in that order. Cover validation
errors, auth errors, booking/offer errors, KYC rejection reasons, insurance/payout
notifications, complaint/dispute status updates. Any SMS/email templates get the
same treatment.

═══════════════════════════════════════════════════════════════════
PHASE 3 — FINISH THE CLIENT MULTILINGUAL SWEEP
═══════════════════════════════════════════════════════════════════
Coverage at last count: 39/165 files (~24%) call `useTranslations`. Order:
remaining worker screens → remaining customer screens → mutha_leader/mutha_member
depth → fleet_owner/warehouse_hub → admin console last. Real Telugu and Hindi for
every string, in the same commit as the component change — never an English
placeholder. Report final coverage as a percentage by file AND by string count.

═══════════════════════════════════════════════════════════════════
PHASE 4 — LAYOUT STRESS TEST AND MOBILE PASS
═══════════════════════════════════════════════════════════════════
Never performed. Test every screen at 390px in all three languages. Telugu/Hindi
run longer/taller than English — find every fixed-width container, truncation,
overflowing button, breaking table. Fix by making containers flexible, never by
truncating translations. Also check tap-target sizes, thumb reach, bottom-nav
behavior, no horizontal scroll anywhere.

═══════════════════════════════════════════════════════════════════
PHASE 5 — POLISH
═══════════════════════════════════════════════════════════════════
5.1 Empty states — every list/dashboard/queue, illustrated icon-language line art,
    a warm sentence, a next action where one exists. Never bare "No data."
5.2 Loading states — skeleton screens shaped like real content, never spinners,
    never pop-in. Audit every data-fetching screen.
5.3 Error states/boundaries — error.tsx + loading.tsx per route group per role.
    Localized copy, retry path, no raw stack traces.
5.4 Offline/poor network — offline banner, local queue + sync on reconnect,
    optimistic UI for accept-job/mark-delivered, "Last updated X min ago" instead
    of a frozen fake map pin.
5.5 Dead buttons/orphaned pages — sweep every role, wire or remove.
5.6 Confirmation/feedback — destructive actions get a real confirm modal, success
    gets clear feedback, long operations show progress.
5.7 Notification center — THIS DOES NOT EXIST YET (see Phase 0.2's honest gap
    above). Build it for real: a model, a write path from real events (job
    offers, payouts, insurance triggers, KYC status, complaints), unread state,
    per-role UI.

═══════════════════════════════════════════════════════════════════
PHASE 6 — REMAINING FEATURES
═══════════════════════════════════════════════════════════════════
Only after the above.
6.1 Pricing & Quote Agent, Market Insights Agent — IF still in scope. Fraud
    Detection was deliberately built as deterministic detectors instead of an
    LLM agent this session (`server/src/services/fraudDetection.service.ts`) —
    that's correct, do not rebuild it as an agent.
6.2 Load board with bidding (Bid model, review UI, auto-expiry).
6.3 Multi-stop route optimizer (Stop sub-model on Booking).
6.4 Indian tax/regulatory documents (GST invoices, TDS, annual earnings
    statement, Indian FY selector).
6.5 Scheduled recurring reports and incentive runs — `scheduledBooking.service.ts`'s
    setInterval loop can back these cheaply now, it already exists.
6.6 PDF export for admin reports — `pdfkit` is already a dependency (added for
    the BOL work, `server/src/services/bolPdf.service.ts`), so the original
    deferral reason is gone.

═══════════════════════════════════════════════════════════════════
PHASE 7 — TESTS
═══════════════════════════════════════════════════════════════════
7.1 Client test suite — currently zero files. Start with booking creation, offer
    accept/reject, payment, insurance enrollment, profile editing.
7.2 Server coverage for still-untested surfaces: training, referral, ledger,
    opsHub, surge, warehouseHub, loadManifest signing, auditLog, analytics.
7.3 An end-to-end test for the full money chain proven manually in Phase 0.2 (see
    the real IDs above), so it can never silently break again.
```

## Rules (unchanged from the master build prompt, still in force)

- Cite file paths for every claim.
- Never claim something works that you have not run.
- Verify against PRODUCTION (the live URLs above), not just localhost — this
  session found real, serious bugs (a stale Vercel deploy, a wrong-database
  footgun) that only local-only verification would have missed entirely.
- Commit in reviewable chunks, not one giant commit per phase.
- Every new route: `verifyJwt` + correct RBAC + `express-validator` + server-side
  ownership scoping via `req.user!.id`. Every privileged action writes to the
  audit log via `writeAuditLog`. All money math server-side only. Every new
  user-facing string goes through next-intl with real Telugu and Hindi in the
  same commit.
- Match the existing design system: `ip-*` tokens (current), Syne headings/Outfit
  body, outline icons, orange=truck/fleet/admin, teal=hamali/labor.
- If something seems like it should be cut or descoped, make the call yourself,
  proceed, and say clearly in your final report what you cut and why — do not
  stop and wait for permission to continue other work while you wait for an
  answer.

## Final deliverable

After Phase 7, re-run the audit checklist one more time and produce
`AUDIT_REPORT_V3.md` in the repo root with before/after status against
`AUDIT_REPORT_V2.md`, same structure (Master Status Table, Scores, What's Built,
What's Fake, What's Missing, Critical Issues, Security Findings, Quick Wins,
Structural Problems, Build Roadmap, Biggest Gap). Push it.
