// Single source of truth for "where does this role land after auth" —
// used by /login and every signup page so a role's home never drifts out
// of sync between them.
import { workerBaseFor, type WorkerKind } from './workerArea';

// A solo worker's home depends on their kind as well as their role — a
// plumber and a loader share the dispatch role but not a dashboard.
export function roleHome(role: string, workerKind?: WorkerKind | null): string {
  switch (role) {
    case 'customer':
      return '/customer/dashboard';
    case 'driver':
      return '/driver/dashboard';
    case 'hamali_solo':
      return `${workerBaseFor(workerKind)}/dashboard`;
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
