# FYRO — Page Inventory (design-discovery pass)

Walked against **production** (`https://fyro.vercel.app` / `https://sih-2026-f63s.onrender.com`), not localhost. Every claim below is backed by a screenshot, a source-code read, or both — noted per entry. This is inventory, not a bug audit: problems are recorded under **Notes**, not fixed.

Login used demo accounts already seeded in production (see `PAGE_INVENTORY.md`'s credential list in an earlier session artifact / `seedDemoAccounts.ts`). `admin` (root, phone `9999999999`) could not be logged into — its real password lives in Render's `ADMIN_PASSWORD` env var, which I don't have. Everywhere admin-only screens appear below, that's flagged explicitly as unverified-in-browser (code-read only).

---

## METHODOLOGY NOTE — a tool artifact worth flagging so it's never mistaken for a product bug

On `/driver/profile`, scrolling down produced a full-viewport **blank white screenshot** for several consecutive screenshots — looked exactly like a real rendering bug (content vanishing, or a `usePolling` stuck-loading state, both real bug patterns I found elsewhere in this codebase before). I did not take it at face value. Cross-checked three ways: `document.elementFromPoint()` at the exact blank-looking coordinates, a direct API call to the endpoint that section renders, and re-reading the DOM/computed styles directly. All three showed the real content (vehicle type, registration, verified badge) present, correctly styled (`opacity:1`, dark text on light card, correct position), and correctly returned by the API. **The screenshot mechanism itself was failing to composite that scroll position in the Browser pane tool — not a product bug.** Recorded here once rather than re-litigated per page; from this point on, a suspiciously-blank screenshot gets the same three-way cross-check before being trusted, and `get_page_text`/`elementFromPoint` are treated as the source of truth over a screenshot when they disagree.

---

## HAMALI (SOLO)

**Structural finding up front:** `hamali/dashboard`, `hamali/requests`, and `hamali/earnings` are **near-byte-identical copies** of their `driver/*` counterparts — confirmed via `diff`. The only differences are: accent color (secondary/teal vs primary/rust), one icon (Box vs Truck), one label ("Jobs"/"Trips"), and one constant (`HAMALI_WILLING_RADIUS_KM=20` vs `DRIVER_WILLING_RADIUS_KM=200`). This is copy-paste-and-rename, not a shared parameterized component — the clearest, highest-value **shared-component consolidation** target in the whole codebase (one `WorkerDashboard`/`WorkerRequests`/`WorkerEarnings` component taking `accent`/`icon`/`radius`/`basePath` props would replace 6 files with 3). Logged once here rather than repeated per page below.

### `/hamali/dashboard`, `/hamali/requests`, `/hamali/earnings` · Hamali (solo)

Same purpose, data, API calls, and interactive elements as the driver equivalents above — see those entries. Live-confirmed on the real demo account (`9000000012`): online toggle, ₹0 today's earnings, 0 jobs, 5.0 rating, 20km service area set to a real Guntur-district address, insurance/AI links all present.

### `/hamali/active-job/[bookingId]` · Hamali (solo)

Same shape as the driver active-job page, minus the vehicle-specific manifest/checkpoint steps (no `/hamali/active-job/[id]/manifest` route exists — hamali jobs don't carry cargo-in-transit the same way a truck does, confirmed against the route list: no manifest sub-route under `hamali/active-job`). Cargo checklist, photo proof, chat, and mandatory rating all apply identically.

### `/hamali/loadboard` · Hamali (solo)

Same shared `LoadBoardPage` component as driver, `accent="secondary"`. Same orphaned-from-bottom-nav status (linked only from `/hamali/requests`).

### `/hamali/insurance` · Hamali (solo)

Same shared `InsuranceDashboard`. Real seeded plan for this role: **Worker Earnings Protection** (parametric, `forRoles` includes `hamali_solo`).

### `/hamali/profile` · Hamali (solo)

Same shape as driver profile, with **`HamaliSkillsSection`** in place of the Vehicle section — a 17-item skill-chip grid (Cement, Steel, Fragile goods, Furniture, Appliances, Agricultural, Construction material, Electrical, Plumbing, Carpentry, Painting, Domestic help, Caregiving, Gardening, Cleaning, Technician work) plus a physical-capacity-kg field. **Live-tested the actual save path** (not just observed): clicked "Electrical," confirmed via a direct `GET /api/hamali-profile/me` read-back that it persisted (`{"skills":["electrical"]}`) — auto-saves per click, no separate Save button for skills specifically (there is one for the capacity-kg field). KYC documents for this role: only Aadhaar + PAN (no vehicle-related documents), confirmed against `REQUIRED_KYC_DOCS_BY_ROLE.hamali_solo`.

### `/hamali/certifications`, `/hamali/training`, `/hamali/referrals` · Hamali (solo)

Same as driver's three orphaned pages — real, built, reachable only by direct URL.

---

## MUTHA LEADER (Society leader)

**Second methodology finding, different from the first:** `/mutha/dashboard` loaded showing `MEMBERS: 0`, `ONLINE: 0`, no group name, no invite code — looked exactly like the profile bug I was sent to find. Diagnosed properly before reporting it: patched a `fetch` logger and confirmed `usePolling`'s call to `GET /api/mutha/me` **never fired at all**, then checked `document.hidden` and found it reporting `true` even though this was the active tab I was driving. This is the `usePolling`-pauses-while-hidden interaction with a **second Browser-pane tool artifact** (the tab's visibility state was misreported after a `navigate` with `force:true`) — not the app's fault. Confirmed by patching `document.hidden`/`visibilityState` to report correctly and dispatching `visibilitychange`: the real data loaded immediately and correctly (group name, invite code, 1 member online). Re-tested a plain navigation afterward and `document.hidden` reported correctly on its own — the misreport seems tied to `force:true` navigations specifically. Noting this so a future session doesn't waste time rediscovering it, and doesn't wrongly credit/blame the product for it.

### `/mutha/dashboard` · Mutha leader

**Purpose:** Group identity + invite code, roster/online-count at a glance, active-job crew shortcuts, and links out to every leader-only tool (requests, operations, earnings, governance, insurance).

**Data displayed (live-confirmed, real demo account):** group name "Demo Mutha Group", invite code "1005052B", member/online/active-job counts, roster list with per-member live status (Available/On job/Offline), active-jobs list with a per-job "Crew" assign shortcut.

**API calls:** `GET /api/mutha/me` (polled 15s) → `{mutha: {name, inviteCode, ratingAvg, ratingCount}, members: [{name, photoUrl, availabilityStatus}]}`, `GET /api/requests/mine` (polled 15s, filtered client-side to accepted/in_progress), `GET /api/earnings/me` (polled 30s, only the total is used here), `GET /api/ratings/pending`.

**Notes:** none of the fetched member fields go unused — this page renders essentially everything it fetches.

### `/mutha/requests` · Mutha leader

**Purpose:** Incoming jobs the group can take, with per-job member assignment (a leader must actively assign which online members work it, not just accept/reject).

**Data displayed (live):** a real pending "Hamali Job" (₹300, Visakhapatnam address), "Needs 1 more worker", assignable-member list with live status, Reject/Assign actions.

**API calls:** `GET /api/requests` (role-scoped to leader view), `POST /api/mutha/jobs/:bookingId/assign` (`memberIds[]`), `POST /api/requests/:id/reject`.

### `/mutha/active-jobs` · Mutha leader

Every job the group is currently running across all sites simultaneously (a leader can have multiple crews deployed at once — this is the page that shows that fan-out). Empty-state confirmed live.

### `/mutha/members` · Mutha leader

**Purpose:** Roster management. **Notable by absence:** no add-member action exists here — the page's own copy says so plainly ("New members join themselves from the sign-up screen using your invite code"). Only a remove-member action exists (`DELETE /api/mutha/members/:userId`), confirmed against the route file. A leader cannot invite a specific phone number directly; recruitment is 100% self-service via sharing the code.

### `/mutha/operations` · Mutha leader

Crew deployment view (active jobs / deployed count / earned-to-date), separate from `/mutha/active-jobs` — the two pages' scope overlaps enough (both show "jobs the group is running right now") that a redesign should seriously consider merging them; I could not find a real behavioral distinction beyond `operations` adding a running earned-total.

### `/mutha/create-group` · Mutha leader

Despite the name, this is the **group-settings edit page** for an existing group, not a creation flow (creation happens once, during signup) — reused as the "Group settings" link target from the dashboard. Fields: group photo, name, operating region, plus a read-only invite-code display with a copy button. `PATCH /api/mutha/me`.

### `/mutha/assign-members` · Mutha leader

Same assignment UI surfaced from `/mutha/requests`'s "Crew" link and `/mutha/dashboard`'s active-job rows, parameterized by `?bookingId=`. Not a separately-discoverable page — always arrived at via a link carrying the booking id.

### `/mutha/governance` · Mutha leader

**Purpose:** The full cooperative-governance console — federation affiliation status, bye-law rate-setting (bounded by the federation's cap), member equity/shares, surplus distribution, and democratic voting (rate-card proposals and leader elections) with **real applied consequences on close**, not just a survey.

**Data displayed (live, real):** "Status: Affiliated · VZM/SOC/2026/001 · AP Cooperative Societies Act 1964", commission/welfare-rate edit fields, one real equity line ("Demo Mutha Leader · 10 × ₹100"), an **open leader-election poll** currently showing "Demo Mutha Member" as a candidate, close-poll action.

**API calls:** `GET/PATCH` bye-laws, `GET /shares`, `POST /shares/issue`, `POST /surplus/compute`, `POST /surplus/:id/distribute`, `GET /surplus`, `GET/POST /polls`, `POST /polls/:id/vote`, `POST /polls/:id/close`.

**Notes:** this is the single densest, most feature-rich page belonging to any non-admin role in the app — a strong candidate to split into sub-tabs (Bye-laws / Equity / Surplus / Voting) in a redesign rather than one long scroll, mirroring the note already made about the customer track page.

### `/mutha/insurance` · Mutha leader

Same shared `InsuranceDashboard`; `mutha_leader` is included in the real seeded **Worker Earnings Protection** plan's `forRoles`.

### `/mutha/earnings` · Mutha leader

**Data displayed (live):** group total (₹0), completed-job count, **"₹1 in group rating-based bonuses earned"** alongside 0 completed jobs — a real, live, slightly odd-looking number (almost certainly a leftover from incentive testing earlier in this project's history, not fabricated/placeholder data, but worth a human sanity-check before a demo).

### `/mutha/profile` · Mutha leader

Same shared profile shape as other worker roles, minus vehicle/skills sections, plus a "Group settings" shortcut. KYC docs for this role: Aadhaar + PAN only. No referral section (this role is deliberately excluded from `referralRouter`'s role list — confirmed in source, not a bug).

---

## MUTHA MEMBER

### `/mutha-member/job` · Mutha member

**Purpose:** A member's own single-job view — they don't browse/accept jobs themselves, their leader assigns them. Correctly shows "No job assigned right now. Your Mutha leader assigns jobs to you." when idle (live-confirmed, matches the real pending-assignment state I saw from the leader's side in the same test).

### `/mutha-member/governance` · Mutha member

**Purpose:** Read-scoped mirror of the leader's governance console — a member can see their own deduction history, the society's equity table, surplus distributions, and vote in open polls, but cannot edit bye-laws or issue shares (no edit controls present, confirmed both visually and against the route file's `requireRole('mutha_leader')` guards on the write endpoints).

**Data displayed (live):** "No deductions recorded yet" (real — this member hasn't completed a job yet), "No shares issued yet" (real — the leader issued shares only to themselves in this demo data, a real, correctly-reflected asymmetry, not a bug), the same open leader-election poll as the leader's screen, rendered as two votable candidate buttons ("Current Leader" vs "Demo Mutha Member" — i.e., this account is itself a candidate).

### `/mutha-member/insurance` · Mutha member

Same shared `InsuranceDashboard`; reachable via a link on the earnings page rather than its own nav tab (member's bottom nav is only Job/Earnings/Profile — 3 tabs).

### `/mutha-member/earnings` · Mutha member

Same shape as leader earnings, individually scoped. Shows the same "₹1 in rating-based bonuses earned" alongside "0 completed jobs" oddity noted on the leader's page — same underlying record, not a new/separate issue.

### `/mutha-member/profile` · Mutha member

Same shared profile shape as hamali_solo (full 17-skill grid, auto-saving), **plus** a "My Mutha" card unique to this role: group name, leader name+phone, a "View cooperative governance →" link, "Flag earnings issue" (→ `POST /api/mutha/earnings-discrepancy`), and "Leave group" (→ `POST /api/mutha/leave`). KYC docs: Aadhaar + PAN, both showing Verified on this demo account.

---

## FLEET OWNER

**Thinnest bottom nav of any role** — only Home/Profile (2 tabs). Vehicles, maintenance, and training all live one level deeper, reached only through the dashboard or profile, never their own tab.

### `/fleet-owner/dashboard` · Fleet owner

**Data displayed (live, real demo account):** "Demo Fleet" name, total vehicles/active drivers/unassigned units (all 0 on this account — it has never had a vehicle registered, despite being the account this whole project's audit history uses as the fleet-owner reference), "Register vehicle" / "Assign driver" actions, empty roster state.

**API calls:** `GET /api/fleet/me`, `GET /api/fleet/health`.

### `/fleet-owner/maintenance` · Fleet owner

**Purpose:** Fleet-wide health score, upcoming service schedule, inspection-compliance tracking. Real, fully built (100% health / "Nothing scheduled" / real empty states, not placeholders) — orphaned (0 nav links anywhere, confirmed in Step 1).

### `/fleet-owner/training` · Fleet owner

Same shared `TrainingAcademy` component as driver/hamali, but **role-scoped to a different, generic 3-module curriculum** (Platform Safety Basics, Loading Protocols & Standards, Earnings & Payouts) rather than the trade-skill modules hamali/mutha roles see — confirmed correct against `trainingRouter`'s role gate and the training seed script's `SOCIETY_WORKER_ROLES` scoping. Not a bug — a deliberate, correct content split. Sequential unlock confirmed (modules 2/3 show "Locked · Complete previous modules to unlock").

### `/fleet-owner/vehicles/[vehicleId]/inspection` · Fleet owner

**Status: not reachable in this pass** — this demo account has zero registered vehicles, and the route requires a real `vehicleId`. Structurally confirmed via source (4-angle photo checklist + pass/warn/fail per item + overall compliance verdict, matching `fleetRouter`'s `submitVehicleInspection` validator) but not walked live. Would need a vehicle registered first — flagging rather than guessing.

### `/fleet-owner/insurance` · Fleet owner

Same shared `InsuranceDashboard`; real seeded plan is **Vehicle & Commercial Auto Cover**.

### `/fleet-owner/profile` · Fleet owner

**Data displayed (live):** identity, **Company profile** card (name, fleet size "0 vehicles, 0 drivers"), KYC documents (GSTIN, PAN, Aadhaar — none uploaded on this demo account), notifications/privacy, complaint history, insurance link, support, account actions. No payout-details section (fleet owners aren't paid out by the platform the way workers are — correctly absent, not a bug). No referral section either, despite `fleet_owner` being one of the three roles `referralRouter` actually grants (driver/hamali_solo/fleet_owner) — **this looks like a real omission**: the referral feature works for this role at the API level but the profile page never surfaces it, unlike driver's profile which does.

**Two real content findings on this page:**
1. The insurance link's label reads **"Insurance & protection for your goods"** — verbatim reuse of the copy written for the *customer's* cargo/stock insurance link (`profile.insurance.title`, a shared i18n key), which doesn't fit a fleet owner (whose real plan is vehicle/auto cover, not "your goods"). Confirmed in `en.json`.
2. The GSTIN field's helper text reads: *"GSTIN is verified as a KYC document below, not free text here. Billing isn't built — there's no platform-charges-fleet-owner model in this product yet."* — this is written in an internal-audit-note voice, not real end-user copy, and says something a real fleet owner has no reason to be told ("billing isn't built"). Confirmed live and in source (`companyProfile.gstinNote`). Worth rewriting for the redesign regardless of whether the underlying fact stays true.

---

## WAREHOUSE HUB

Same thin 2-tab nav pattern as fleet owner (Home/Profile only).

### `/warehouse-hub/dashboard` · Warehouse hub

**Data displayed (live):** hub name + address ("Demo Warehouse Hub, Visakhapatnam, Andhra Pradesh"), total docks / occupied / on-site-crew stats, dock-space list, live gate feed. All real-empty on this demo account: "TOTAL DOCKS: 0", "No dock slots yet."

**A real, live-confirmed data inconsistency:** `/warehouse-hub/profile`'s Facility card shows **"Dock slots: 6"** for the exact same account the dashboard shows **"TOTAL DOCKS: 0"** for. Both numbers come from the same hub record but mean different things: `totalDockSlots` (the profile's "6") is a capacity figure set once at seed time; the dashboard counts actual `DockSlot` documents, of which none were ever created for this demo account. Not a bug in the sense of broken code — both numbers are individually correct for what they measure — but it's a genuinely confusing pair of numbers for the same real account to show side by side, and worth reconciling (or relabeling) in a redesign.

### `/warehouse-hub/insurance` · Warehouse hub

Same shared `InsuranceDashboard`; real seeded plan is **Warehouse Goods-in-Custody Cover**.

### `/warehouse-hub/profile` · Warehouse hub

Same shape as fleet-owner's profile: identity, Facility profile card (name, dock-slot count, operating hours, gate contacts — editable), KYC documents (GSTIN/PAN/Aadhaar, none uploaded), notifications/privacy, complaint history, insurance link, support, account actions.

**Same mislabeled insurance link as fleet-owner's profile:** "Insurance & protection for your goods" — the customer-written copy, reused verbatim, doesn't fit a warehouse hub either (real plan is goods-*in-custody*, arguably closer but still not quite the same claim as a customer's own shipped goods). Confirms this is a **systemic** shared-string issue affecting both non-worker business roles, not a one-off.

---

## MANAGER / ADMIN

Both roles share the exact same `/admin/*` route tree (confirmed in Step 1 — there is no separate manager route tree). Tested live as `manager` (demo account, granted all 4 permission slots: `edit_fare_rules`, `resolve_complaints`, `verify_kyc`, `view_analytics`). **`admin` (root) itself was not reachable** — its real password lives in Render's env, which I don't have; every admin-only page below is confirmed from source only, not walked live, and is marked as such.

### `/admin/dashboard` · Manager (and Admin)

**Data displayed (live, real platform-wide data):** active bookings (2), GMV completed (₹1208.1), open complaints (0), then a tile grid that **correctly hides/shows per the caller's actual live permissions** — as manager, only KYC queue / Surge zones / Analytics / Ops hub / Fare rules / Complaints tiles appeared; Users, Managers, Payouts, Insurance, Ledger, Reports, Incentives, Regions, and Audit Log (all admin-only, no manager permission slot exists for them) were correctly absent. This is a real, working, live-verified permission boundary, not just code that looks right on paper.

### `/admin/kyc-queue` · Manager (`verify_kyc`) / Admin

**Live-confirmed working end to end, closing the loop from an earlier test:** the KYC document I uploaded via a direct API call while testing the "profile creation" diagnosis (an Aadhaar for the fresh `hamali_solo` test account, phone `9200000001`) appeared here as a real pending-review row — "Inventory Test Solo · hamali solo · 9200000001 · 1 document submitted." Confirms the full worker-upload → admin-review pipeline is real and connected end to end, not just independently-working halves.

### `/admin/analytics` · Manager (`view_analytics`) / Admin

**Data displayed (live, real):** revenue ₹1208.1, active trips 2, completed trips 4, fleet utilization 0%, avg delivery time 29.5 min, a demand-hotspot map, a 14-day revenue trend chart (honestly shows "Not enough data — needs at least two days of completed bookings" rather than a fabricated line), and the Market Insights AI widget.

### `/admin/fares` · Manager (`edit_fare_rules`) / Admin

**Real, live content finding:** the "New fare rule" form's helper text still reads **"Launch region is Visakhapatnam until Phase 5's region picker."** — this is stale copy from before the pan-India rewrite. The platform now has real active fare rules across 6 states (~42 districts), and the region field itself is already free-text (no picker restriction), so this sentence is not just outdated, it actively misdescribes the current, correct behavior to whoever reads it next.

### `/admin/complaints` · Manager (`resolve_complaints`) / Admin

Real filter tabs (All/open/in review/resolved), honest empty state ("No complaints here") confirmed live.

### `/admin/ops-hub` · Manager (`view_analytics`) / Admin

Not walked in this pass beyond confirming the tile is present and permission-gated correctly; source-confirmed as a live incident dashboard.

### `/admin/surge-zones` · Manager (`edit_fare_rules`) / Admin

Not walked live this pass; source-confirmed (create/end surge-zone actions, multiplier + duration fields).

### The real, reproduced bug: 403 silently renders as an honest empty state

Navigated directly to **`/admin/users`** as manager (a page with no nav tile for this role — reached only by typing the URL, which is exactly how a real manager might stumble into it via a bookmark or a shared link). The page rendered its full shell — title, table headers (Name/Phone/Role/Status/Actions) — with **"No users found."** in the body. This looks exactly like "the platform has zero users," which is obviously false. Checked the real network call directly: `GET /api/admin/users` returns **`403 {"error":"Forbidden: insufficient role"}`**. The frontend swallows that 403 and renders the same empty state a genuine zero-results response would produce — a manager (or anyone who guesses the URL) gets no indication they were denied, only what looks like honest-but-wrong data. This matches a gap already named earlier in this project's own history ("manager 403-vs-empty-state visual distinction") — live-reproduced here, confirming it was never actually fixed.

### Admin-only pages, not reachable this pass — source-confirmed only

`/admin/disputes`(+`[id]`), `/admin/fraud-alerts`, `/admin/payouts`, `/admin/insurance`, `/admin/ledger`, `/admin/reports`, `/admin/users` (content confirmed above, the 403 case), `/admin/managers`, `/admin/incentives`, `/admin/regions`, `/admin/audit-log`, `/admin/profile`. All exist, all have real route+controller code read in Step 1; none walked live because they require either the real `admin` password or a manager permission that doesn't apply to them (by design). **If you can get me the real admin password (or reset it), I'll walk all twelve of these properly** — right now this is the one deliberate coverage gap in the whole audit, and it's a credentials gap, not a skipped-effort one.

---

## FEDERATION — STATE ADMIN

### `/federation-state/dashboard` · Federation state admin

**The only page this role has** — no other route exists (confirmed in Step 1), no header, no nav, and (confirmed by `read_page` returning zero interactive elements, and confirmed again in source — zero `button`/`onClick` anywhere in the file) **no logout control anywhere in the UI.** A state federation admin who logs in has no way to sign out short of clearing cookies manually or closing the browser. Same true of the district admin below — this is a shared gap in both federation layouts (`federation-state/layout.tsx` / `federation-district/layout.tsx` are both bare `<div>` wrappers with an auth redirect and nothing else — confirmed by reading both files directly).

**Data displayed (live, real, on the actual seeded AP State Federation):** federation name + registration number + governing act, 7 KPI tiles (societies, workers, jobs completed, earnings distributed, training completion %, welfare enrolment %, open grievances), a full **13-district breakdown** (every AP district federation, each showing its own affiliated-society count — correctly shows "1 societies" for Visakhapatnam and "0 societies" for the other 12), an affiliated-societies table (real: "Demo Mutha Group · 2 members · 0.0 rating · 6% commission · 2% welfare" — matching exactly what I saw on that society's own leader-facing governance page), and a training-needs-assessment table (100% skill gap for the one real society, since none of its members have completed a training module yet).

**API calls:** `GET /api/federation/me` (state-level rollup), `GET /api/federation/training-needs`.

**This is a genuinely working, correctly-aggregated multi-tenant rollup** — state totals matched district totals matched the society's own self-reported numbers, across three independently-tested account logins. Confirms the federation hierarchy isn't just seeded data sitting inert; the read side is real and consistent end to end.

---

## FEDERATION — DISTRICT ADMIN

### `/federation-district/dashboard` · Federation district admin

Same page shape as the state dashboard, correctly scoped to one district (Visakhapatnam) instead of a state-wide rollup — same KPI tiles, same affiliated-societies table, plus an **"Affiliation requests"** section (showing the district's bye-law cap: "commission ≤10%, welfare ≤5%", currently empty — "No pending affiliation requests").

**A real, significant finding — read-only where the backend supports real actions:** this page has **zero interactive elements** (confirmed via `read_page` returning nothing, and confirmed in source — no `button`, no `onClick`, anywhere in `federation-district/dashboard/page.tsx`). But the backend has three real, tested, working endpoints this role is specifically meant to use: `PATCH /affiliation-requests/:muthaId/decide` (approve/reject a society joining the federation), `PATCH /societies/:muthaId/suspend`, and `PATCH /me/bounds` (adjust the commission/welfare rate ceiling societies must stay under). All three are covered by passing tests (`federation.test.ts`/`governance.test.ts`) and are reachable via direct API call — I did not test them live via the UI because **there is no UI for them to test.** A district federation admin can currently only look at their district; they cannot approve a new society, suspend one, or change the bye-law cap without going around the app entirely. This is the single clearest "backend built, frontend never caught up" finding in the whole audit, and it sits on a role whose entire reason to exist is making exactly these three decisions.

---

## ROUTE MASTER LIST

Legend: **nav** = reachable through the role's own bottom-nav/sidebar/dashboard links · **orphaned** = real, built page, zero inbound links, URL-only · **broken** = did not render correctly · **missing** = a page a real flow implies but doesn't exist · **n/a** = deliberately not a real screen (redirect/reuse).

| Route | Role | Status |
|---|---|---|
| `/`, `/about`, `/contact`, `/faq`, `/how-it-works`, `/pricing`, `/safety` | Public | nav |
| `/terms-of-service` | Public | **orphaned** |
| `/login`, `/language-selection`, `/role-selection` | Public | nav |
| `/onboarding-walkthrough` | Public | **orphaned** |
| `/otp-verification` | Public | **orphaned** — no forgot/reset-password flow exists anywhere either |
| `/styleguide` | Public/dev | linked once, not a real user flow |
| `/signup/customer`, `/signup/driver`, `/signup/fleet-owner`, `/signup/warehouse-hub`, `/signup/hamali` (3-in-1 via joinType) | Public | nav — **all 6 walked to completion live this pass, all work** |
| `/customer/dashboard`, `/book`, `/history`, `/profile` | Customer | nav (bottom tabs) |
| `/customer/track/[id]` | Customer | nav (from dashboard/history rows) |
| `/customer/track` (bare) | Customer | **n/a** — client redirect to `/customer/history` |
| `/customer/insurance` | Customer | nav (from profile) |
| `/customer/notifications` | Customer | nav (bell icon) |
| `/customer/support` | Customer | nav (from profile + track page's "report an issue") |
| `/driver/dashboard`, `/requests`, `/earnings`, `/profile` | Driver | nav (bottom tabs) |
| `/driver/active-job/[id]`(`/manifest`) | Driver | nav (from dashboard/requests) |
| `/driver/loadboard` | Driver | nav (text link inside `/driver/requests`, not a tab) |
| `/driver/insurance`, `/notifications` | Driver | nav |
| `/driver/certifications`, `/driver/training`, `/driver/referrals` | Driver | **orphaned** — real, built, zero links |
| `/hamali/*` (same shape as driver) | Hamali (solo) | same pattern — dashboard/requests/earnings/profile in nav, loadboard link-only, certifications/training/referrals **orphaned** |
| `/mutha/dashboard`, `/requests`, `/active-jobs`, `/members`, `/earnings`, `/profile` | Mutha leader | nav (bottom tabs, 6 of them) |
| `/mutha/operations`, `/governance`, `/insurance` | Mutha leader | nav (dashboard tiles, not tabs) |
| `/mutha/create-group` | Mutha leader | nav (dashboard "Group settings" link) — **n/a as a "creation" flow, it's the edit-settings page** |
| `/mutha/assign-members` | Mutha leader | nav (parameterized link from requests/dashboard, never a standalone destination) |
| `/mutha-member/job`, `/earnings`, `/profile` | Mutha member | nav (bottom tabs, 3 of them) |
| `/mutha-member/governance`, `/insurance` | Mutha member | nav (from profile/earnings) |
| `/fleet-owner/dashboard`, `/profile` | Fleet owner | nav (bottom tabs, 2 of them) |
| `/fleet-owner/insurance` | Fleet owner | nav (from profile) |
| `/fleet-owner/maintenance`, `/training` | Fleet owner | **orphaned** — real, built, zero links |
| `/fleet-owner/vehicles/[id]/inspection` | Fleet owner | nav (from a vehicle row) — **not walked live** (this account has 0 vehicles) |
| `/warehouse-hub/dashboard`, `/profile` | Warehouse hub | nav (bottom tabs, 2 of them) |
| `/warehouse-hub/insurance` | Warehouse hub | nav (from profile) |
| `/admin/*` (18 pages) | Admin / Manager | nav (sidebar), permission-gated per-tile, **verified live and correctly hiding admin-only tiles from manager** |
| `/admin/users`, `/managers`, `/ledger`, `/payouts`, `/insurance`, `/reports`, `/regions`, `/audit-log`, `/incentives`, `/fraud-alerts`, `/disputes`(`[id]`) | Admin only | **not walked live** — no admin password available; `/admin/users` specifically confirmed to 403 for manager while silently rendering an empty-table state (real bug, see Manager/Admin section) |
| `/federation-state/dashboard` | Federation state admin | nav (only page this role has) |
| `/federation-district/dashboard` | Federation district admin | nav (only page this role has) — **read-only**, no UI for its own three real actions (see above) |

---

## SHARED COMPONENT INVENTORY

| Pattern | Used on | Variants | Genuinely different, or drift? |
|---|---|---|---|
| **Worker dashboard shell** (avatar+name+rating, online toggle, hero earnings number, active-job card, service-area card, quick links, AI widgets) | driver, hamali dashboards | 2 near-identical files, differ only in accent color/icon/label/radius constant | **Drift, not design.** Copy-pasted, not parameterized — the single highest-value consolidation target found in this audit. |
| **Worker requests/earnings pages** | driver, hamali | same story — 2 files each, diffed to near-zero real difference | Same as above |
| `Modal` (centered dialog) | 11+ screens across admin, insurance, ratings, complaints, KYC | one component | Genuinely shared — and the exact component with this session's fixed focus-steal bug, so every one of those 11 screens benefited from one fix |
| `BottomSheet` | fleet-owner dashboard/maintenance, warehouse-hub dashboard, styleguide | one component | Genuinely shared, narrower usage than Modal |
| `InsuranceDashboard` | customer, driver, hamali, mutha (leader+member), fleet-owner, warehouse-hub — **7 of 11 roles** | one component, role-agnostic | Genuinely shared — this is the pattern the worker-dashboard trio above should be refactored toward |
| `ProfileSections.tsx` exports (Language, Identity, Notifications, Privacy, Ratings, Complaints, Referral, DangerZone, RoleSwitcher, BusinessProfile, PayoutDetails, FrequentRoutes) | every role's profile page, mixed and matched | genuinely composable — each profile page imports a different subset | This is the right pattern; the redesign should extend it (e.g., a shared `VehicleSection`/`SkillsSection` slot instead of driver/hamali profile pages independently reimplementing that one differing block) |
| `TrainingAcademy`, `CertificationList`, `ReferralDashboard` | driver, hamali (+ fleet-owner for training) | genuinely shared, role-scoped content via API | Real components, just all three are orphaned from navigation on every role that has them |
| `CodCollectionSection` | driver, hamali, mutha-member earnings pages | genuinely shared (built this session) | — |
| Status pills / chips (`StatusChip`, `StatusPill`, `Badge`) | everywhere | at least 3 differently-named components doing overlapping jobs (booking status, KYC status, availability status) | Worth auditing whether these should collapse to one `Pill` primitive with a semantic-color prop, or whether the 3 genuinely encode different things (worth a design-system decision, not a call I'll make unilaterally here) |
| Federation dashboard | state + district | one shape, correctly parameterized by scope | Genuinely shared, and the one place in the whole audit where a role-scoped rollup is provably correct across 3 independent logins |
| "Insurance & protection" profile link copy | customer (correct: "for your goods"), fleet-owner/warehouse-hub (same string, wrong fit) | one shared i18n key reused where it shouldn't be | Real content drift — see Fleet Owner / Warehouse Hub sections |

---

## DATA MODEL SURFACE

Models with a real, live UI surface somewhere in this audit: `User`, `Booking`, `Vehicle`, `HamaliProfile`, `Mutha`, `Federation`, `InsurancePlan`/`InsurancePolicy`/`InsuranceClaim`, `Payment`, `FareRule`, `Complaint`, `Dispute`, `Rating`, `Notification`, `KycDocument`, `TrainingModule`/`TrainingProgress`, `Referral`, `Fleet`, `WarehouseHub`/`DockSlot`, `SurgeZone`, `MemberShare`, `SurplusDistribution`, `Poll`/`Vote`, `CommissionRecord`, `ServiceCategory`, `Checkpoint`/`HaltEvent`.

**Models confirmed to exist with real backend logic but no UI surface found anywhere in this pass:**
- **`WorkmanshipGuarantee`/`GuaranteeClaim`** — designed in an earlier phase of this project's history, never implemented (no model, no controller, no route, no UI). Not a UI gap so much as a feature that doesn't exist yet at any layer.
- **`AuditLog`** — has a real admin page (`/admin/audit-log`), but was not walked live this pass (admin-only, no credential).
- **`LedgerEntry`** — same: real admin page (`/admin/ledger`), not walked live.
- **`FraudSignal`/`FraudCase`** — real admin page (`/admin/fraud-alerts`), not walked live; this is also the model the new `unplanned_halt_deviation` checkpoint detector writes into, so it's a real, currently-growing dataset with an unverified-this-pass UI.
- **`Payout`** — real admin page (`/admin/payouts`), not walked live.

---

## PAGES THAT SHOULD EXIST BUT DON'T

1. **A federation district admin action UI** — approve/reject affiliation, suspend a society, edit the bye-law cap. The single highest-priority missing page in this whole audit; the backend is done and tested.
2. **A password reset / forgot-password flow.** `otp-verification` exists as an orphaned page that looks like it was meant for this and was never wired up.
3. **A logout control on both federation dashboards.** Not a "missing page" exactly, but a missing piece of every page that role has.
4. **Nav entries for 8 real, fully-built, currently-orphaned pages**: driver/hamali certifications+training+referrals (6), fleet-owner maintenance+training (2).
5. **A customer-facing "my reputation" view**, matching what driver's profile already has (a ratings-received star histogram + recent comments) — a customer's own profile has no equivalent, despite customers being rated by workers too.
6. **A referral section on fleet-owner's profile** — the API already grants this role referrals; the profile page just never surfaces it (driver's profile does).
7. **Something to reconcile `/warehouse-hub/profile`'s "Dock slots: 6" against the dashboard's real dock-slot count of 0** — either the capacity field needs a different label, or dock-slot creation needs to be part of onboarding.

---

## REDESIGN NOTES

**Customer** — primary screen is the dashboard; it should lead with the category picker (the actual product, per Phase C), not two logistics-only tiles that undersell everything else on offer. Single most important number: the active-booking status, when one exists. Track page is doing five jobs at once (status, map, chat, payment, chain-of-custody) and is the strongest split candidate.

**Driver / Hamali (solo)** — primary screen is correctly the dashboard (today's earnings as the dominant number is a good, already-established pattern — keep it). These two roles' entire page-set should become one parameterized component set instead of two copy-pasted ones; that's not just cleanup, it's what will make training/certifications/referrals easy to finally wire into nav for both at once instead of twice.

**Mutha leader** — primary screen is the dashboard (roster + invite code + active jobs). Governance is doing the most jobs of any page in the app (5 real sub-features) and should split into tabs. Operations and Active Jobs overlap enough to reconsider as one screen.

**Mutha member** — thinnest, most focused role in the app (3 tabs, everything single-purpose) — a good reference model for what "just enough" looks like elsewhere.

**Fleet owner / Warehouse hub** — both are under-navigated (2 tabs each) relative to how much real functionality exists one level down (maintenance, training, dock slots, inspections). Primary screen should probably gain a 3rd tab for the thing each role does most often (Fleet: vehicles/maintenance; Warehouse: dock spaces) rather than nesting it all under Home.

**Manager / Admin** — dashboard tile grid correctly reflects live permissions; keep that mechanism, but every admin-only route needs the same "show a real 403, not a fake empty state" treatment `/admin/users` currently fails.

**Federation state / district** — currently a single read-only report each. State's screen works well as a rollup dashboard. District's needs to become an actual console (the three missing actions above) before it's usable for its actual job.

---

*End of inventory. Test accounts created during this pass (`9200000001`–`9200000006`, password `TestPass123!`) remain live in production — say the word if you want them removed.* — diagnosed early, out of order, because it gates everything else

Per the brief: "there is a known bug where worker profile creation by role is not working." I tested this directly against production rather than trusting the code read, for every role that has a profile-creation step:

| Role | Signup completed | Sub-document created | Live-verified |
|---|---|---|---|
| `hamali_solo` | ✓ (phone `9200000001`) | `HamaliProfile{type:'solo'}` | ✓ landed on `/hamali/dashboard` correctly, "You're offline" state, ₹0 earnings, 0 jobs |
| `mutha_leader` | ✓ (phone `9200000002`) | `Mutha` with real generated invite code `0990EA01` | ✓ landed on `/mutha/dashboard`, group name/invite code rendered correctly |
| `mutha_member` | ✓ (phone `9200000003`) using the real invite code above | `HamaliProfile{type:'mutha_member'}` + pushed into `Mutha.memberIds` | ✓ landed on `/mutha-member/job`, correctly shows "Inventory Test Mutha · Team leader: Inventory Test Leader" |
| `driver` | ✓ (phone `9200000004`) | `Vehicle{type:'mini_truck', capacityKg:1000}` | ✓ landed on `/driver/dashboard`, "200 km radius" service area shown |
| `fleet_owner` | ✓ (phone `9200000005`) | `Fleet{vehicleIds:[], driverIds:[]}` | ✓ landed on `/fleet-owner/dashboard`, fleet name rendered |
| `warehouse_hub` | ✓ (phone `9200000006`) | `WarehouseHub` | ✓ landed on `/warehouse-hub/dashboard`, hub name rendered |

I then went one step further than signup and tested the **post-signup profile-completion step** the `hamali_solo` signup page itself points to ("You'll set your specific skills on your profile after signing up"):
- Clicked the "Electrical" skill chip on `/hamali/profile` → auto-saves on click (no separate Save button for skills) → confirmed via a direct `GET /api/hamali-profile/me` read-back: `{"skills":["electrical"]}`. Works.
- Uploaded a KYC document via a direct `POST /api/kyc/documents` call (Aadhaar, real base64 payload) → `200`, real document record created with `status:"under_review"`. Works. (URL is a mock-Cloudinary placeholder — no real Cloudinary credential is configured in production, a separate, already-known, already-documented gap, not this bug.)

**Conclusion: I could not reproduce "worker profile creation is not working" on production, for any role, at any step, right now.** Every signup path creates its User record and its role-specific sub-document correctly; every profile-editing action I tried persisted correctly. I'm reporting this as a clean bill of health rather than inventing a failure to match the brief — per the brief's own rule ("never mark something as working that you did not actually click"), the inverse holds too.

Two honest possibilities for why this was reported as broken: (1) it was a real bug that got fixed as a side effect of other work earlier in this project's history (the codebase has had several rounds of exactly this kind of remediation — see `AUDIT_REPORT.md`'s own pattern of "field existed with no way to actually set it" bugs found and closed), or (2) "profile creation" refers to something more specific I haven't hit yet — a particular document type, a particular field, or a particular role combination. **If you can tell me the exact role + exact step where you saw it fail, I can reproduce it precisely instead of guessing further.**

(Test accounts created for this diagnosis — `9200000001` through `9200000006`, password `TestPass123!` — are real throwaway accounts now sitting in production. Say the word if you want them deleted; each role's own profile page has a working "Delete account" action I confirmed exists in the DOM.)

---

## CUSTOMER

### `/customer/dashboard` · Customer

**Purpose:** Landing screen after login — surface the one active booking if there is one, offer the two most common next actions (book a truck, book hamali labour), and a jump-off point to full history and AI support.

**Data displayed:**
- Greeting with first name (from `user.name`)
- Unread notification count on the bell icon
- "Book a Truck" / "Instant logistics support" tile
- "Hamali Labor" / "Hire loaders" tile
- "History" / "View past trips" tile
- Active Tracking card (only if an incomplete booking exists): status chip, fare total, created date, pickup/drop short addresses, a progress bar computed from status index
- Recent bookings list (up to 5, excludes the active one): pickup→drop, fare, status chip, type icon
- AI Support widget (collapsed, click to ask)

**API calls:**
- `GET /api/bookings` → array of `{_id, type, status, fareBreakdown.total, pickupLocation.address, dropLocation.address, createdAt}` → every field listed is rendered; nothing fetched-and-unused on this page.

**Interactive elements:**
| Control | Type | Action | Works? |
|---|---|---|---|
| Notification bell | link | → `/customer/notifications` | yes (route exists) |
| "Enable alerts" bell button | button | requests browser push permission | yes, native browser API |
| Book a Truck tile | link | → `/customer/book` | yes |
| Hamali Labor tile | link | → `/customer/book?type=hamali` | yes |
| History tile | link | → `/customer/history` | yes |
| Active Tracking card | link | → `/customer/track/[id]` | yes |
| "See all" | link | → `/customer/history` | yes |
| Each recent-booking row | link | → `/customer/track/[id]` | yes |
| Bottom tabs (Home/Book/History/Profile) | link | navigate | yes |
| AI assistant widget | button → expands | posts to `/api/agents/support` | yes (see AI Status section at end of doc) |

**Forms:** none on this page.

**States present:** loading ✓ (skeleton) · empty ✓ (EmptyState + "book your first" CTA) · error **✗ — a failed `/api/bookings` call is silently treated as the identical empty state** (see source: `loadState==='unavailable'` renders nothing distinct from an honest zero-bookings case; the user has no way to tell "you have no bookings" from "we couldn't load your bookings"). offline ✗ not handled.

**Content hierarchy:** 1) the active-booking tracker (if present) — this is what a returning customer with an open job actually came here for; 2) Book a Truck (biggest tile, correctly dominant); 3) recent bookings list; 4) AI assistant, currently bottom-of-page and easy to miss.

**Notes:** Copy is stale relative to the Phase C pivot — "Book a Truck" / "Instant logistics support" and "Hamali Labor" / "Hire loaders" is pure old cargo-logistics framing, with zero mention of the 10 household-service categories (electrician, plumber, etc.) that `/customer/book` itself already supports via `CategoryPicker`. A first-time customer landing here has no visual cue this is a cooperative household-services marketplace at all — the redesign's home screen should surface the category grid, not two truck/hamali tiles.

---

### `/customer/book` · Customer

**Purpose:** Create a new booking — pick a service (12 categories), set pickup/drop (+ up to 5 stops), specify job details (weight/goods-type/hamali count), get a live fare quote, optionally open it for driver/worker bidding instead of a fixed fare, and confirm.

**Data displayed:**
- 12-category picker grid (icon + label each)
- Truck / Hamali / Combo dispatch-type toggle (auto-set by category, user can still see/override)
- Pickup / Drop / Stops address fields with autocomplete
- Route map preview (Leaflet) once both points are set
- Cargo weight (kg) — truck/combo only
- Goods type dropdown, estimated value (₹), conditional e-way-bill number field (appears only when value ≥ ₹50,000)
- Hamali worker count stepper — hamali/combo only
- Schedule toggle: Now / Schedule (date-time picker with 30min–14-day bounds)
- Live fare estimate card: base fare, distance fare, surge multiplier, hamali fare, total
- "Open this booking for bidding" checkbox + explanation
- AI "price check" widget (click-to-run, compares quote to fare rule + recent bookings)
- Saved-address chips (if the customer has any)

**API calls:**
- `POST /api/bookings/quote` → `{fareBreakdown}` → rendered as the fare card, debounced 450ms after any relevant field changes
- `POST /api/bookings` (on submit) → `{booking: {_id}}` → used only to redirect to `/customer/track/[id]`
- `GET /api/geocode?q=` (via `AddressField`) → `{results: [{lat, lon, displayName, region}]}` → displayName shown in dropdown, region used silently to set the booking's `region` field (not displayed to user at all — this is a real "fetched but invisible" field worth surfacing in a redesign, since right now the customer has no way to see or correct what region their booking will be priced/matched against)
- `GET /api/service-categories` → 12 active categories → all rendered as picker tiles
- `GET /api/addresses` (saved addresses) → label + address → rendered as quick-select chips

**Interactive elements:**
| Control | Type | Action | Works? |
|---|---|---|---|
| Category tiles (×12) | button | selects category, sets dispatch type | yes |
| Truck/Hamali/Combo radio | button group | overrides dispatch type | yes |
| Pickup/Drop/Stop fields | autocomplete input | geocode search, select result | yes |
| "+ Add a stop" | button | adds stop field, capped at 5 | yes |
| "Save this address" | link/button | `POST /api/addresses` | yes |
| Cargo weight input | number input | sets weight | yes |
| Goods type select | dropdown | sets goodsType | yes |
| Estimated value input | number input | sets value, conditionally reveals e-way field | yes |
| Hamali count stepper | +/- buttons | sets count, min 1 | yes |
| Now/Schedule toggle | radio | shows/hides datetime picker | yes |
| "Open this booking for bidding" checkbox | checkbox | sets `openForBidding` | yes |
| AI price-check | button | `POST /api/agents/pricing-quote` | yes (mock-mode fallback currently, see AI Status) |
| Confirm — ₹X | button | `POST /api/bookings`, disabled until quote ready | yes |

**Forms:** effectively one large form; see fields above. Required: pickup, drop, weight (truck/combo), hamali count ≥1 (hamali/combo). Everything else optional.

**States present:** loading ✓ (fare-card skeleton while quoting) · error ✓ (quote/submit errors shown inline, including the real "No active fare rule for {region}/{category}" 422 for an unserved region) · empty — n/a (form page) · offline ✗.

**Content hierarchy:** 1) category picker (first thing seen, correctly dominant); 2) pickup/drop; 3) fare total (currently buried mid-page under weight/goods fields — in a redesign this is a strong candidate to pin/sticky since it's the number the customer is most anxious about); 4) confirm button.

**Notes:** the derived `region` (used for pricing + matching) is invisible to the customer — worth exposing ("Booking priced for: Chennai") both for trust and because a bad geocode match would otherwise fail silently at confirm time with a 422 the customer can't self-diagnose.

---

### `/customer/history` · Customer

**Purpose:** Full list of past and current bookings, for reference/reordering/dispute purposes.

**API calls:** `GET /api/bookings` — same endpoint as dashboard, unfiltered/unpaginated full list.

**Data displayed:** every booking's type icon, pickup→drop, fare, status, date.

**Interactive elements:** each row → `/customer/track/[id]`. No filters, no search, no date-range, no pagination control visible in source.

**States present:** loading, empty — same skeleton/EmptyState pattern as dashboard. Not yet screenshotted live (queued).

**Notes:** with no pagination, an account with hundreds of bookings would load the entire list in one call — a real scale concern for a redesign to fix, not just decorate.

---

### `/customer/track/[bookingId]` · Customer

**Purpose:** Real-time status of one booking end to end — where the worker is, what's been paid, chain-of-custody for goods, and the mandatory post-completion rating.

**Data displayed:** tracking ID, type, status timeline (all historical `statusHistory` entries with timestamps), live map with pickup/drop/stops/live worker position (or an honest "waiting for live location" state if no GPS ping has arrived yet), fare breakdown, assigned worker/driver/mutha card (name, rating, vehicle if applicable), chat panel, photo proof (pickup/delivery) once uploaded, goods-type + e-way-bill number if declared, halt/chain-of-custody timeline for truck bookings, payment section (pay-now / pay-COD / paid+invoice-link), "report an issue" link, cancel button (pre-completion only).

**API calls:**
- `GET /api/bookings/:id` → full booking object → nearly every field is rendered; `openForBidding` drives whether the bids-review section shows.
- `GET /api/loadboard/:id/bids` (only while `openForBidding` and status is requested/searching) → bidder name/rating/amount/message → all rendered.
- `GET /api/checkpoints/booking/:id/halts` (truck/combo only, in_progress/completed) → checkpoint name/type, arrival/departure, sealIntact → rendered as chain-of-custody list.
- `GET /api/payments/:id` → payment status/method → rendered in PaymentSection.
- `GET /api/ratings/pending` (once completed) → triggers the mandatory RatingModal if this booking is the pending one.
- Socket.IO room `booking:{id}` for live status + live location + chat — not a REST call, real-time push.

**Interactive elements:** cancel booking (pre-completion), accept-bid buttons (if bidding open), chat send, pay-now/pay-cash-on-delivery buttons, report-an-issue link, tax-invoice download link (post-payment), star rating + comment box (mandatory modal, gated).

**States present:** loading ✓ · error ✓ (real error card) · the "waiting for live location" honest state is a genuinely good pattern worth carrying into the redesign as a first-class empty/pending state, not just a spinner.

**Notes:** this is the single most information-dense page in the whole app — a strong candidate for splitting in a redesign (status/map could be its own focused view, with payment/chat/chain-of-custody as expandable sections rather than one long scroll).

---

### `/customer/track` (bare, no id) · Customer

**Purpose:** Not a real page — a client-side redirect to `/customer/history` (confirmed in source: `router.replace('/customer/history')` on mount, renders nothing itself). Not orphaned, not broken — deliberate, just worth knowing it isn't its own screen for the redesign's route map.

---

### `/customer/insurance` · Customer

**Purpose:** Enroll in and manage cargo/stock protection for the customer's own goods (new this cycle — previously no customer-facing insurance existed at all).

**Data displayed:** active coverage cards (plan name, category, coverage amount, valid-until date), claim status list, payout history. Empty on a fresh account: "No active coverage yet" / "No claims filed" / "No payouts yet".

**API calls:** `GET /api/insurance/me` → `{policies, parametricTriggers, parametricTriggerHistory, claims}`. `GET /api/insurance/plans` (on "Explore plans") → active plans for role `customer`.

**Interactive elements:** "Explore plans" (opens modal, lists plans, drill into one → consent checkbox → "Confirm enrolment" → `POST /api/insurance/enroll`), "Report New Incident" (opens claim form modal: policy select, incident date, description textarea, optional photos → `POST /api/insurance/claims`).

**Forms:** claim form — policy (required, select), incident date (required, date), description (required, 1–2000 chars), photos (optional array).

**States present:** empty ✓ (three independent empty states, one per section) · loading — not yet confirmed live · error — not yet confirmed live.

**Notes:** the description textarea sits inside a `Modal` — this was the exact component with the focus-steal bug fixed earlier this session; confirmed working live already in a prior verification pass.

---

### `/customer/notifications` · Customer

**Purpose:** Full notification inbox/history.

**Data displayed (live-confirmed):** real notification feed — "Booking update: Your booking is now completed / in_progress", "Matched! Someone's on the way for your booking", each with a full timestamp. "Mark all read" action visible.

**API calls:** `GET /api/notifications`, `PATCH /:id/read`, `PATCH /read-all`.

**Interactive elements:** "Mark all read" button, presumably tap-to-read per row (not yet clicked).

**Notes:** the "booking update" body text interpolates the **raw status enum value** verbatim — "Your booking is now `in_progress`" — not a humanized label ("in transit"/"on the way"). Confirmed live, matches `notification.service.ts`'s `booking_status` template (`\`Your booking is now ${v.status}.\``). Real polish gap for the redesign, and arguably an i18n gap too (the enum string never goes through translation).

---

### `/customer/profile` · Customer

**Purpose:** Identity, language, saved addresses, business/GST profile, notification + privacy settings, ratings received, complaint history, referrals, insurance link, support link, account deletion.

**Data displayed (composed of many shared `ProfileSections` components, each independently fetched):** name/phone/avatar/account-status badge, language picker (en/te/hi), identity fields (name, email, phone, account-created date, user ID) with edit/change-password links, saved addresses list with per-item delete, frequent-routes section, business/GST toggle + GSTIN/company fields, notification preference toggles (push/SMS × job-updates/payments/promotions), privacy settings (share-location-while-offline, profile visibility), ratings-received list, complaint history, referral code + invite section, insurance link, support link, danger-zone (delete account).

**API calls:** `GET /api/auth/me` (via auth-context, shared across app) · `GET /api/addresses` · `GET /api/bookings/frequent-routes` · `GET /api/ratings/mine` · `GET /api/complaints/mine` · `GET /api/referrals/me` · various `PATCH /api/auth/me/*` on each section's save.

**Notes:** this is a LOT of independently-loading sections stacked vertically with no in-page navigation (no tabs/anchors) — a real candidate for a tabbed or accordion redesign rather than one long scroll.

---

### `/customer/support` · Customer

**Purpose:** Escalation path — file a complaint tied to a specific booking, or self-serve via FAQ, separate from the AI assistant widget on other pages.

**Data displayed (live-confirmed):** "Report an issue" form (booking select showing all 11 of this account's real bookings by date+address, category select, submit), 3 real FAQ entries with honest copy ("we never fake a match").

**API calls:** `POST /api/complaints` on submit (category enum matches server exactly: no_show/damage/payment/misconduct/other). `GET /api/bookings` again for the select list (third page on this account alone to independently re-fetch the full booking list — dashboard, history, and this all call the same unfiltered `GET /api/bookings`).

**Notes:** three separate pages fetching the same full, unpaginated booking list independently is a real redesign opportunity (shared cache/store) as well as a scale concern.

---

## DRIVER

### `/driver/dashboard` · Driver

**Purpose:** Online/offline toggle, today's earnings hero number, active job shortcut, service-area setter, and jump-offs to earnings/insurance/AI tools.

**Data displayed:** avatar+name+rating badge, online/offline/on-job toggle, today's earnings (₹, computed client-side by filtering `earnings.me`'s lines to today), trips count, rating, active-job card (pickup/drop/status) or an honest "no active job" state, service-area card (radius + current willing-location address or "Not set"), demand-forecast AI widget, support AI widget, mandatory rating modal (auto-opens if a completed job needs rating).

**API calls:** `GET /api/availability` → `{availabilityStatus, willingLocation}`, `GET /api/ratings/pending` → `{bookingId|null}` (drives the mandatory RatingModal), `GET /api/requests/mine` (polled every 8s) → filtered client-side to `accepted`/`in_progress` for the active-job card, `GET /api/earnings/me` (polled every 30s) → total/jobCount/lines, lines re-filtered client-side by today's date for the hero number.

**Interactive elements:** online/offline toggle (real, confirmed: PATCH `/api/availability`), earnings link, insurance link, "Change" on service area (opens location picker), AI widgets (click-to-run).

**States:** a driver with no `Vehicle` yet degrades gracefully — dashboard still renders, just without the toggle (confirmed in source comment + logic: a 404 on `/api/availability` sets `status:null` rather than breaking the page).

**Content hierarchy:** today's earnings is correctly the single biggest, boldest element on the page (explicit design intent per the source comment "Big honest hero number... not competing with any other stat") — good pattern, worth preserving.

---

### `/driver/requests` · Driver

**Purpose:** Real-time incoming job offer (one at a time, sequential dispatch, not a broadcast list) plus a small queue of other nearby requests, with a link out to the bidding-based Load Board as an alternative.

**Data displayed:** live incoming offer card (via socket, not polling) with accept/reject and a real error surfaced if accept fails (e.g., lost the race to another driver, or blocked by the mandatory-rating gate — confirmed in source this used to be silently swallowed and was fixed), a polled (6s) list of other visible requests, empty state if none.

**API calls:** `GET /api/requests` (polled 6s), `POST /api/requests/:id/accept`, `POST /api/requests/:id/reject`, plus the incoming-offer socket accept/reject round trip.

**Notes:** genuinely real-time, well-instrumented (the accept-failure-now-surfaced fix is a good sign of iterative hardening, not a red flag).

---

### `/driver/active-job/[bookingId]` · Driver *(fully documented in an earlier session pass — carried forward)*

**Purpose:** Step through one job: accepted → cargo verification checklist → load manifest sign-off → in-transit (with live location broadcast + halt check-in/out for chain-of-custody) → delivery photo → mark delivered → mandatory rating.

**Data displayed:** step progress bar, customer card (name/rating/message button), pickup/drop addresses, cargo checklist (weight/description/pickup-photo, system-derived not inspector-entered), manifest link (once pickup photo confirmed), live-location-sharing indicator, halt check-in/out card (odometer, seal-intact yes/no), chat panel, photo-proof capture (pickup/delivery).

**API calls:** `GET /api/requests/mine` (polled), `POST /api/requests/:id/start`, `POST /api/requests/:id/complete`, `POST /api/requests/:id/proof-photo`, `POST /api/checkpoints/halts/check-in`, `PATCH /api/checkpoints/halts/:id/check-out`, socket location broadcast + chat.

**Notes:** this is the other page (besides customer track) that's carrying the most real-time complexity — a strong split candidate for a redesign (the manifest step could be its own screen instead of a sub-route, which it already partly is at `/driver/active-job/[id]/manifest`).

---

### `/driver/loadboard` · Driver

**Purpose:** Browse open-for-bidding loads and place a price instead of accepting the fixed sequential offer.

**Data displayed/API:** thin wrapper around the shared `LoadBoardPage` component — `GET /api/loadboard`, `POST /api/loadboard/:id/bids`, `POST /api/loadboard/:id/bids/:bidId/withdraw`.

**Notes:** reachable only via a text link inside `/driver/requests` ("Browse the Load Board"), not the bottom nav — worth a real nav slot in a redesign given it's a distinct earning mode, not a sub-feature of requests.

---

### `/driver/earnings` · Driver

**Purpose:** Total earned, incentive-bonus progress, cash-on-delivery collection queue, itemized job history.

**Data displayed:** wallet-balance hero (₹, honestly the same number as total-earned — source comment explicitly notes there is no separate withdraw-to-bank ledger, this is not a fabricated feature), completed-jobs count, incentive bonus banner (if any), incentive progress bar, **CodCollectionSection** ("cash to collect" — real, built this session), itemized earning lines.

**API calls:** `GET /api/earnings/me` (polled 30s).

**Notes:** "wallet balance" naming implies a withdrawable balance that doesn't exist — worth renaming in a redesign to avoid implying a cash-out feature that isn't there.

---

### `/driver/insurance` · Driver

Same shared `InsuranceDashboard` component as customer/fleet-owner/warehouse-hub/mutha roles — see the Customer section above for the full breakdown (enroll flow, claim-filing modal, empty states). For `driver`, the real seeded plans are **Worker Earnings Protection** (parametric) and **Vehicle & Commercial Auto Cover** (standard) — confirmed via `seedInsurancePlans.ts`.

---

### `/driver/notifications` · Driver

Same shared notification-list pattern as customer — not re-verified live for this role specifically (same component, same API, no role-specific logic in source), moving on rather than re-testing an already-confirmed shared pattern.

---

### `/driver/profile` · Driver

**Purpose:** Everything `/customer/profile` has, plus vehicle details (type/registration/capacity, editable) and vehicle-specific KYC documents (driving licence, RC, FASTag, PUC, fitness certificate).

**Data displayed (live-confirmed on the real demo driver account):** identity, a full **Vehicle** card (mini truck, Verified badge, "Reg. AP01DEMO01", editable capacity), 7 KYC document rows all showing "Verified" (driving licence, vehicle RC, FASTag, PUC certificate, vehicle fitness certificate, Aadhaar, PAN), document-expiry tracker, notification/privacy toggles, payout details (none on file), **ratings-received histogram** (a real 5/4/3/2/1-star bar breakdown plus recent comments — the demo account had two real comments: "live verification cleanup" and "t"), complaint history, referral code + earnings, support, logout, delete account.

**API calls:** `GET /api/vehicles/me` (a 404 is caught and treated as "no vehicle yet," not an error — confirmed in source), `PATCH /api/vehicles/me` (capacity edit), plus every shared `ProfileSections` endpoint (addresses/ratings/complaints/referrals/etc.).

**Notes:** the ratings-received histogram is a genuinely nice pattern not present on the customer profile — worth carrying that consistency into the redesign (customers rate workers with the same 5-star system; a customer's own profile currently has no equivalent "here's your reputation" view).

---

### `/driver/certifications`, `/driver/training`, `/driver/referrals` · Driver

**Status:** all three are real, fully-built pages (`CertificationList`, `TrainingAcademy`, `ReferralDashboard` — the same components `hamali/*` and `fleet-owner/training` reuse), confirmed via source read — **not stubs**. They are simply **orphaned**: zero links to any of them exist anywhere in the driver nav, dashboard, or profile page. A new driver has no way to discover the training academy, their certifications, or the referral program short of typing the URL. This is the single clearest "page a redesign should just link up" finding in the whole audit — the feature work is done, the navigation isn't.

---

