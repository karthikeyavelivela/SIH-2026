import { Types, HydratedDocument } from 'mongoose';
import type { Role } from '@fyro/shared';
import { env } from '../config/env';
import { Booking, IBooking } from '../models/Booking';
import { InsurancePolicy } from '../models/InsurancePolicy';
import { ParametricTrigger, IParametricTrigger } from '../models/ParametricTrigger';
import { Payout } from '../models/Payout';
import { writeLedgerEntry } from './ledger.service';
import { writeAuditLog } from './audit.service';

const MS_PER_DAY = 86_400_000;

// AUDIT_REPORT.md Phase 1.4 caps. Named constants, same convention as
// matching.service.ts's DRIVER_WILLING_RADIUS_KM/HAMALI_WILLING_RADIUS_KM —
// no admin-configurable-caps UI exists yet (would need its own model +
// admin screen, out of scope for this phase; flagged in the phase report).
export const MAX_PARAMETRIC_PAYOUT_PER_WORKER_PER_PERIOD = 10_000; // ₹10,000
export const MAX_PARAMETRIC_PAYOUT_GLOBAL_PER_DAY = 500_000; // ₹5,00,000

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Bounded retry with backoff for the disbursement write. This runs inline
 * inside a request handler (GET /api/insurance/me — see
 * checkParametricTriggers's doc comment on why), so "retry with backoff"
 * here means short, HTTP-response-friendly delays (100ms/300ms), not a
 * background job's minutes-long backoff — the realistic failure mode for a
 * same-process Mongo write is a transient blip, not a slow external API.
 */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3, delaysMs = [100, 300]): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < delaysMs.length) await sleep(delaysMs[i]);
    }
  }
  throw lastErr;
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
  payoutId?: string;
  payoutFailureReason?: string;
  /** True when this result came from an already-recorded event for the current period (no new check/payout was made this call). */
  fromExistingEvent: boolean;
}

interface DisbursementOutcome {
  payoutId: Types.ObjectId;
  paidAt?: Date;
  failureReason?: string;
}

/**
 * Actually moves money for one fired trigger — the piece that was entirely
 * missing before AUDIT_REPORT.md's Phase 1.4 (a trigger firing previously
 * only flipped a boolean on its own sub-document). Always creates a real
 * Payout record first (so nothing is ever silently dropped, even on total
 * failure below), then tries to finalize it as paid:
 *
 * 1. Kill switch (env.PARAMETRIC_PAYOUTS_ENABLED) — off means every
 *    disbursement platform-wide is left 'pending' for a human, no
 *    exceptions, checked before anything else.
 * 2. Per-worker-per-period cap — sums this worker's own already-'paid'
 *    parametric payouts since this trigger's periodStart.
 * 3. Global daily cap — sums every worker's already-'paid' parametric
 *    payouts since midnight. This is what "halts the engine" — once
 *    breached, every subsequent trigger firing anywhere on the platform
 *    today falls back to 'pending' until the next calendar day, with no
 *    separate flag needed since the check re-evaluates the real sum each
 *    time it runs.
 * 4. Only past all three: attempt the real disbursement (writeLedgerEntry,
 *    then flip the Payout to 'paid') with retry/backoff. A failure after
 *    retries leaves the already-created Payout at 'pending' — the human
 *    queue — with the reason recorded.
 */
async function disburseParametricPayout(
  trigger: HydratedDocument<IParametricTrigger>,
  userId: string,
  role: Role,
  periodStart: Date,
  at: Date
): Promise<DisbursementOutcome> {
  const payout = await Payout.create({
    userId,
    amount: trigger.payoutAmount,
    period: periodStart.toISOString().slice(0, 10),
    status: 'pending',
    breakdown: { condition: trigger.condition, thresholdValue: trigger.thresholdValue, actualValue: undefined },
    source: 'parametric_insurance',
    sourceRefId: trigger._id,
  });

  async function leaveForHumanReview(reason: string): Promise<DisbursementOutcome> {
    await writeAuditLog({
      actorId: userId,
      actorRole: role,
      action: 'parametric_payout_escalated',
      targetType: 'Payout',
      targetId: payout._id.toString(),
      details: { reason, triggerId: trigger._id.toString(), amount: trigger.payoutAmount },
    });
    return { payoutId: payout._id, failureReason: reason };
  }

  if (!env.PARAMETRIC_PAYOUTS_ENABLED) {
    return leaveForHumanReview('Automatic parametric payouts are currently disabled platform-wide (kill switch).');
  }

  const [workerPeriodTotal, globalDayTotal] = await Promise.all([
    Payout.aggregate([
      {
        $match: {
          userId: new Types.ObjectId(userId),
          source: 'parametric_insurance',
          status: 'paid',
          createdAt: { $gte: periodStart },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]).then((r) => r[0]?.total ?? 0),
    Payout.aggregate([
      {
        $match: {
          source: 'parametric_insurance',
          status: 'paid',
          createdAt: { $gte: new Date(new Date(at).setHours(0, 0, 0, 0)) },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]).then((r) => r[0]?.total ?? 0),
  ]);

  if (workerPeriodTotal + trigger.payoutAmount > MAX_PARAMETRIC_PAYOUT_PER_WORKER_PER_PERIOD) {
    return leaveForHumanReview(
      `Per-worker parametric payout cap (₹${MAX_PARAMETRIC_PAYOUT_PER_WORKER_PER_PERIOD} per period) would be exceeded.`
    );
  }
  if (globalDayTotal + trigger.payoutAmount > MAX_PARAMETRIC_PAYOUT_GLOBAL_PER_DAY) {
    return leaveForHumanReview(
      `Platform-wide daily parametric payout cap (₹${MAX_PARAMETRIC_PAYOUT_GLOBAL_PER_DAY}) would be exceeded.`
    );
  }

  try {
    await withRetry(async () => {
      await writeLedgerEntry({
        type: 'payout',
        entityType: 'Payout',
        entityId: payout._id.toString(),
        amount: -Math.abs(trigger.payoutAmount),
        description: `Automatic parametric insurance payout — ${trigger.condition} (trigger ${trigger._id})`,
        status: 'posted',
      });
      payout.status = 'paid';
      payout.decidedAt = at;
      await payout.save();
    });
  } catch (err) {
    return leaveForHumanReview(
      `Automatic disbursement failed after retries: ${err instanceof Error ? err.message : 'unknown error'}`
    );
  }

  await writeAuditLog({
    actorId: userId,
    actorRole: role,
    action: 'parametric_payout_auto_paid',
    targetType: 'Payout',
    targetId: payout._id.toString(),
    details: { triggerId: trigger._id.toString(), amount: trigger.payoutAmount, automated: true },
  });

  return { payoutId: payout._id, paidAt: at };
}

/**
 * Evaluates (and, if genuinely due, resolves) one ParametricTrigger for the
 * given worker. Idempotent: if an event already exists for the current
 * epoch-aligned period bucket (see periodIndexFor), that stored event is
 * returned as-is and NO new check or disbursement happens — this is what
 * makes the function safe to call on every dashboard poll and from an admin
 * batch run without ever double-paying the same period. The disbursement
 * block below only ever runs inside this "no existing event" branch, which
 * is the entire idempotency guarantee — proven in
 * tests/parametricInsurance.test.ts by calling this twice back to back and
 * asserting only one Payout ever exists.
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
      payoutId: existing.payoutId?.toString(),
      payoutFailureReason: existing.payoutFailureReason,
      fromExistingEvent: true,
    };
  }

  const periodStart = new Date(at.getTime() - trigger.periodDays * MS_PER_DAY);
  const actualValue =
    trigger.condition === 'earnings_below_threshold'
      ? await computeTrailingEarnings(userId, role, trigger.periodDays, at)
      : 0; // days_unable_to_work — no real data source yet, see doc comment above

  const triggered = trigger.condition === 'earnings_below_threshold' && actualValue < trigger.thresholdValue;

  let disbursement: DisbursementOutcome | undefined;
  if (triggered) {
    disbursement = await disburseParametricPayout(trigger, userId, role, periodStart, at);
  }

  trigger.events.push({
    checkedAt: at,
    periodIndex,
    periodStart,
    periodEnd: at,
    actualValue,
    triggered,
    paidAt: disbursement?.paidAt,
    payoutId: disbursement?.payoutId,
    payoutFailureReason: disbursement?.failureReason,
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
    paidAt: disbursement?.paidAt,
    payoutId: disbursement?.payoutId.toString(),
    payoutFailureReason: disbursement?.failureReason,
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
