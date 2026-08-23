// Single source of truth for "where does this role land after auth" —
// used by /login and every signup page so a role's home never drifts out
// of sync between them.
export function roleHome(role: string): string {
  switch (role) {
    case 'customer':
      return '/customer/dashboard';
    case 'driver':
      return '/driver/dashboard';
    case 'hamali_solo':
      return '/hamali/dashboard';
    case 'mutha_leader':
      return '/mutha/dashboard';
    case 'mutha_member':
      return '/mutha-member/job';
    case 'manager':
    case 'admin':
      return '/admin/dashboard';
    case 'fleet_owner':
      return '/fleet-owner/dashboard';
    case 'warehouse_hub':
      return '/warehouse-hub/dashboard';
    case 'federation_state_admin':
      return '/federation-state/dashboard';
    case 'federation_district_admin':
      return '/federation-district/dashboard';
    default:
      return '/';
  }
}
