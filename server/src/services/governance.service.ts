import { Types } from 'mongoose';
import { IBooking } from '../models/Booking';
import { Mutha } from '../models/Mutha';
import { MemberShare } from '../models/MemberShare';
import { CommissionRecord } from '../models/CommissionRecord';
import { SurplusDistribution } from '../models/SurplusDistribution';
import { writeLedgerEntry } from './ledger.service';

// SIH26089 Phase B.2 — cooperative governance money math. Every function
// here is pure/read-only except recordSocietyDeductionsForBooking (the one
// real write, called exactly once per completed Society-assigned booking)
// and distributeSurplus (the one real write for a surplus payout run).

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Same per-side fare-attribution math as earnings.controller.ts's
 * hamaliPoolShare/perHamaliShare and parametricInsurance.service.ts's
 * duplicate of the same — kept as its own copy here rather than a shared
 * import for the same reason those two already document (each module owns
 * its own copy; if the formula changes, update all call sites) — this is
 * now the third, so a future change should grep for all three rather than
 * assume there are only two.
 */
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

export interface DeductionResult {
  grossAmount: number;
  commissionAmount: number;
  welfareAmount: number;
  netAmount: number;
}

/** Pure — applies a Society's bye-law rates to one gross share. Both rates default to 0, so an unconfigured/unaffiliated Society deducts nothing (net === gross), byte-for-byte the same as every pre-Phase-B booking. */
export function applyDeduction(
  grossAmount: number,
  commissionRatePct: number,
  welfareDeductionRatePct: number
): DeductionResult {
  const commissionAmount = round2((grossAmount * commissionRatePct) / 100);
  const welfareAmount = round2((grossAmount * welfareDeductionRatePct) / 100);
  const netAmount = round2(grossAmount - commissionAmount - welfareAmount);
  return { grossAmount: round2(grossAmount), commissionAmount, welfareAmount, netAmount };
}

/**
 * Called exactly once, from requests.controller.ts's completeJob, the
 * instant a Society-assigned (booking.assignedMuthaId set) booking
 * completes — never re-run, never re-derived at read time. This is the
 * ONE place "what a member actually keeps from this job" becomes a real,
 * permanent record: one CommissionRecord per assigned member (the
 * worker-facing "here's exactly what was deducted and why" disclosure —
 * PS's own transparency requirement) plus one real 'commission' and one
 * real 'welfare_fund' LedgerEntry for the Society's own retained total
 * across all members on this booking. Idempotent by construction —
 * CommissionRecord's unique {bookingId, workerId} index means a second
 * call (e.g. a retried request) fails the individual insert rather than
 * double-recording; caller treats a duplicate-key failure as already-done,
 * not an error.
 */
export async function recordSocietyDeductionsForBooking(booking: IBooking): Promise<void> {
  if (!booking.assignedMuthaId || booking.assignedHamaliIds.length === 0) return;

  const mutha = await Mutha.findById(booking.assignedMuthaId).select('commissionRatePct welfareDeductionRatePct').lean();
  if (!mutha) return;
  // Zero-rate Society: nothing to deduct, nothing to record — matches
  // every pre-Phase-B booking's implicit 100%-passthrough behaviour
  // exactly, so a Society that never configures bye-laws sees no change.
  if (mutha.commissionRatePct === 0 && mutha.welfareDeductionRatePct === 0) return;

  const gross = perHamaliShare(booking);
  const { commissionAmount, welfareAmount, netAmount } = applyDeduction(
    gross,
    mutha.commissionRatePct,
    mutha.welfareDeductionRatePct
  );

  let totalCommission = 0;
  let totalWelfare = 0;
  for (const workerId of booking.assignedHamaliIds) {
    try {
      await CommissionRecord.create({
        bookingId: booking._id,
        muthaId: booking.assignedMuthaId,
        workerId,
        grossAmount: round2(gross),
        commissionRatePct: mutha.commissionRatePct,
        commissionAmount,
        welfareRatePct: mutha.welfareDeductionRatePct,
        welfareAmount,
        netAmount,
      });
      totalCommission += commissionAmount;
      totalWelfare += welfareAmount;
    } catch (err) {
      // Duplicate-key (already recorded for this booking+worker) — not a
      // real error, just means this ran before; every other worker on the
      // same booking still gets processed.
      if ((err as { code?: number }).code !== 11000) throw err;
    }
  }

  if (totalCommission > 0) {
    await writeLedgerEntry({
      type: 'commission',
      entityType: 'Mutha',
      entityId: booking.assignedMuthaId.toString(),
      amount: round2(totalCommission),
      description: `Society commission retained from booking ${booking._id.toString()}`,
      status: 'posted',
      region: booking.region,
    });
  }
  if (totalWelfare > 0) {
    await writeLedgerEntry({
      type: 'welfare_fund',
      entityType: 'Mutha',
      entityId: booking.assignedMuthaId.toString(),
      amount: round2(totalWelfare),
      description: `Welfare fund deduction from booking ${booking._id.toString()}`,
      status: 'posted',
      region: booking.region,
    });
  }
}

/**
 * A member's REAL net take from one completed, Society-assigned booking —
 * the historical CommissionRecord if one was written for it (the actual
 * bye-law rate in force at completion time), otherwise the plain gross
 * share (implicit 0% deduction — true for every booking completed before
 * this phase shipped, or for a Society that never configured a rate).
 * Never recomputes against the Society's CURRENT rate for a past booking —
 * that would silently rewrite history if a rate changed since.
 */
export async function netShareForBookings(
  bookings: IBooking[],
  workerId: string
): Promise<Map<string, number>> {
  const bookingIds = bookings.map((b) => b._id);
  const records = await CommissionRecord.find({ bookingId: { $in: bookingIds }, workerId }).lean();
  const recordByBooking = new Map(records.map((r) => [r.bookingId.toString(), r.netAmount]));

  const result = new Map<string, number>();
  for (const b of bookings) {
    const key = b._id.toString();
    result.set(key, recordByBooking.get(key) ?? round2(perHamaliShare(b)));
  }
  return result;
}

/**
 * Bye-law bounds check — a Society's commissionRatePct/welfareDeductionRatePct
 * may never exceed its affiliated district Federation's own configured max.
 * An unaffiliated Society (no districtFederationId, or affiliationStatus
 * !== 'affiliated') has no federation-imposed ceiling — it can set any
 * rate up to the model's own hard 0-100 bound, same as before affiliation
 * existed as a concept at all.
 */
export function assertWithinFederationBounds(
  requestedCommissionPct: number,
  requestedWelfarePct: number,
  maxCommissionPct: number | undefined,
  maxWelfarePct: number | undefined
): string | null {
  if (maxCommissionPct !== undefined && requestedCommissionPct > maxCommissionPct) {
    return `Commission rate cannot exceed your district federation's cap of ${maxCommissionPct}%`;
  }
  if (maxWelfarePct !== undefined && requestedWelfarePct > maxWelfarePct) {
    return `Welfare deduction rate cannot exceed your district federation's cap of ${maxWelfarePct}%`;
  }
  return null;
}

/**
 * A Society's real retained surplus over a window — the sum of its own
 * 'commission' + 'welfare_fund' LedgerEntry rows (real money already
 * accounted, never a separate estimate) minus nothing else: this
 * deliberately does not model operating expenses (rent, staff, etc.) —
 * no such model exists anywhere in this codebase, and inventing one to
 * subtract from a real number would make the "surplus" figure partly
 * fictional. Documented here as the honest scope: this is GROSS retained
 * income for the period, framed to the user as "distributable surplus"
 * with that caveat, not a certified year-end cooperative accounting
 * figure.
 */
export async function computeSurplus(
  muthaId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<{ totalSurplus: number; perShareAmount: number; lineItems: { userId: string; shareCount: number; amount: number }[] }> {
  const { LedgerEntry } = await import('../models/LedgerEntry');
  const agg = await LedgerEntry.aggregate([
    {
      $match: {
        entityType: 'Mutha',
        entityId: new Types.ObjectId(muthaId),
        type: { $in: ['commission', 'welfare_fund'] },
        timestamp: { $gte: periodStart, $lte: periodEnd },
      },
    },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  const totalSurplus = round2((agg[0]?.total as number) ?? 0);

  const shares = await MemberShare.find({ muthaId }).lean();
  const totalShares = shares.reduce((s, sh) => s + sh.shareCount, 0);
  if (totalShares === 0 || totalSurplus <= 0) {
    return { totalSurplus, perShareAmount: 0, lineItems: [] };
  }

  const perShareAmount = round2(totalSurplus / totalShares);
  const lineItems = shares
    .filter((sh) => sh.shareCount > 0)
    .map((sh) => ({
      userId: sh.userId.toString(),
      shareCount: sh.shareCount,
      amount: round2(perShareAmount * sh.shareCount),
    }));
  return { totalSurplus, perShareAmount, lineItems };
}

/** Posts one real negative 'surplus' LedgerEntry per member line item — the actual payout half of computeSurplus's computation. */
export async function distributeSurplus(distributionId: string, distributedByUserId: string): Promise<void> {
  const distribution = await SurplusDistribution.findById(distributionId);
  if (!distribution) throw new Error('SurplusDistribution not found');
  if (distribution.status === 'distributed') return; // idempotent — already done

  for (const item of distribution.lineItems) {
    await writeLedgerEntry({
      type: 'surplus',
      entityType: 'User',
      entityId: item.userId.toString(),
      amount: -Math.abs(item.amount),
      description: `Surplus distribution for ${distribution.periodStart.toISOString().slice(0, 10)} to ${distribution.periodEnd.toISOString().slice(0, 10)}`,
      status: 'posted',
    });
  }

  distribution.status = 'distributed';
  distribution.distributedAt = new Date();
  distribution.distributedByUserId = new Types.ObjectId(distributedByUserId);
  await distribution.save();
}


// Exported so a controller building a single-job breakdown (e.g. a
// worker's "what would I get from this job" preview) doesn't need its own
// copy of the same formula.
export { perHamaliShare as computeGrossPerHamaliShare };
