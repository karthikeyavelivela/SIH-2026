# FYRO Phase 1 — Completion Report

Date: 2026-08-14
Branch: `phase1-foundation` (worktree: `.worktrees/phase1-foundation`)
Commits: 38
Plan: `docs/superpowers/plans/2026-08-14-fyro-phase1-foundation.md` (18/18 tasks complete)

## Verification run just now

- **Server tests:** `npm test --workspace server` → 6 suites, **26/26 passing** (models, token, rbac, validate, auth, admin).
- **Server build:** `npm run build --workspace server` → clean, produces `server/dist/app.js`, `server/dist/server.js`.
- **Client typecheck:** `npx tsc --noEmit` in `client/` → clean.
- **Client build:** `npm run build --workspace client` → clean, all 11 routes produced.
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

## One thing flagged, not fixed — needs your decision

**Color contrast**: the brand accent colors you specified (`#FF6B2B` primary, `#0D9488` secondary) fail WCAG AA contrast as white-on-color button/text combinations (~2.7–3.8:1 against a 4.5:1 target for normal-size text). This is common in premium-brand products (many ride-hailing apps make the same trade-off) but is a real accessibility gap. I did not change your specified brand colors without asking — options if you want to address it: darken the tokens for text/button-label use while keeping the brighter shade for large decorative fills, increase button label font-weight/size, or accept the trade-off as-is. Let me know if you want this revisited.

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
