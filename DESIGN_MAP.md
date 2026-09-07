# FYRO — Design Map (Stitch → Route)

Source: `stitch_fyro_cooperative_services_platform.zip` (106 folders: 102 screens + 1 design-system doc + 1 wordmark study + 2 photography-direction boards). Cross-referenced against `PAGE_INVENTORY.md`.

**Superseded:** the repo's existing `ip-*` ("Ink on Warm Paper") token system (commits `d4e88a5`/`50a29a2`) was built off a *different, earlier* Stitch export. This new zip is the design source of truth going forward — `ip-*` gets replaced, not layered alongside.

Legend: **rebuild** = existing route, new visuals+behavior · **new** = page doesn't exist yet, Stitch designed it · **gap** = inventory page has no Stitch screen (build from tokens, flag if it matters) · **ref** = not a route, feeds a shared component/spec.

---

## 0 — Not routes (feed the component library / brand system)

| Stitch folder | Feeds |
|---|---|
| `fyro_cooperative_platform` | `DESIGN.md` — the token source for §Phase 0.2 |
| `fyro_dial_component_study_1`, `_2` | The `<RotaryDial>` component spec (Phase 1.1) |
| `fyro_wordmark_and_cooperative_emblem` | Logo/emblem asset — feeds `MEDIA_MANIFEST.ts` |
| `warm_documentary_photograph_of_indian_cooperative_workers...` | Photography direction ref for `<Media kind="photo">` placeholders |
| `warm_studio_portrait_of_an_authentic_indian_tradesperson...` | Same, portrait variant |

---

## 1 — Public & Marketing (Phase 2)

| Stitch folder | Route | Components needed |
|---|---|---|
| `fyro_landing` | `/` | PageHeader, Media(full-bleed), ChipRow, Button |
| `fyro_about` | `/about` | PageHeader, Section, Media |
| `fyro_contact` | `/contact` | PageHeader, SearchField-style inputs |
| `fyro_faq` | `/faq` | Accordion (exists), PageHeader |
| `fyro_how_it_works` | `/how-it-works` | PageHeader, Timeline/Stepper, Media |
| `fyro_pricing` | `/pricing` | PageHeader, DataTable, MetricTile |
| `fyro_safety` | `/safety` | PageHeader, Section |
| `fyro_terms_of_service` | `/terms-of-service` (currently orphaned — wire into nav) | PageHeader, Section |

## 2 — Auth (Phase 2)

| Stitch folder | Route | Notes |
|---|---|---|
| `fyro_language_selection` | `/language-selection` | Chip picker |
| `fyro_role_selection` | `/role-selection` | Card grid |
| `fyro_onboarding_walkthrough` | `/onboarding-walkthrough` (orphaned — wire in) | Stepper, Media |
| `fyro_login` | `/login` | SearchField-style phone input, PhotoUpload N/A |
| `fyro_otp_verification` | `/otp-verification` (orphaned, was meant for reset — now correctly used) | OTP input group |
| `fyro_forgot_password` | **new** `/forgot-password` | Item 2 in "Pages That Should Exist But Don't" — build this flow |
| `fyro_reset_password` | **new** `/reset-password` | Same flow, second step |
| `fyro_signup_customer` | `/signup/customer` | Form |
| `fyro_signup_worker` | `/signup/driver`, `/signup/hamali` (joinType: solo/mutha_member/mutha_leader) | One template, role-parameterized |
| `fyro_signup_business` | `/signup/fleet-owner`, `/signup/warehouse-hub` | One template, role-parameterized |

## 3 — Customer (Phase 1.2)

| Stitch folder | Route | Notes |
|---|---|---|
| `fyro_household_home` | `/customer/dashboard` (rebuild) | THE new home — category-grid-led, replaces the two truck/hamali tiles per inventory's explicit note |
| `fyro_household_mode` | `/customer/book` — household branch | CategoryPicker → household services |
| `fyro_labour_home` | `/customer/book` — labour entry | Forks to standard/bulk below |
| `fyro_hamali_labour_standard` | `/customer/book` — labour, <100t | Worker count, duration, material, direct booking |
| `fyro_hamali_labour_bulk` | `/customer/book` — labour, ≥100t | Tonnage slider, multi-society assembly visual — **backend check needed, see open questions** |
| `fyro_transport_home` | `/customer/book` — transport entry | |
| `fyro_goods_transport` | `/customer/book` — transport form | Region chip must become visible+correctable per inventory note |
| `fyro_service_detail_booking_1`, `_2` | `/customer/book` — category detail + confirm steps | Fare card, confirm |
| `fyro_live_tracking_1`, `_2` | `/customer/track/[bookingId]` (rebuild, tabbed) | `_1`=Status/Map, `_2`=Chat/Payment/Custody — matches the inventory's explicit tab split |
| `fyro_booking_history_1`, `_2` | `/customer/history` (rebuild, +filters/search/pagination) | Shared booking-list cache (3 pages currently double-fetch) |
| `fyro_customer_profile_1`, `_2` | `/customer/profile` (rebuild, tabbed) | Splits the current one-long-scroll page |
| `fyro_customer_reputation` | **new** `/customer/reputation` | Item 5 — ratings-received histogram, mirrors driver's |
| `fyro_support_complaints` | `/customer/support` | Complaint form + FAQ |

## 4 — Workers: Driver + Hamali (Phase 3.1 — THE parameterized set)

Both `worker_*` and `labour_worker_*` folders exist for nearly every screen — confirms two Stitch variants (driver-accent vs hamali-accent) of one underlying component. Build once, parameterize.

| Stitch folders (driver / hamali) | → Component | Routes |
|---|---|---|
| `fyro_worker_dashboard_offline`/`online` · `fyro_labour_worker_dashboard_offline`/`online` | `WorkerDashboard` | `/driver/dashboard`, `/hamali/dashboard` |
| `fyro_worker_requests_queue` · `fyro_labour_worker_requests_queue` | `WorkerRequests` | `/driver/requests`, `/hamali/requests` |
| `fyro_worker_incoming_offer` · `fyro_labour_worker_incoming_offer` | Incoming-offer card (part of `WorkerRequests`) | same |
| `fyro_worker_active_job` · `fyro_labour_worker_active_job` | `WorkerActiveJob` | `/driver/active-job/[id]`, `/hamali/active-job/[id]` |
| `fyro_worker_load_manifest` | Manifest sub-step (**driver-only** — no hamali manifest route exists, confirmed) | `/driver/active-job/[id]/manifest` |
| `fyro_crew_photo_proof` | Photo-proof capture (shared step, both roles + mutha crew flows) | embedded in active-job |
| `fyro_worker_load_board` · `fyro_labour_worker_load_board` | `WorkerLoadBoard` | `/driver/loadboard`, `/hamali/loadboard` — **gets a real nav slot per Phase 3.2** |
| `fyro_worker_earnings` · `fyro_labour_worker_earnings` | `WorkerEarnings` | `/driver/earnings`, `/hamali/earnings` — rename "wallet balance"→"total earned" |
| `fyro_worker_insurance` · `fyro_labour_worker_insurance` | `InsuranceDashboard` (role-scoped) | `/driver/insurance`, `/hamali/insurance` |
| `fyro_worker_profile` · `fyro_labour_worker_profile` | `WorkerProfile` + slot (`VehicleSection` / `HamaliSkillsSection`) | `/driver/profile`, `/hamali/profile` |
| `fyro_worker_certifications` · `fyro_labour_worker_certifications` | `CertificationList` | `/driver/certifications`, `/hamali/certifications` — **orphaned, wire into nav** |
| `fyro_worker_training_academy` · `fyro_labour_worker_training_academy` | `TrainingAcademy` | `/driver/training`, `/hamali/training` — **orphaned, wire into nav** |

**Gap:** no `referrals` screen in the export. `ReferralDashboard` keeps its current visuals re-skinned to new tokens unless you have a screen for it.

## 5 — Mutha / Society (Phase 3.2)

| Stitch folder | Route | Notes |
|---|---|---|
| `fyro_society_dashboard` | `/mutha/dashboard` | |
| `fyro_society_requests` | `/mutha/requests` | |
| `fyro_society_active_jobs` | `/mutha/active-jobs` | No separate "operations" screen in the export — **confirms the inventory's merge recommendation**; `/mutha/operations` folds in here |
| `fyro_society_members` | `/mutha/members` | No add-member UI by design (self-service via invite code) |
| `fyro_society_assign_members` | `/mutha/assign-members` | |
| `fyro_crew_job_assignment` | `/mutha-member/job` | Member's single-job view |
| `fyro_society_group_settings` | `/mutha/create-group` → **rename to "Group settings"** | Per inventory note 6 |
| `fyro_society_governance` | `/mutha/governance` (rebuild, tabbed: Bye-laws/Equity/Surplus/Voting) | Leader, full edit |
| `fyro_crew_society_governance` | `/mutha-member/governance` | Member, read-scoped mirror |
| `fyro_society_earnings` | `/mutha/earnings` | Group total |
| `fyro_crew_personal_earnings` | `/mutha-member/earnings` | Individual |
| `fyro_society_insurance` | `/mutha/insurance` | |
| `fyro_crew_personal_insurance` | `/mutha-member/insurance` | |
| `fyro_society_profile` | `/mutha/profile` | |
| `fyro_crew_member_profile` | `/mutha-member/profile` | "My Mutha" card (leader info, flag-issue, leave-group) |
| `fyro_society_training_needs` | **unclear** — see open questions | Possibly the leader's own skill-gap view (subset of federation's training-needs matrix); not in current inventory as a mutha-side page |

## 6 — Fleet Owner (Phase 4)

| Stitch folder | Route | Notes |
|---|---|---|
| `fyro_fleet_owner_dashboard` | `/fleet-owner/dashboard` | |
| `fyro_fleet_owner_vehicles` | **new** `/fleet-owner/vehicles` | 3rd nav tab per Phase 4 instruction — no dedicated list route exists today |
| `fyro_fleet_owner_register_vehicle` | **new** `/fleet-owner/vehicles/register` | Today it's an inline dashboard action only |
| `fyro_fleet_owner_assign_driver` | Modal/screen off the dashboard's "Assign driver" action | |
| `fyro_fleet_owner_vehicle_inspection` | `/fleet-owner/vehicles/[id]/inspection` | Not walked live in inventory (0 vehicles on demo account) |
| `fyro_fleet_owner_maintenance` | `/fleet-owner/maintenance` | Orphaned — wire into new 3rd tab |
| `fyro_fleet_owner_training` | `/fleet-owner/training` | Orphaned — wire in |
| `fyro_fleet_owner_insurance` | `/fleet-owner/insurance` | Fix mislabeled "for your goods" copy |
| `fyro_fleet_owner_profile` | `/fleet-owner/profile` | Add referral section (item 6), rewrite GSTIN helper text |

## 7 — Warehouse Hub (Phase 4)

| Stitch folder | Route | Notes |
|---|---|---|
| `fyro_warehouse_hub_dashboard` | `/warehouse-hub/dashboard` | Reconcile "Dock slots: 6" vs "TOTAL DOCKS: 0" |
| `fyro_warehouse_hub_dock_slots` | **new** `/warehouse-hub/dock-slots` | 3rd nav tab; dock-slot creation screen (item 7) |

**Gap:** no `/warehouse-hub/profile` or `/warehouse-hub/insurance` screens in the export. Both are near-identical in shape to fleet-owner's (confirmed in inventory) — plan is to reuse the fleet-owner profile/insurance templates re-tokened for warehouse, unless you have screens for these.

## 8 — Admin / Manager (Phase 5)

| Stitch folder | Route | Notes |
|---|---|---|
| `fyro_admin_overview` | `/admin/dashboard` | Keep live permission-gated tile grid; hide (not disable) ungranted tiles |
| `fyro_admin_bookings` | **new/unclear** — no current dedicated admin bookings-list route | See open questions |
| `fyro_admin_complaints` | `/admin/complaints` | |
| `fyro_admin_fares_rate_cards` | `/admin/fares` | Remove stale "Launch region is Visakhapatnam" copy |
| `fyro_admin_kyc_queue` | `/admin/kyc-queue` | |
| `fyro_admin_managers_permissions` | `/admin/managers` | |
| `fyro_admin_societies` | **new/unclear** — no current dedicated route | See open questions |
| `fyro_admin_surge_zones` | `/admin/surge-zones` | |
| `fyro_admin_users` | `/admin/users` | **The 403-vs-empty-state fix goes here first**, then everywhere |
| `fyro_admin_user_detail` | **new** `/admin/users/[id]` | Row drill-in, doesn't exist today |

**Gap — 9 admin routes with no Stitch screen:** `/admin/disputes`(+`[id]`), `/admin/fraud-alerts`, `/admin/payouts`, `/admin/insurance`, `/admin/ledger`, `/admin/reports`, `/admin/incentives`, `/admin/regions`, `/admin/audit-log`, `/admin/analytics`, `/admin/ops-hub`, `/admin/profile`. These get built from the token system + `DataTable`/`MetricTile` primitives directly, matching the admin_overview/admin_users visual language, since no dedicated Stitch screen exists for them.

## 9 — Federation (Phase 6)

| Stitch folder | Route | Notes |
|---|---|---|
| `fyro_federation_ap_state_dashboard` | `/federation-state/dashboard` | Add proper rail + logout (currently a bare div) |
| `fyro_federation_guntur_district_dashboard` | `/federation-district/dashboard` | Same |
| `fyro_federation_district_action_console` | **new** — merges into `/federation-district/dashboard` | **This is the highest-priority missing page, and Stitch designed it.** Wires the 3 real endpoints: decide-affiliation, suspend-society, update-bounds |
| `fyro_federation_training_needs_matrix_ncct` | Section within `/federation-state/dashboard` (already documented as part of that page's data) | Confirm it's a section, not a separate route, against the code once building |

---

## Shared component build list (Phase 0.5)

Reusing existing components where the shape already matches (re-token, don't rewrite): `Card`, `Badge`→retire in favor of `StatusPill`, `Avatar`, `AvatarStack`, `DataRow`, `ListDivider`, `TopBar`, `BottomSheet`, `Modal`, `MetricCard`→`MetricTile`, `EmptyState`, `Skeleton`, `Accordion`, `Timeline`, `AgentResultCard`→`AgentCard`, `Pagination`, `FilterChip`→`Chip`, admin's `DataTable`, admin's `SidebarNav`.

New, built from scratch: `RotaryDial`, `Media` (+`MEDIA_MANIFEST.ts`), `PageHeader`, `Section`, `FlatRowList`, `Tabs`, `IconButton`, `ChipRow`, `Stepper`, `Slider`, `Toggle`, `SearchField`, `Select`, `DatePicker`, `PhotoUpload`(→`AvatarUpload`/`DocumentUploadCard` already exist, extend), `RatingHistogram`, `ProgressBar`, `ErrorState`, `PermissionDeniedState`, `OfflineBanner` (exists, re-token), `Toast`.

Consolidation: `StatusChip` + `Badge` + admin's ad-hoc status spans → one `StatusPill` primitive, semantic-color prop.

---

## Open questions (need your call before I lock these into Phase 0/1 architecture)

1. **`fyro_hamali_labour_bulk`** — does a real multi-society dispatch API exist server-side, or is this UI ahead of the backend? I'll check the routes before building; if it's not there, I build the UI against a documented stub and flag it rather than fake a working flow.
2. **`fyro_society_training_needs`**, **`fyro_admin_bookings`**, **`fyro_admin_societies`** — three Stitch screens with no clean match in the current inventory/route list. Best guesses above; confirm or redirect.
3. **Warehouse hub profile/insurance** — no Stitch screens exist for these two. OK to reuse the fleet-owner templates re-tokened, or do you have screens coming?
4. **9 admin routes** with no Stitch screen (disputes, fraud-alerts, payouts, insurance, ledger, reports, incentives, regions, audit-log, analytics, ops-hub, profile) — OK to build these from the token system directly (matching `admin_overview`/`admin_users` visual language), or hold until screens exist?

I'll proceed with the stated defaults on all four unless you say otherwise — flagging per the brief's own rule (ask instead of guessing on anything that drops or invents scope).
