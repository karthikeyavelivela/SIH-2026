# FYRO Design Inventory — Stitch UI Batch (85 Screens)

This document catalogs the 83 usable Stitch-generated screen designs in `design/stitch/stitch_fyro_logistics_marketplace/` (excluding `logo/` and `premium_industrial_marketplace/`, the latter being the design-token reference already consumed separately), maps each to a route/role in the existing FYRO Next.js app, and lists the shared UI components the build will need. It is the source of truth for the implementation pass that follows.

> Notes on interpretation: several Stitch screens carry leftover "Admin Console / Operations Manager" sidebar boilerplate from the generation prompt even when the actual screen content belongs to a different role (e.g. `customer_job_history`, `tax_regulatory_documents`). Role assignment below is based on screen **content**, not on stray chrome. Where two folders are clearly alternate designs of the same screen (e.g. `admin_dashboard` / `admin_dashboard_overview`, `driver_incoming_job_offer` / `driver_job_offer`, `mutha_leader_dashboard` / `mutha_group_dashboard`), both are listed against the same route with a note to consolidate during build.

## Role: customer

| Screen (folder) | Route | Role | New/Redesign | Key Components Needed | Description |
|---|---|---|---|---|---|
| customer_booking | `/customer/book` | customer | Redesign (existing `/customer/book`) | TopBar (new), BottomSheet (new), AddressField/AddressChips (existing), Card | Map-first booking sheet: pick up/drop, cargo weight, and toggle truck/hamali resources with a live fare estimate. |
| new_booking_service_selection | `/customer/book` (entry step) | customer | Redesign/extension | TopBar (new), Card, BottomTabNav (existing) | Entry screen to choose Truck Only, Hamali Only, or Combined service before entering booking details. |
| pickup_location_picker | `/customer/book/pickup` | customer | Redesign/extension | TopBar, BottomSheet (new), MapPinPicker (new, extends RouteMap) | Map pin-drop plus saved-address list for selecting the pickup location. |
| drop_location_picker | `/customer/book/drop` | customer | Redesign/extension | Same as above | Map pin-drop plus saved-address list for selecting the drop-off location. |
| cargo_details | `/customer/book/cargo` | customer | Redesign/extension | DocumentUploadCard (new)/PhotoProofCapture (existing), FilterChip (new) | Capture cargo weight, type (chip selector) and optional photo proof before vehicle selection. |
| vehicle_selection | `/customer/book/vehicle` | customer | Redesign/extension | Card, StatusChip (new) | Recommended + alternative vehicle option cards (payload/size/ETA) to choose the truck. |
| fare_estimate_breakdown | `/customer/book/fare` | customer | Redesign/extension | Card, TopBar | Itemized fare breakdown (base, distance, hamali fee, taxes) before payment. |
| no_drivers_available | `/customer/book/no-drivers` | customer | New (extension) | EmptyState (new), Card | Empty-state fallback offering schedule-later, raise-fare, or notify-me options. |
| review_booking | `/customer/book/review` | customer | Redesign/extension | Card, TopBar, RouteMap (existing, preview) | Final booking summary (route, vehicle, hamali, insurance, cost) with promo code and confirm & pay. |
| customer_home_dashboard | `/customer/dashboard` | customer | Redesign | TopBar, Card, BottomTabNav (existing) | Home with quick-book actions, active shipment tracker and quick-rebook suggestions. |
| customer_job_history | `/customer/history` | customer | Redesign | Card, StatusChip (new), TopBar | Searchable/filterable list of in-progress, scheduled, completed and cancelled bookings. |
| live_tracking_1 | `/customer/track/[bookingId]` | customer | Redesign | BottomSheet, StatusStepper (new), RouteMap (existing) | Full-screen map tracking with a drag-up driver-info sheet and a 5-step delivery status stepper. |
| live_tracking_2 | `/customer/track/[bookingId]` | customer | Redesign (alt variant — consolidate with live_tracking_1) | Same as above | Alternate tracking layout emphasizing ETA and origin/destination with call/chat actions. |
| in_app_chat | `/customer/track/[bookingId]` (chat) | customer | New | ChatPanel (existing, reuse) | In-app text chat thread between customer and assigned driver. |
| rate_review_experience | `/customer/track/[bookingId]` (post-trip) | customer | New | RatingModal (existing, extend for customer-side use), Card | Post-trip rating for the driver and hamali crew, plus a written review field. |

## Role: driver

| Screen (folder) | Route | Role | New/Redesign | Key Components Needed | Description |
|---|---|---|---|---|---|
| driver_home | `/driver/dashboard` | driver | Redesign | TopBar, OnlineToggle (existing), MetricCard (new) | Online toggle, today's earnings/trips/rating stats and a nearby-demand map hint. |
| driver_earnings | `/driver/earnings` | driver | Redesign | IncentiveProgressBar (existing), EarningLineCard (existing) | Weekly earnings summary, incentive progress bar, day-chip strip, itemized trip list. |
| wallet_payouts | `/driver/earnings` (wallet) | driver | Redesign/extension | EarningLineCard (existing), Card | Wallet balance, withdraw-to-bank action, categorized transaction history. |
| available_loads | `/driver/requests` | driver | Redesign | RequestCard (existing, extend), FilterChip (new) | Load-board list of open jobs with distance/price/weight filters and bid/accept actions. |
| driver_incoming_job_offer | `/driver/requests` (offer) | driver | Redesign/extension | CountdownRing (new), Card | Full-screen incoming offer with a 60s SVG countdown ring, route/cargo summary, accept/decline. |
| driver_job_offer | `/driver/requests` (offer, alt) | driver | Redesign/extension (consolidate with driver_incoming_job_offer) | CountdownRing (new), OfferCard (existing, extend) | Compact offer card with a 14s countdown ring, cash-payment badge, accept/reject. |
| navigate_to_pickup | `/driver/active-job/[bookingId]` | driver | Redesign/extension | RouteMap (existing), BottomSheet (new) | Turn-by-turn map guiding the driver to pickup, with ETA and "Arrived at Pickup" action. |
| cargo_verification_pickup | `/driver/active-job/[bookingId]` | driver | Redesign/extension | PhotoProofCapture (existing), ChecklistItem (new) | Weight-match confirmation, cargo photo capture, itemized checklist before starting trip. |
| load_manifest_bol | `/driver/active-job/[bookingId]` | driver | New (extension) | SignatureCanvas (new), Card | Bill-of-Lading manifest with cargo SKUs and a driver signature sign-off. |
| arrived_at_drop_off | `/driver/active-job/[bookingId]` | driver | Redesign/extension | AlertBanner (new), Card | Arrival-at-drop state with a demurrage/grace-period countdown warning and unloading action. |
| trip_completed_summary | `/driver/active-job/[bookingId]` (complete) | driver | New | Card | Earnings breakdown, trip summary, and rate-customer / back-to-home actions. |
| driver_registration | `/signup/driver` | driver | Redesign | DocumentUploadCard (new) | Multi-step sign-up capturing personal details and license/vehicle-photo uploads. |
| profile_settings | `/driver/profile` | driver | Redesign | DocumentExpiryCard (existing), Card | Profile header, rating/trip stats, license & RC document status, settings list. |
| certification_badge_status | `/driver/certifications` | driver (shared w/ hamali_solo) | New | CertificateCard (new), QRCodeDisplay (new) | Certificate-earned confirmation with endorsed skills and a site-verification QR code. |
| emergency_assistance_hub | `/driver/emergency` | driver (shared w/ hamali_solo) | New | SOSButton (new), Card | Hold-to-confirm SOS, accident/breakdown report shortcuts, dispatch/emergency contacts. |
| insurance_payouts | `/driver/insurance` | driver (shared w/ hamali_solo) | New | ThresholdMeter (new), Card | Parametric income-protection + accident cover with a payout-trigger threshold meter and history. |
| worker_insurance_plans | `/driver/insurance-plans` | driver (shared w/ hamali_solo) | New | Card | Overview of standard vs parametric plans, coverage limits, review-terms CTA. |
| worker_referral_dashboard | `/driver/referrals` | driver (shared w/ hamali_solo) | New | Card | Referral code, earnings stats, and a tracked list of referred drivers/hamali groups. |

## Role: hamali_solo

| Screen (folder) | Route | Role | New/Redesign | Key Components Needed | Description |
|---|---|---|---|---|---|
| hamali_home | `/hamali/dashboard` | hamali_solo | Redesign | OnlineToggle (existing), MetricCard (new) | Online status, today's earnings, completed jobs, rating, recent activity list. |
| hamali_job_offer | `/hamali/requests` (offer) | hamali_solo | Redesign/extension | Card | Compact incoming unload-only job offer with distance/duration/payout and accept/reject. |
| hamali_arrival_check_in | `/hamali/active-job/[bookingId]` | hamali_solo | Redesign/extension | RouteMap (existing) | Site-arrival screen: distance-to-site, Mutha leader contact, confirm-arrival check-in. |
| hamali_active_job | `/hamali/active-job/[bookingId]` | hamali_solo | Redesign | PhotoProofCapture (existing), ChecklistItem (new) | Active loading job: customer contact, pickup details, weight/items, proof-of-loading photo. |

## Role: mutha_leader

| Screen (folder) | Route | Role | New/Redesign | Key Components Needed | Description |
|---|---|---|---|---|---|
| mutha_leader_dashboard | `/mutha/dashboard` | mutha_leader | Redesign | AvatarStack (new), Card | Group rating, today's earnings, active-task list, team-roster availability. |
| mutha_group_dashboard | `/mutha/dashboard` | mutha_leader | Redesign (alt variant — consolidate with mutha_leader_dashboard) | MetricCard (new), Card | Member/active-job/earnings metrics, live member list, active job progress bars. |
| assign_members_to_job | `/mutha/assign-members` | mutha_leader | New | SelectableWorkerCard (new) | Worker-selection checklist to pick and notify hamalis to staff an accepted job. |
| mutha_leader_operations | `/mutha/operations` | mutha_leader | New | CrewAttendanceCard (new), Card | Payout readiness, active crew deployments, per-crew attendance (present/missing). |
| create_mutha_group | `/mutha/create-group` | mutha_leader | New | QRCodeDisplay (new), DocumentUploadCard (new) | Group-creation form (photo, name, region) with a shareable invite link/QR code. |

## Role: mutha_member

| Screen (folder) | Route | Role | New/Redesign | Key Components Needed | Description |
|---|---|---|---|---|---|
| mutha_member_home | `/mutha-member/dashboard` | mutha_member | New (route doesn't exist yet) | Card | Single-assignment home: today's warehouse job, target arrival, leader contact, "I'm Here" check-in. |
| mutha_member_home_dashboard | `/mutha-member/dashboard` | mutha_member | New (alt variant — consolidate with mutha_member_home) | MetricCard (new), Card | Current assignment + weekly personal earnings + Mutha-group info in a bento layout. |

## Role: manager

| Screen (folder) | Route | Role | New/Redesign | Key Components Needed | Description |
|---|---|---|---|---|---|
| operations_manager_hub | `/admin/operations-hub` | manager | New | AlertBanner (new), MetricCard (new) | Live incident dashboard: critical alerts (late pickups, disputes), deployment-rate pulse, task list. |
| multi_stop_route_optimizer | `/admin/route-optimizer` | manager | New | Timeline (new), RouteMap (existing) | Map + itinerary timeline for an active multi-stop route with per-stop status and reroute options. |
| regional_surge_zone_management | `/admin/surge-zones` | manager | New | HeatmapMap (new), Card | Map of active demand-surge zones, per-zone multiplier list, manual override controls. |
| fleet_management | `/admin/fleet` | manager | New | DataRow (new), StatusChip (new) | Fleet-wide operational view: active/maintenance/idle vehicles, driver assignment, status actions. |

*(Manager screens reuse the existing `admin/` route group and `SideNav`/`PermissionPicker` shell, scoped to operations-manager permissions — there is no dedicated `manager/` app directory today.)*

## Role: admin

| Screen (folder) | Route | Role | New/Redesign | Key Components Needed | Description |
|---|---|---|---|---|---|
| admin_dashboard | `/admin/dashboard` | admin | Redesign | MetricCard (new), SideNav (new) | Active-bookings/GMV/workers-online KPIs, a live fleet map, recent-activity feed. |
| admin_dashboard_overview | `/admin/dashboard` | admin | Redesign (alt variant — consolidate with admin_dashboard) | MetricCard (new) | Mobile-first overview: revenue/trips/KYC bento metrics, regional-volume list. |
| advanced_reporting_exports | `/admin/reports` | admin | New | Card | Custom report builder (data source, date range, region) with PDF/Excel export and schedules. |
| financial_transaction_ledger | `/admin/ledger` | admin | New | DataTable (new), Pagination (existing) | Paginated platform transaction ledger with revenue/fee/payout summary stats. |
| dispute_refund_resolution | `/admin/disputes` | admin | New | TicketCard (new), DataTable (new) | Split-view dispute queue: ticket list, evidence/communication log, fare-adjustment resolution. |
| payout_approvals | `/admin/payout-approvals` | admin | New | Card, Button (existing) | Queue of pending driver/Mutha payout requests with itemized breakdown and flag/approve. |
| payout_incentive_management | `/admin/incentives` | admin | Redesign (existing `/admin/incentives`) | MetricCard (new), DataRow (new) | Payout cycle dashboard: pending/processed totals, cycle-close countdown, hold/approve list. |
| kyc_verification_queue_1 | `/admin/kyc` | admin | New | QueueCounter (new), Card | Split document-viewer + applicant-detail screen to approve/reject one KYC submission. |
| kyc_verification_queue_2 | `/admin/kyc` | admin | New (alt variant — consolidate with kyc_verification_queue_1) | DataRow (new), StatusChip (new) | List view of the full KYC queue with per-row approve/view-docs actions. |
| user_management | `/admin/users` | admin | Redesign | DataRow (new), StatusChip (new) | Platform user directory with role/status metrics, search & filter, per-role user cards. |
| user_management_portal | `/admin/users` | admin | Redesign (alt variant — consolidate with user_management) | DataTable (new), StatusChip (new) | Desktop-table user management with filter chips, ratings, block/restore actions. |
| security_fraud_alerts | `/admin/fraud-alerts` | admin | New | AlertBanner (new), Card | Severity-ranked feed of suspicious-activity alerts with investigate actions. |
| system_audit_trail | `/admin/audit-log` | admin | Redesign (existing `/admin/audit-log`) | DataTable (new), DataRow (new) | Chronological, filterable security/config event log (actor, action, resource, status). |
| pricing_rules_configuration | `/admin/fares` | admin | Redesign (existing `/admin/fares`) | Card, FilterChip (new) | Per-region base-rate/per-km/min-distance config plus an industrial-zone surcharge table. |
| performance_analytics_heatmaps | `/admin/analytics` | admin | New | HeatmapMap (new), TrendChart (new) | KPI grid (revenue, trips, fleet utilization, delivery time), demand-hotspot heatmap, trend chart. |

## Role: fleet_owner

| Screen (folder) | Route | Role | New/Redesign | Key Components Needed | Description |
|---|---|---|---|---|---|
| partner_fleet_dashboard | `/fleet-owner/dashboard` | fleet_owner | New | MetricCard (new), DataRow (new) | Unit totals/active/in-shop/idle counts, live map, action-required alerts, vehicle roster. |
| fleet_maintenance_scheduler | `/fleet-owner/maintenance` | fleet_owner | New | CircularGauge (new), Timeline (new) | Fleet-health gauge, critical service-alert banner, upcoming maintenance-schedule timeline. |
| insurance_claims_portal | `/fleet-owner/insurance` | fleet_owner | New | Card, SideNav (new) | Coverage overview (auto, workers-comp, cargo transit), recent-claims list, report-incident action. |
| partner_training_academy | `/fleet-owner/training` | fleet_owner | New | Card | Mandatory training curriculum with locked/active/completed module cards and progress bar. |
| vehicle_inspection_compliance | `/fleet-owner/inspections` | fleet_owner | New | PhotoCapture4Angle (new), ChecklistItem (new) | Per-vehicle compliance record: 4-angle exterior photo grid, pass/warning inspection checklist. |
| tax_regulatory_documents | `/fleet-owner/tax-documents` | fleet_owner | New | Card | Financial-year selector with downloadable earnings statement, GST invoice archive, insurance cert. |

## Role: warehouse_hub

| Screen (folder) | Route | Role | New/Redesign | Key Components Needed | Description |
|---|---|---|---|---|---|
| warehouse_hub_dashboard | `/warehouse-hub/dashboard` | warehouse_hub | New | MetricCard (new), Card | Dock-space/hamali-group availability, incoming-loads ETA list, live gate-activity feed. |

## Role: shared

| Screen (folder) | Route | Role | New/Redesign | Key Components Needed | Description |
|---|---|---|---|---|---|
| fyro_landing_page | `/` (marketing root) | shared | Redesign (existing `(marketing)/page.tsx`) | Card | Public homepage pitching combined vehicle+labor booking with a 3-step "how it works" explainer. |
| about_fyro | `/about` | shared | Redesign (existing `(marketing)/about`) | Card, SideNav (new, desktop only) | Mission/about page: worker dignity, environmental impact, reliability stats, leadership bios. |
| faq_knowledge_base | `/faq` | shared | Redesign (existing `(marketing)/faq`) | Accordion (new), FilterChip (new) | Searchable FAQ with role-based category filters and expandable accordion answers. |
| regional_pricing_rates | `/pricing` | shared | Redesign (existing `(marketing)/pricing`) | Card | Public rate card listing per-vehicle-class and per-hamali pricing by region. |
| role_selection | `/signup` | shared | New (no signup index page exists) | Card | "Who are you?" chooser (Customer/Driver/Hamali) routing into the relevant sign-up flow. |
| language_selection | `/language` | shared | New | LanguagePill (new) | First-run language picker (English/Telugu/Hindi) shown before onboarding. |
| onboarding_walkthrough | `/onboarding` | shared | New | Card | Skippable multi-slide onboarding carousel introducing FYRO's value proposition. |
| sign_in_to_fyro | `/login` | shared | Redesign (existing `/login`) | Card | Phone + password sign-in with forgot-password and sign-up links. |
| otp_verification | `/login` (OTP step) | shared | Redesign/extension | Card | Two-step phone-number entry and OTP-code verification for authentication. |
| terms_of_service | `/terms` | shared | New | Card | Legal Terms of Service & Privacy Policy document with sectioned copy and acknowledgment action. |
| notifications | `/notifications` | shared | New | ListDivider (new), Card | Filterable notification inbox (All/Jobs/Payments/System) with read/unread state. |
| fyro_support_center | `/support` | shared | New | TicketCard (new), Card | Logged-in help hub: SOS/live-chat/call shortcuts, category tiles, recent support tickets. |
| help_support | `/support` | shared | New (near-duplicate of fyro_support_center — consolidate) | TicketCard (new), AlertBanner (new) | Alternate help-center layout: emergency-SOS banner, category bento grid, recent tickets. |

---

## New Shared Components Required

Deduped build list for the shared component library, with a short description and representative screens.

| Component | Renders | Used by (representative) |
|---|---|---|
| **TopBar** | Branded top app bar: hamburger menu, FYRO wordmark, language toggle. Distinct from the existing `BackHeader` (which is for linear/transactional back-navigation flows). | Nearly every mobile screen — `about_fyro`, `admin_dashboard`, `customer_booking`, `driver_home`, `hamali_home`, etc. |
| **SideNav** | Desktop navigation drawer (profile block + nav links) for admin/manager/fleet_owner desktop layouts. App currently has no desktop nav shell. | `admin_dashboard`, `advanced_reporting_exports`, `dispute_refund_resolution`, `financial_transaction_ledger`, `insurance_claims_portal`, `kyc_verification_queue_2`, `mutha_leader_operations`, `partner_fleet_dashboard`, `system_audit_trail`, `user_management_portal`, `fleet_management` |
| **MetricCard** | Bento-style KPI stat tile: label, icon, big number, delta/trend indicator. | `admin_dashboard`, `driver_home`, `hamali_home`, `mutha_group_dashboard`, `warehouse_hub_dashboard`, `operations_manager_hub`, `partner_fleet_dashboard`, `payout_incentive_management`, `performance_analytics_heatmaps` |
| **DataTable** | Desktop data grid with header row, sortable-looking columns, hover rows. | `financial_transaction_ledger`, `system_audit_trail`, `user_management_portal`, `dispute_refund_resolution` |
| **DataRow** | Single list-row pattern: leading icon/avatar, title + subtitle, trailing value/status/action — used inside lists and mobile-card variants of tables. | `fleet_management`, `kyc_verification_queue_2`, `user_management`, `payout_incentive_management`, `partner_fleet_dashboard` |
| **BottomSheet** | Draggable bottom sheet container with a drag-handle, used over a map or as a persistent action zone. | `customer_booking`, `pickup_location_picker`, `drop_location_picker`, `live_tracking_1`, `live_tracking_2`, `navigate_to_pickup` |
| **CountdownRing** | SVG circular countdown timer (progress-track ring) for time-boxed accept/decline decisions. | `driver_job_offer`, `driver_incoming_job_offer` |
| **StatusStepper** | Horizontal multi-step progress stepper (e.g. Accepted → Arriving → Loading → In Transit → Delivered). | `live_tracking_1` |
| **SignatureCanvas** | Touch/mouse signature capture pad for sign-off confirmations. | `load_manifest_bol` |
| **QRCodeDisplay** | Rendered QR code block with a caption, for verification or invite flows. | `certification_badge_status`, `create_mutha_group` |
| **PhotoCapture4Angle** | 4-tile exterior photo capture grid (front/rear/driver/passenger side). | `vehicle_inspection_compliance`, `driver_registration` |
| **ThresholdMeter** | Progress bar with a labeled trigger-threshold marker (e.g. parametric insurance payout trigger). | `insurance_payouts` |
| **HeatmapMap** | Map overlay showing density clusters/heatmap zones with legend. | `regional_surge_zone_management`, `performance_analytics_heatmaps` |
| **MapPinPicker** | Center-pin, drag-to-select map picker with a floating search bar (extends existing `RouteMap`). | `pickup_location_picker`, `drop_location_picker` |
| **AvatarStack** | Overlapping avatar group (team/crew photo stack). | `mutha_leader_dashboard` |
| **EmptyState** | Centered icon + message + action(s) for zero-result/dead-end states. | `no_drivers_available` |
| **Skeleton** | Loading placeholder blocks for async list/data screens. (No direct Stitch mockup shows this state; included for build-readiness across all data-heavy screens.) | All `DataTable`/`DataRow`/`MetricCard` consumers |
| **ListDivider** | Thin low-contrast horizontal divider between list rows. | `notifications`, `faq_knowledge_base`, `about_fyro` |
| **LanguagePill** | Selectable language card/toggle (radio-style) for EN/Telugu/Hindi. | `language_selection` |
| **FilterChip** | Pill-style selectable filter/category chip, single or multi-select group. | `available_loads`, `faq_knowledge_base`, `cargo_details`, `pricing_rules_configuration`, `user_management_portal` |
| **Accordion** | Expandable question/answer (or generic) list item with chevron toggle. | `faq_knowledge_base` |
| **ChecklistItem** | Checkbox list row with label + metadata (weight, qty, fragile flag). | `cargo_verification_pickup`, `vehicle_inspection_compliance`, `hamali_active_job` |
| **SelectableWorkerCard** | Worker card with avatar, rating, availability dot, and a checkbox selection state. | `assign_members_to_job` |
| **DocumentUploadCard** | Upload tile for a compliance document (license/RC/photo) showing pending/verified/expiring badge. | `driver_registration`, `cargo_details`, `create_mutha_group`, `profile_settings` |
| **AlertBanner** | Inline warning/critical banner strip with icon, headline, and optional action. | `arrived_at_drop_off`, `fleet_maintenance_scheduler`, `operations_manager_hub`, `security_fraud_alerts`, `help_support` |
| **TicketCard** | Support/dispute ticket summary card (ID, status pill, snippet, timestamp). | `dispute_refund_resolution`, `fyro_support_center`, `help_support` |
| **Timeline** | Vertical/chronological event or stop-by-stop timeline. | `multi_stop_route_optimizer`, `fleet_maintenance_scheduler`, `system_audit_trail` |
| **CircularGauge** | Circular percentage gauge (e.g. fleet health score). | `fleet_maintenance_scheduler` |
| **TrendChart** | Simple line/area trend chart placeholder for a metric over time. | `performance_analytics_heatmaps` |
| **CrewAttendanceCard** | Crew/deployment card showing present vs. missing headcount. | `mutha_leader_operations` |
| **CertificateCard** | Paper-textured certificate/credential card with skills list and seal. | `certification_badge_status` |
| **StatusChip** | Colored multi-tone status pill (Settled/Pending/Under Review/Active/Suspended) — distinct from the existing binary `Badge`/`StatusPill`. | `customer_job_history`, `vehicle_selection`, `fleet_management`, `user_management`, `kyc_verification_queue_2`, `payout_incentive_management` |
| **QueueCounter** | "N remaining" queue-status badge/counter. | `kyc_verification_queue_1` |
| **SOSButton** | Hold-to-confirm emergency SOS control with press-and-hold timing. | `emergency_assistance_hub`, `fyro_support_center`, `help_support` |

## New Route Groups Required

| Route group | Role(s) | Screens |
|---|---|---|
| `fleet-owner/` | fleet_owner | `partner_fleet_dashboard` → dashboard, `fleet_maintenance_scheduler` → maintenance, `insurance_claims_portal` → insurance, `partner_training_academy` → training, `vehicle_inspection_compliance` → inspections, `tax_regulatory_documents` → tax-documents |
| `warehouse-hub/` | warehouse_hub | `warehouse_hub_dashboard` → dashboard |

No other new top-level route groups are required: `manager` screens are placed under the existing `admin/` group (scoped by `PermissionPicker`), `mutha_member` screens fill in the currently-empty `/mutha-member/dashboard` route inside the existing `mutha-member/` group, and all `shared` screens map to existing `(marketing)/`, `login/`, or new top-level pages (`/signup`, `/language`, `/onboarding`, `/terms`, `/notifications`, `/support`) that sit outside any role-scoped group.

## Summary

- **Screens cataloged:** 83 (of 85 folders; `logo/` and `premium_industrial_marketplace/` excluded as non-screens)
- **New shared components identified:** 32
- **New top-level route groups:** 2 (`fleet-owner/`, `warehouse-hub/`)
