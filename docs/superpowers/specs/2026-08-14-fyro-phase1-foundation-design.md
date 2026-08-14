# FYRO Phase 1 — Foundation Design

Date: 2026-08-14
Status: Approved
Scope: repo scaffold, all Mongoose models with geo indexes, auth (customer/driver/hamali signup incl. Mutha join/create), JWT+RBAC, admin seed script, Admin `/users` + `/managers` (tree view + CRUD + AuditLog), full static marketing site.

This is sub-project 1 of 5 in the FYRO master build (see original master prompt for phases 2-5: booking core, real-time, money/trust, admin polish). Each phase gets its own spec+plan cycle.

## Goals

- Working monorepo (`/client` Next.js, `/server` Express, `/shared` types) as npm workspaces.
- All 10 data models defined with correct relations and 2dsphere indexes on every geo field, from the first migration.
- Full auth: signup for customer, driver, and hamali (solo / mutha leader / mutha member via invite code), login, JWT access+refresh in httpOnly cookies, logout, RBAC middleware enforced server-side on every protected route.
- Admin seed script + first working Admin dashboard slice: `/admin/users` (tree: Admin → Managers w/ permission badges, plus searchable table of all other users with inline role-reassign / suspend / delete, each gated by confirm modal + AuditLog write) and `/admin/managers` (create Manager + assign permission scope).
- Full marketing site: `/`, `/how-it-works`, `/pricing`, `/about`, `/contact`.
- Design system tokens (colors, fonts) wired as Tailwind config + CSS variables, Syne/Outfit via next/font.

## Non-goals (deferred to later phases)

- Booking creation/matching logic (Phase 2).
- Sockets, live tracking, chat (Phase 3).
- Payments, ratings, complaints, incentives (Phase 4).
- Surge pricing, full audit-log viewer UI, regions management UI (Phase 5).
- SMS OTP login — Phase 1 auth is phone+password only. Revisit if OTP is wanted later.
- Real Cloudinary/Razorpay calls — service modules built to the real integration shape but return mocked success behind `MOCK_EXTERNAL_SERVICES=true` env flag until real keys are supplied.

## Assumptions (locked, flag if wrong)

1. **Geocoding**: Nominatim (OpenStreetMap), free, no API key, requests biased to Andhra Pradesh viewbox. Swappable behind a `geocode()` service function later.
2. **Mutha invite code**: 8-char random alphanumeric on `Mutha` doc, leader shares out-of-band; member signup takes `inviteCode` and resolves to `muthaId` server-side (never trust client-supplied `muthaId` directly).
3. **JWT**: access token 15 min TTL, refresh token 7 day TTL, both httpOnly + Secure + SameSite=Strict cookies. Refresh rotates the refresh token on every use (old one invalidated) to limit replay window.
4. **Admin seed**: idempotent script reads `ADMIN_PHONE` / `ADMIN_PASSWORD` from `server/.env`, creates Admin only if no admin exists yet.
5. **MongoDB**: Atlas, connection string supplied by user later into `server/.env` (`MONGODB_URI`) — not available to me during this build, so DB-dependent verification happens once user supplies it. Everything not requiring a live DB (build, type-check, lint, route wiring) is verified now.
6. **Marketing hero**: no video asset supplied — build a CSS/canvas animated gradient placeholder instead of a real video background, swappable later by dropping a file into `/client/public`.

## Architecture

```
/fyro
  package.json                 npm workspaces root ("workspaces": ["client","server","shared"])
  /shared
    /src
      types.ts                 Role enum, status enums, shared DTO interfaces
      constants.ts              OFFER_TIMEOUT_SECONDS etc (used from Phase 3 on)
  /server
    /src
      /config        db.ts, env.ts (zod-validated env), cloudinary.ts (mock-aware)
      /models        User.ts, Vehicle.ts, HamaliProfile.ts, Mutha.ts, Booking.ts,
                      FareRule.ts, Rating.ts, Payment.ts, Complaint.ts, Incentive.ts,
                      AuditLog.ts
      /middleware    auth.ts (verifyJwt), rbac.ts (requireRole, requirePermission),
                      validate.ts (express-validator error handler), rateLimit.ts
      /routes        auth.routes.ts, admin.users.routes.ts, admin.managers.routes.ts
      /controllers   auth.controller.ts, admin.controller.ts
      /services      token.service.ts, audit.service.ts, geocode.service.ts (stub OK
                      for phase 1, used from phase 2), cloudinary.service.ts (mocked)
      /scripts       seedAdmin.ts
      /utils         asyncHandler.ts, ApiError.ts
      app.ts          express app, cors locked to CLIENT_ORIGIN, helmet, cookie-parser
      server.ts        http server bootstrap
  /client
    /src
      /app
        /(marketing)/page.tsx, how-it-works, pricing, about, contact  layout w/ nav+footer
        /login/page.tsx
        /signup/customer/page.tsx
        /signup/driver/page.tsx
        /signup/hamali/page.tsx        (join/solo/create-mutha sub-flow)
        /admin/layout.tsx               (RBAC-gated shell, bottom-tab-less desktop admin nav)
        /admin/users/page.tsx
        /admin/managers/page.tsx
      /components     ui/ (Button, Card, Modal, Badge...), admin/ (TreeView, UserTable...)
      /lib            api.ts (fetch wrapper, sends cookies), auth-context.tsx
      /styles         globals.css (CSS vars for design tokens)
      tailwind.config.ts
```

## Data models

All models exactly as specified in the master prompt. Geo fields use:
```ts
location: {
  type: { type: String, enum: ['Point'], default: 'Point' },
  coordinates: { type: [Number], required: true } // [lng, lat]
}
```
with `schema.index({ location: '2dsphere' })` declared in the same model file — on `Vehicle.currentLocation`, `HamaliProfile.currentLocation`, `Booking.pickupLocation`, `Booking.dropLocation`. No later migration step.

`User.passwordHash` has `select: false` so it's never returned by default queries. Phone has a unique index.

## Auth flow

- `POST /api/auth/signup/customer` — name, phone, email?, password
- `POST /api/auth/signup/driver` — name, phone, password, + vehicle basics (type, capacityKg, registrationNumber) → creates User(role=driver) + Vehicle(verified=false)
- `POST /api/auth/signup/hamali` — name, phone, password, `joinType: solo | leader | member`:
  - `solo` → User(role=hamali_solo) + HamaliProfile(type=solo)
  - `leader` → User(role=mutha_leader) + new Mutha doc (name required) + HamaliProfile-less (leader isn't a laborer profile in phase 1 scope, just group admin)
  - `member` → requires `inviteCode`; resolve to Mutha server-side, reject if code invalid; User(role=mutha_member) + HamaliProfile(type=mutha_member, muthaId)
- `POST /api/auth/login` — phone+password, bcrypt.compare, issues access+refresh cookies
- `POST /api/auth/refresh` — reads refresh cookie, rotates
- `POST /api/auth/logout` — clears both cookies
- `GET /api/auth/me` — returns current user from JWT (no client-supplied id)

All mutating routes: express-validator chain → validate middleware → controller. Rate limit: 5 req/min/IP on signup+login.

## RBAC

- `verifyJwt` middleware: reads access cookie, verifies, attaches `req.user = {id, role}`. 401 if missing/invalid.
- `requireRole('admin','manager')`: 403 if `req.user.role` not in list. Role always read from verified JWT, never from body/params/query.
- `requirePermission('verify_kyc')`: for manager role only — loads the Manager's `permissions[]` fresh from DB (not trusted from JWT, since Admin can revoke live) and checks membership. Admin bypasses this check (always full access).
- Every "my data" route filters Mongoose queries by `req.user.id`, never a client-supplied id.

## Admin users/managers UI

- `/admin/users`: top section renders Admin (you) as root card, Manager cards as children showing name + permission badges. Below: searchable/paginated table of Customer/Driver/Hamali(solo+leader+member) with columns name/phone/role/status; inline role `<select>` and Suspend/Delete buttons, each opens a confirm modal, on confirm calls `PATCH /api/admin/users/:id/role` or `/status`, which writes an `AuditLog` entry `{actorId, actorRole, action, targetType:'User', targetId, details}`.
- `/admin/managers`: form to create Manager (name, phone, password, permissions[] multiselect incl. free-text `manage_region:<name>`), list of existing managers with edit-permissions action (also audit-logged).
- Both routes are `requireRole('admin')` only — Managers cannot reach these pages (no permission grants delete/create-manager per spec).

## Marketing site

Static pages, Tailwind + Framer Motion scroll-reveal sections, shared nav/footer layout. Hero uses a CSS gradient/canvas animated placeholder (no video asset available). Role-based CTAs link to the three signup paths. Design tokens (`#FAFAF8`, `#F2EFE9`, `#FF6B2B`, `#0D9488`, `#0F0E0C`, `#6B6860`) defined once as CSS variables in `globals.css` + mapped into `tailwind.config.ts` — never hardcoded hex in components.

## Testing / verification plan for this phase

- `server`: unit tests (Jest) for RBAC middleware (role checks, permission checks reject correctly) and token service (issue/verify/rotate) — these don't need a live DB.
- Model files: schema-level test that geo index options are present (no live DB needed, can inspect schema definition).
- Full auth flow (signup→login→me→refresh→logout) verified via supertest against an in-memory MongoDB (`mongodb-memory-server`) so it runs without the user's Atlas string. Once user supplies real `MONGODB_URI`, same tests should pass against Atlas too — will note this as a follow-up check.
- Frontend: build passes (`next build`), manual route smoke list reported, no automated e2e in phase 1 (deferred).

## Report format at end of phase

List of all routes (client pages + server endpoints), what's stubbed (Cloudinary/Razorpay mock, no SMS OTP), seeded admin credentials (dev-only, from `.env`), and explicit note that live-Atlas verification is pending user supplying `MONGODB_URI`.
