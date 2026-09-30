import { GovernmentWageFloor } from '../models/GovernmentWageFloor';
import { Notification } from '../models/Notification';
import { User } from '../models/User';
import { createNotification } from './notification.service';

export const WAGE_FLOORS_ADMIN_LINK = '/admin/wage-floors';

/** States whose active wage-floor notification has passed its end date. */
export async function staleFloorStates(at: Date = new Date()): Promise<string[]> {
  const rows = await GovernmentWageFloor.find({ active: true, effectiveUntil: { $lt: at } }).select('state').lean();
  return [...new Set(rows.map((r) => r.state))].sort();
}

/**
 * Tells every admin, at most once per day, that a wage floor has lapsed.
 *
 * A lapsed notification keeps being enforced (see wageFloorFor), so nothing
 * breaks — which is exactly why it needs a nudge: it would otherwise stay
 * stale indefinitely. One notification per admin per calendar day (IST),
 * however many times this runs.
 */
export async function notifyAdminsOfStaleFloors(at: Date = new Date()): Promise<number> {
  const states = await staleFloorStates(at);
  if (states.length === 0) return 0;

  // Start of today in India (UTC+5:30), the day the admins live in.
  const ist = new Date(at.getTime() + 330 * 60_000);
  const startOfDay = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - 330 * 60_000);

  const admins = await User.find({ role: 'admin' }).select('_id').lean();
  let sent = 0;
  for (const admin of admins) {
    const already = await Notification.exists({
      userId: admin._id,
      type: 'system_alert',
      link: WAGE_FLOORS_ADMIN_LINK,
      createdAt: { $gte: startOfDay },
    });
    if (already) continue;
    await createNotification(admin._id.toString(), 'system_alert', { kind: 'wage_floor_stale', states: states.join(', ') }, WAGE_FLOORS_ADMIN_LINK);
    sent += 1;
  }
  return sent;
}

let handle: ReturnType<typeof setInterval> | null = null;

/** Checks at boot and every six hours; the once-a-day rule lives in the check itself. */
export function startWageFloorAlertRunner(): void {
  if (handle) return;
  const run = () =>
    notifyAdminsOfStaleFloors().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('wage-floor stale check failed:', err);
    });
  void run();
  handle = setInterval(run, 6 * 3600_000);
  handle.unref?.();
}
