export type Role =
  | 'customer'
  | 'driver'
  | 'hamali_solo'
  | 'mutha_leader'
  | 'mutha_member'
  | 'manager'
  | 'admin';

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
