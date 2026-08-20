import { Types, HydratedDocument } from 'mongoose';
import type { Role } from '@fyro/shared';
import { Booking, IBooking } from '../models/Booking';
import { InsurancePolicy } from '../models/InsurancePolicy';
import { ParametricTrigger, IParametricTrigger } from '../models/ParametricTrigger';

const MS_PER_DAY = 86_400_000;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Same per-side fare-attribution math as earnings.controller.ts's
 * vehicleShare/hamaliPoolShare/perHamaliShare (see that file's doc comment
 * for the full reasoning on scaling pre-surge components by the post-surge
 * total). Duplicated rather than imported: earnings.controller.ts doesn't
 * export these helpers and is owned by a concurrent task, so this module
 * keeps its own copy — if the fare-share formula ever changes, update both.
 */
function vehicleShare(booking: IBooking): number {
  const { baseFare, distanceFare, hamaliFare, total } = booking.fareBreakdown;
  const preSurgeSubtotal = baseFare + distanceFare + hamaliFare;
  if (preSurgeSubtotal <= 0) return 0;
  return ((baseFare + distanceFare) * total) / preSurgeSubtotal;
}

function hamaliPoolShare(booking: IBooking): number {
  const { baseFare, distanceFare, hamaliFare, total } = booking.fareBreakdown;
  const preSurgeSubtotal = baseFare + distanceFare + hamaliFare;
  if (preSurgeSubtotal <= 0) return 0;
  return (hamaliFare * total) / preSurgeSubtotal;
}

function perHamaliShare(booking: IBooking): number {
  const count = booking.assignedHamaliIds.length;
  if (count === 0) return 0;
  return hamaliPoolShare(booking) / count;
}

function statusHistoryCompletedAt(booking: IBooking): Date | undefined {
  return booking.statusHistory.find((h) => h.status === 'completed')?.timestamp;
}

/**
 * Real trailing-`periodDays` earnings for one worker, computed from actual
 * completed Booking records (not fabricated) — the same fare-share formula
 * the /api/earnings/me endpoint uses, restricted to bookings whose
 * 'completed' statusHistory timestamp falls inside [since, at]. Only the
 * three worker roles that can hold a parametric plan are handled; any other
 * role returns 0 (also documented at the ParametricTrigger call site).
 */
export async function computeTrailingEarnings(
  userId: string,
  role: Role,
  periodDays: number,
  at: Date = new Date()
): Promise<number> {
  const since = new Date(at.getTime() - periodDays * MS_PER_DAY);

  if (role === 'driver') {
    const bookings = await Booking.find({ status: 'completed', assignedDriverIds: userId });
    const inWindow = bookings.filter((b) => {
      const completedAt = statusHistoryCompletedAt(b);
      return completedAt && completedAt >= since && completedAt <= at;
    });
    return round2(inWindow.reduce((sum, b) => sum + vehicleShare(b), 0));
  }

  if (role === 'hamali_solo' || role === 'mutha_member') {
    const bookings = await Booking.find({ status: 'completed', assignedHamaliIds: userId });
    const inWindow = bookings.filter((b) => {
      const completedAt = statusHistoryCompletedAt(b);
      return completedAt && completedAt >= since && completedAt <= at;
    });
    return round2(inWindow.reduce((sum, b) => sum + perHamaliShare(b), 0));
  }

  return 0;
}

/** Epoch-aligned period bucket — see ParametricTrigger.ts's doc comment on IParametricTriggerEvent. */
function periodIndexFor(periodDays: number, at: Date): number {
  return Math.floor(at.getTime() / (periodDays * MS_PER_DAY));
}

export interface ParametricCheckResult {
  triggerId: string;
  policyId: string;
  condition: string;
  thresholdValue: number;
  periodDays: number;
  payoutAmount: number;
  actualValue: number;
  triggered: boolean;
  periodStart: Date;
  periodEnd: Date;
  paidAt?: Date;
  /** True when this result came from an already-recorded event for the current period (no new check/payout was made this call). */
  fromExistingEvent: boolean;
}

/**
 * Evaluates (and, if genuinely due, resolves) one ParametricTrigger for the
 * given worker. Idempotent: if an event already exists for the current
 * epoch-aligned period bucket (see periodIndexFor), that stored event is
 * returned as-is and NO new check or payout happens — this is what makes
 * the function safe to call on every dashboard poll and from an admin batch
 * run without ever double-paying the same period.
 *
 * `condition: 'days_unable_to_work'` has no real backing data source in
 * this codebase yet (no attendance/incident-days model exists) — rather
 * than fabricate a number, triggers with this condition are evaluated as
 * actualValue: 0, triggered: false, with that documented here and echoed in
 * the persisted event so it's visibly "not evaluated", not "evaluated as
 * fine". Only `earnings_below_threshold` is ever backed by a real payout.
 */
export async function checkParametricTrigger(
  trigger: HydratedDocument<IParametricTrigger>,
  userId: string,
  role: Role,
  at: Date = new Date()
): Promise<ParametricCheckResult> {
  const periodIndex = periodIndexFor(trigger.periodDays, at);
  const existing = trigger.events.find((e) => e.periodIndex === periodIndex);

  if (existing) {
    return {
      triggerId: trigger._id.toString(),
      policyId: trigger.policyId.toString(),
      condition: trigger.condition,
      thresholdValue: trigger.thresholdValue,
      periodDays: trigger.periodDays,
      payoutAmount: trigger.payoutAmount,
      actualValue: existing.actualValue,
      triggered: existing.triggered,
      periodStart: existing.periodStart,
      periodEnd: existing.periodEnd,
      paidAt: existing.paidAt,
      fromExistingEvent: true,
    };
  }

  const periodStart = new Date(at.getTime() - trigger.periodDays * MS_PER_DAY);
  const actualValue =
    trigger.condition === 'earnings_below_threshold'
      ? await computeTrailingEarnings(userId, role, trigger.periodDays, at)
      : 0; // days_unable_to_work — no real data source yet, see doc comment above

  const triggered = trigger.condition === 'earnings_below_threshold' && actualValue < trigger.thresholdValue;
  const paidAt = triggered ? at : undefined;

  trigger.events.push({
    checkedAt: at,
    periodIndex,
    periodStart,
    periodEnd: at,
    actualValue,
    triggered,
    paidAt,
  });
  await trigger.save();

  return {
    triggerId: trigger._id.toString(),
    policyId: trigger.policyId.toString(),
    condition: trigger.condition,
    thresholdValue: trigger.thresholdValue,
    periodDays: trigger.periodDays,
    payoutAmount: trigger.payoutAmount,
    actualValue,
    triggered,
    periodStart,
    periodEnd: at,
    paidAt,
    fromExistingEvent: false,
  };
}

/**
 * All active parametric triggers belonging to the given worker's own active
 * policies. Called by GET /api/insurance/me — every dashboard load both
 * reports current parametric status AND (via checkParametricTrigger's
 * idempotent behavior above) fires the payout the moment a period is
 * genuinely due, without ever re-firing one already recorded. This is the
 * documented trade-off requested in place of wiring an actual cron job.
 */
export async function checkParametricTriggers(userId: string, role: Role): Promise<ParametricCheckResult[]> {
  const policies = await InsurancePolicy.find({ userId, status: 'active' }).select('_id').lean();
  if (policies.length === 0) return [];

  const triggers = await ParametricTrigger.find({
    policyId: { $in: policies.map((p) => p._id) },
    active: true,
  });

  const results: ParametricCheckResult[] = [];
  for (const trigger of triggers) {
    results.push(await checkParametricTrigger(trigger, userId, role));
  }
  return results;
}

/**
 * Admin-triggered batch run across every active parametric trigger on the
 * platform, regardless of owner — the manual/future-scheduler entry point
 * (POST /api/admin/insurance/parametric/run-check). Resolves each policy's
 * owning user + role once, then reuses the same idempotent per-trigger
 * check as the worker-facing path.
 */
export async function runParametricCheckForAllPolicies(at: Date = new Date()): Promise<ParametricCheckResult[]> {
  const triggers = await ParametricTrigger.find({ active: true }).populate('policyId', 'userId status');

  const results: ParametricCheckResult[] = [];
  for (const trigger of triggers) {
    const policy = trigger.policyId as unknown as { userId: Types.ObjectId; status: string } | null;
    if (!policy || policy.status !== 'active') continue;

    const { User } = await import('../models/User');
    const user = await User.findById(policy.userId).select('role').lean();
    if (!user) continue;

    results.push(await checkParametricTrigger(trigger, policy.userId.toString(), user.role, at));
  }
  return results;
}
