export type Role =
  | 'customer'
  | 'driver'
  | 'hamali_solo'
  | 'mutha_leader'
  | 'mutha_member'
  | 'manager'
  | 'admin'
  | 'fleet_owner'
  | 'warehouse_hub'
  // SIH26089 Phase B — the cooperative federation hierarchy. A district
  // federation admin oversees every Society (Mutha) affiliated to it; a
  // state federation admin oversees every district federation in its
  // state. Both are platform-created accounts (same pattern as `manager`
  // — no self-signup), scoped read/aggregate access to their own subtree
  // only, never write access into a society's own day-to-day operations
  // (that stays leader-controlled, same separation `manager` already
  // respects toward `admin`-only actions).
  | 'federation_state_admin'
  | 'federation_district_admin';

// Roles a single phone number can hold concurrently (role switcher —
// User.roles[] carries every role granted; User.role stays the *active*
// one a session is currently operating as, kept for backward compat with
// existing role === checks throughout the codebase).
export type RoleSet = Role[];

export type AccountStatus = 'active' | 'suspended' | 'deleted';
export type KycStatus = 'pending' | 'verified' | 'rejected';
export type AvailabilityStatus = 'online' | 'offline' | 'on_job';

// Indian document types only — see AUDIT_REPORT.md Section D item 1 (no
// upload path existed at all before this). One User.kycDocs entry per type;
// a role only needs the subset REQUIRED_KYC_DOCS_BY_ROLE lists for it.
export type KycDocumentType =
  | 'driving_licence'
  | 'vehicle_rc'
  | 'fastag'
  | 'goods_carriage_permit'
  | 'puc'
  | 'vehicle_fitness'
  | 'aadhaar'
  | 'pan'
  | 'gstin';

export type KycDocumentStatus = 'under_review' | 'verified' | 'rejected';

// Which document types are required before availability.controller.ts's
// KYC gate (Phase 1.3) considers a worker verified. customer/manager/admin
// are deliberately absent — they never need KYC documents, so the gate
// (which only ever checks driver/hamali_solo/mutha_member) never consults
// this for them either; listed here anyway so every Role has an explicit,
// reviewable answer rather than an implicit "falls through to empty".
export const REQUIRED_KYC_DOCS_BY_ROLE: Record<Role, KycDocumentType[]> = {
  customer: [],
  driver: ['driving_licence', 'vehicle_rc', 'fastag', 'puc', 'vehicle_fitness', 'aadhaar', 'pan'],
  hamali_solo: ['aadhaar', 'pan'],
  mutha_leader: ['aadhaar', 'pan'],
  mutha_member: ['aadhaar', 'pan'],
  fleet_owner: ['gstin', 'pan', 'aadhaar'],
  warehouse_hub: ['gstin', 'pan', 'aadhaar'],
  manager: [],
  admin: [],
  federation_state_admin: [],
  federation_district_admin: [],
};

export const MANAGER_PERMISSIONS = [
  'verify_kyc',
  'resolve_complaints',
  'edit_fare_rules',
  'view_analytics',
] as const;
export type ManagerBasePermission = (typeof MANAGER_PERMISSIONS)[number];
// Managers can additionally hold `manage_region:<regionName>` strings.
export type ManagerPermission = ManagerBasePermission | `manage_region:${string}`;

export type AppLocale = 'en' | 'te' | 'hi';

export interface JwtAccessPayload {
  id: string;
  role: Role;
  // Phase 2 (server-side i18n) — embedded at sign time so every request
  // knows the caller's language without a DB round-trip on every error
  // path (same reasoning `role` is already embedded, not re-fetched).
  // Optional so a token signed before this field existed still verifies;
  // every reader treats a missing value as 'en'. Refreshes automatically
  // within 15 minutes (the access token TTL) or on next login/refresh
  // after a User.preferredLocale change — same staleness window `role`
  // already has.
  locale?: AppLocale;
}

export interface JwtRefreshPayload {
  id: string;
  tokenVersion: number;
}
