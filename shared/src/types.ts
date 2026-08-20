export type Role =
  | 'customer'
  | 'driver'
  | 'hamali_solo'
  | 'mutha_leader'
  | 'mutha_member'
  | 'manager'
  | 'admin'
  | 'fleet_owner'
  | 'warehouse_hub';

// Roles a single phone number can hold concurrently (role switcher —
// User.roles[] carries every role granted; User.role stays the *active*
// one a session is currently operating as, kept for backward compat with
// existing role === checks throughout the codebase).
export type RoleSet = Role[];

export type AccountStatus = 'active' | 'suspended' | 'deleted';
export type KycStatus = 'pending' | 'verified' | 'rejected';
export type AvailabilityStatus = 'online' | 'offline' | 'on_job';

export const MANAGER_PERMISSIONS = [
  'verify_kyc',
  'resolve_complaints',
  'edit_fare_rules',
  'view_analytics',
] as const;
export type ManagerBasePermission = (typeof MANAGER_PERMISSIONS)[number];
// Managers can additionally hold `manage_region:<regionName>` strings.
export type ManagerPermission = ManagerBasePermission | `manage_region:${string}`;

export interface JwtAccessPayload {
  id: string;
  role: Role;
}

export interface JwtRefreshPayload {
  id: string;
  tokenVersion: number;
}
