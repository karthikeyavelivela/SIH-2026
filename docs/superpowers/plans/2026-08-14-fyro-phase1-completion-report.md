# FYRO Phase 1 — Completion Report

Date: 2026-08-14
Branch: `phase1-foundation` (worktree: `.worktrees/phase1-foundation`)
Commits: 45
Plan: `docs/superpowers/plans/2026-08-14-fyro-phase1-foundation.md` (18/18 tasks complete)

## Post-Task-18 additions

After the 18-task plan was declared complete, two more passes happened before this branch was finished:

1. **A final holistic review** (reading the whole diff at once, not per-task) caught a **critical integration bug** invisible to every per-task check: `@fyro/shared`'s `package.json` pointed `main`/`types` at raw `.ts` source. `ts-jest`/`ts-node-dev` both register TypeScript require-hooks so they resolved it fine — but the actual **compiled** server (`node dist/server.js`, what `npm start` and a real deploy run) crashed immediately with `SyntaxError: Unexpected token 'export'`. Fixed: `shared` now has a real `tsc` build step, `main`/`types` point at compiled `dist/`, and every root script that builds/runs/tests server or client builds `shared` first (wired into `postinstall` too). Verified by actually running the compiled server after a clean rebuild — it now correctly reaches the MongoDB connection attempt instead of crashing on `require()`. Also fixed in the same pass: MongoDB duplicate-key races on signup (phone, and vehicle `registrationNumber` which had no pre-check at all) now return a clean 409 instead of a raw 500, and a secondary-write failure during driver signup now rolls back the just-created `User` instead of leaving a permanently orphaned account.
2. **A full visual redesign**, on user feedback that the UI looked flat ("color on white paper"). Rebuilt the design system (real layered shadows, fluid typographic scale, elevated surfaces, motion tokens) and restyled every page against it — marketing site, auth pages, admin dashboard. Fixed the WCAG contrast failure flagged earlier (Task 15/16 reviews) along the way: added `-600` shade variants of the brand orange/teal for button fills and text-sized use (the base brand hexes stay untouched, reserved for large decorative fills — nothing about the specified brand identity changed). All data-fetching logic, API contracts, field names, validation, RBAC gating, and accessibility attributes were verified unchanged (diff read-through) — this was a visual pass only.

## Verification run just now

- **Server tests:** `npm test --workspace server` → 6 suites, **27/27 passing** (models, token, rbac, validate, auth, admin).
- **Server build:** `npm run build:server` (builds `shared` first) → clean, produces `server/dist/app.js`, `server/dist/server.js`.
- **Compiled server boot test:** `node dist/server.js` → correctly progresses past module resolution to the (expected, placeholder-URI) MongoDB connection failure — no longer crashes on `require()`.
- **Client typecheck:** `npx tsc --noEmit` in `client/` → clean.
- **Client build:** `npm run build:client` → clean, all 11 routes produced.
- **Manual browser check:** dev server started, `/`, `/login`, `/pricing`, and RBAC-redirect on `/admin/users` (unauthenticated → `/login`) all verified rendering correctly.
- **Working tree:** clean, nothing uncommitted.

## Routes

**Server API** (`server/src/app.ts`, mounted under `/api`):
- `GET /api/health`
- `POST /api/auth/signup/customer`, `/signup/driver`, `/signup/hamali`, `/login`, `/refresh`, `/logout`
- `GET /api/auth/me`
- `GET/POST /api/admin/managers`, `PATCH /api/admin/managers/:id/permissions`
- `GET /api/admin/users`, `PATCH /api/admin/users/:id/role`, `PATCH /api/admin/users/:id/status`, `DELETE /api/admin/users/:id` (soft delete)

**Client pages** (Next.js App Router):
- Marketing: `/`, `/how-it-works`, `/pricing`, `/about`, `/contact`
- Auth: `/login`, `/signup/customer`, `/signup/driver`, `/signup/hamali`
- Admin (RBAC-gated): `/admin/users`, `/admin/managers`

## What's stubbed / deferred

- **Cloudinary**: mock-aware service exists (`server/src/services/cloudinary.service.ts`), returns fake URLs behind `MOCK_EXTERNAL_SERVICES=true`. Not wired to any route yet (no KYC/photo upload endpoint — that's a later phase).
- **Geocoding**: Nominatim service exists (`server/src/services/geocode.service.ts`), unused until Phase 2's booking flow.
- **Razorpay**: not started — Phase 4.
- **SMS OTP**: not implemented — Phase 1 auth is phone+password only (documented assumption from the design spec).
- **Surge pricing, regions UI, full audit-log viewer**: Phase 5.
- **Manager permission-scoped routes** (KYC verification queue, complaint resolution, regional fare edits): backend RBAC (`requirePermission`) is built and tested, but no routes use it yet — those are later-phase features, not Phase 1 scope.

## Pending manual step (cannot be done in this environment)

`server/.env`'s `MONGODB_URI` is still the `.env.example` placeholder. Everything not requiring a live DB is verified (all tests run against an in-memory MongoDB via `mongodb-memory-server`). Once you supply a real Atlas connection string:

```bash
npm run seed:admin --workspace server
```
Expected: `Seeded admin account: <ADMIN_PHONE>` on first run, `Admin already exists, skipping seed` on rerun. Then `npm run dev:server` / `npm run dev:client` to confirm the full stack talks to a real database.

## Assumptions made during the build (see design spec for the original list)

- Nominatim (OSM) geocoding, no API key, biased to an AP viewbox.
- Mutha invite codes: 8-char random alphanumeric, resolved server-side only — never trust a client-supplied `muthaId`.
- JWT: 15min access / 7d refresh, `tokenVersion` field added to `User` for rotation/invalidation (not in the original model list — added and documented as the standard mechanism for the spec's "refresh rotates, old one invalidated" requirement).
- `DELETE /api/admin/users/:id` is a soft delete (`accountStatus: 'deleted'`), not a hard delete — avoids orphaning future Booking/Rating/Payment references.
- No video asset for the marketing hero — used a CSS radial-gradient placeholder instead.

## Bugs found and fixed during review (all verified independently, not self-reported)

Two-stage review (spec-compliance + code-quality, both by fresh subagents with no access to implementer context) caught real issues across the build, all fixed and re-verified before moving on:

- **Security — plaintext passwords leaked in HTTP validation-error responses.** express-validator's default error shape echoes back the submitted field value; any failed `password` validation (every signup/login route) was returning the plaintext password in the 400 response body. Fixed in `validate.ts` to strip `value` from every error entry; added a regression test.
- **Security — unhandled promise rejection in `requirePermission` RBAC middleware.** A DB hiccup during a permission check would become an unhandled rejection instead of a clean error response. Wrapped in try/catch.
- **Bug — Mongoose schema error in the literal plan spec for `Booking.pickupLocation`/`dropLocation`.** The plan's own reference code threw a runtime error (`'true' is not a valid type at path 'required'`); fixed the schema shape, verified required-ness was still enforced.
- **Bug — uncontrolled `<select>` in the admin user table.** Cancelling a pending role-change left the dropdown visibly stuck on the cancelled value instead of reverting. Made it a controlled component.
- **Bug — rate-limiter test fragility.** The plan's shared IP-keyed `authLimiter` bucket, applied literally, made its own test file fail once enough requests accumulated across test cases. Keyed by IP+route-path instead.
- **Gap — missing "edit manager permissions" UI.** The design spec explicitly required this; the plan's own Task 17 reference code omitted it even though the backend (Task 10) already supported it. Built the missing UI (new `PermissionPicker` component, edit modal, wired to the existing `PATCH /api/admin/managers/:id/permissions` endpoint).
- **Gap — no mobile navigation.** The marketing nav hid all links below the `md` breakpoint with no alternative, violating the spec's explicit mobile-first requirement. Added a hamburger menu.
- Various smaller fixes: `publicUser()` extracted to a shared util with a load-bearing-not-redundant comment (was duplicated, undocumented, in two controllers); `listUsers` search hardened against ReDoS (regex-escaped input, length cap, query validation); `Modal` got ESC-to-close/focus/ARIA semantics before being used for destructive admin actions; auth-context no longer silently swallows non-401 session-check failures; various `aria-label`/`autoComplete`/`scope="col"` accessibility fixes on forms and tables.

## Resolved since the original report

**Color contrast** (previously flagged, not fixed): the brand accent colors (`#FF6B2B` primary, `#0D9488` secondary) failed WCAG AA as white-on-color button/text combinations (~2.7–3.8:1 against a 4.5:1 target). Resolved during the design pass by adding `-600` shade variants (deepened, same hue family — `#BF5020`/`#0A6F66`, ~4.8:1/~6:1) used specifically for button fills and text-sized use. The original bright brand hexes are untouched and still used for large decorative fills/icons — nothing about the specified brand identity changed, just where each shade gets applied.

## Full feature checklist against the master prompt (Phase 1 scope only)

| Item | Status |
|---|---|
| Monorepo (client/server/shared workspaces) | ✅ |
| All 10 Mongoose models + 2dsphere indexes from day one | ✅ |
| Signup: customer, driver, hamali (solo/leader/member + invite codes) | ✅ |
| JWT access+refresh in httpOnly cookies, rotation via tokenVersion | ✅ |
| RBAC middleware (role + Manager permission, DB-fresh, no JWT-permission trust) | ✅ |
| Rate limiting on auth routes | ✅ |
| express-validator on every mutating route | ✅ |
| Admin seed script (idempotent) | ✅ |
| Admin org tree (Admin root → Manager children, permission badges) | ✅ |
| Admin user table (search, inline role change, suspend/delete, confirm modals, audit logs) | ✅ |
| Admin manager creation + **edit permissions** (added as a fix — spec required, plan omitted) | ✅ |
| Full marketing site (video-hero substitute, explainer, role CTAs, all static pages) | ✅ |
| Mobile-first, bottom-tab nav | ⚠️ Admin uses sidebar nav (desktop-appropriate); mobile hamburger added to marketing nav. No bottom-tab nav built yet — that's explicitly a Phase 2+ concern once authenticated role dashboards (driver/hamali/customer) exist. |
| Design tokens as CSS variables, no hardcoded hex in components | ✅ (verified via grep across every task) |
| Security requirements (bcrypt, httpOnly cookies, IDOR prevention, no client-trusted role/id, RBAC on every route, validated uploads, CORS locked, audit log) | ✅ for everything in Phase 1's scope |

Everything else (booking, matching, sockets, payments, ratings, complaints, incentives, surge, regions) is out of scope for Phase 1 and untouched, per the master build plan's phasing.

---

Ready for you to review. Next step when you're ready: supply a real `MONGODB_URI`, run the seed script and dev servers to confirm end-to-end, then we brainstorm Phase 2 (booking core).
