import type { Role } from '@fyro/shared';
import { Booking } from '../models/Booking';
import { User } from '../models/User';
import { Payout, IPayout } from '../models/Payout';
import { computeTrailingEarnings } from './parametricInsurance.service';

const MS_PER_DAY = 86_400_000;

/**
 * AUDIT_REPORT.md Phase 1.5 — the missing producer for the payout-approval
 * queue. Before this, `payout.controller.ts`'s approve/reject/mark-paid
 * endpoints were real and correctly wired, but nothing anywhere ever called
 * `Payout.create` for a regular earnings cycle, so the admin queue was
 * structurally unreachable (confirmed empty live on production —
 * AUDIT_REPORT.md Section D item 4).
 *
 * Admin-triggered (POST /api/admin/payouts/generate), not a real cron —
 * same documented trade-off already established by
 * parametricInsurance.service.ts's runParametricCheckForAllPolicies and its
 * own doc comment ("the manual/future-scheduler entry point"). A real
 * scheduler is infrastructure this app doesn't have; this keeps the same
 * shape rather than inventing a different pattern for one feature.
 *
 * Idempotent per (userId, period): if a driver/hamali_solo/mutha_member
 * already has a non-rejected earnings Payout for this exact period string,
 * running generation again does not create a second one — running it twice
 * a day, or twice a month by mistake, never double-queues the same worker's
 * same period for approval.
 */
export interface PayoutGenerationResult {
  created: number;
  skippedAlreadyExists: number;
  skippedZeroEarnings: number;
  totalAmount: number;
}

function periodStringFor(at: Date): string {
  // YYYY-MM — monthly earnings cycle, distinct from parametric insurance's
  // own day-granular period string (see ParametricTrigger's periodStart).
  return at.toISOString().slice(0, 7);
}

/**
 * Every user id that appears as an assignedDriverId or assignedHamaliId on
 * at least one completed booking within the trailing window — the
 * candidate pool for this run. A worker who did no jobs this period is
 * correctly never considered (nothing to pay), rather than iterating every
 * driver/hamali_solo/mutha_member account on the platform.
 */
async function candidateWorkerIds(since: Date, at: Date): Promise<{ userId: string; role: Role }[]> {
  const bookings = await Booking.find({ status: 'completed' })
    .select('assignedDriverIds assignedHamaliIds statusHistory')
    .lean();

  const inWindow = bookings.filter((b) => {
    const completedAt = b.statusHistory.find((h) => h.status === 'completed')?.timestamp;
    return completedAt && new Date(completedAt) >= since && new Date(completedAt) <= at;
  });

  const driverIds = new Set<string>();
  const hamaliIds = new Set<string>();
  for (const b of inWindow) {
    for (const id of b.assignedDriverIds) driverIds.add(id.toString());
    for (const id of b.assignedHamaliIds) hamaliIds.add(id.toString());
  }

  const allIds = [...new Set([...driverIds, ...hamaliIds])];
  const users = await User.find({ _id: { $in: allIds } }).select('role').lean();

  return users
    .filter((u) => u.role === 'driver' || u.role === 'hamali_solo' || u.role === 'mutha_member')
    .map((u) => ({ userId: u._id.toString(), role: u.role as Role }));
}

export async function generateEarningsPayouts(
  periodDays = 30,
  at: Date = new Date()
): Promise<PayoutGenerationResult> {
  const since = new Date(at.getTime() - periodDays * MS_PER_DAY);
  const period = periodStringFor(at);
  const candidates = await candidateWorkerIds(since, at);

  const result: PayoutGenerationResult = { created: 0, skippedAlreadyExists: 0, skippedZeroEarnings: 0, totalAmount: 0 };

  for (const { userId, role } of candidates) {
    const existing = await Payout.findOne({
      userId,
      source: 'earnings',
      period,
      status: { $ne: 'rejected' },
    });
    if (existing) {
      result.skippedAlreadyExists++;
      continue;
    }

    const amount = await computeTrailingEarnings(userId, role, periodDays, at);
    if (amount <= 0) {
      result.skippedZeroEarnings++;
      continue;
    }

    const payout: IPayout = await Payout.create({
      userId,
      amount,
      period,
      status: 'pending',
      // Admin payouts page renders breakdown as a "label: ₹value" list
      // (Record<string, number>) — kept numeric-only for that reason, role
      // is already shown separately via the populated userId.role.
      breakdown: { trailingEarnings: amount, periodDays },
      source: 'earnings',
    });
    result.created++;
    result.totalAmount += payout.amount;
  }

  return result;
}
