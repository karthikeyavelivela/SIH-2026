import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { Booking, IBooking } from '../models/Booking';
import { Mutha } from '../models/Mutha';
import { User } from '../models/User';
import { Incentive } from '../models/Incentive';
import { CommissionRecord } from '../models/CommissionRecord';
import {
  getPlatformCommissionPct,
  applyPlatformCommission,
} from '../services/platformCommission.service';
import { netShareForBookings } from '../services/governance.service';

/**
 * A completed booking's fareBreakdown stores every component PRE-surge
 * except `total` (see fare.service.ts's computeFareBreakdown doc comment).
 * To attribute an accurate, surge-inclusive amount to one side of a combo
 * booking, scale that side's pre-surge component by (total /
 * preSurgeSubtotal) — the exact approach that doc comment recommends for
 * any caller needing a post-surge component, so this isn't a new
 * convention, just its first real consumer.
 *
 * TWO deductions can apply to what a role earns, and they are taken on the
 * gross job share rather than compounded on each other:
 *
 *   1. The PLATFORM commission — ₹10 per ₹100 by default, the single rate
 *      defined in platformCommission.service.ts. It applies to every
 *      earning role: driver, hamali_solo, mutha_member, mutha_leader,
 *      fleet_owner and warehouse_hub.
 *   2. A SOCIETY's own bye-law commission and welfare rates, which apply
 *      only to a society-affiliated worker on a society-assigned job
 *      (governance.service.ts).
 *
 * So a society member in a 6% + 2% society keeps 100 − 10 − 6 − 2 = 82% of
 * gross. Every response below therefore reports `gross`, `platformFee` and
 * the society's `retained` separately — a worker is shown each deduction on
 * its own line rather than one unexplained smaller number.
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

/** Equal split across however many hamali workers were actually assigned. */
function perHamaliShare(booking: IBooking): number {
  const count = booking.assignedHamaliIds.length;
  if (count === 0) return 0;
  return hamaliPoolShare(booking) / count;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface EarningLine {
  bookingId: string;
  completedAt: Date | undefined;
  pickupAddress: string;
  dropAddress: string;
  /** What the worker actually keeps, after every deduction. */
  amount: number;
  /** Before deductions, so a worker can see what was taken and why. */
  grossAmount?: number;
  platformFee?: number;
  societyFee?: number;
}

function statusHistoryCompletedAt(booking: IBooking): Date | undefined {
  return booking.statusHistory.find((h) => h.status === 'completed')?.timestamp;
}

async function incentiveTotalForUser(userId: string): Promise<number> {
  const incentives = await Incentive.find({ targetUserId: userId }).select('bonusAmount').lean();
  return round2(incentives.reduce((s, i) => s + i.bonusAmount, 0));
}

async function incentiveTotalForMutha(muthaId: string): Promise<number> {
  const incentives = await Incentive.find({ targetMuthaId: muthaId }).select('bonusAmount').lean();
  return round2(incentives.reduce((s, i) => s + i.bonusAmount, 0));
}

export const getMyEarnings = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const role = req.user!.role;

  if (role === 'driver') {
    const platformRatePct = await getPlatformCommissionPct();
    const bookings = await Booking.find({ status: 'completed', assignedDriverIds: userId });
    let gross = 0;
    let platformFee = 0;
    const lines: EarningLine[] = bookings.map((b) => {
      const cut = applyPlatformCommission(vehicleShare(b), platformRatePct);
      gross += cut.grossAmount;
      platformFee += cut.platformAmount;
      return {
        bookingId: b._id.toString(),
        completedAt: statusHistoryCompletedAt(b),
        pickupAddress: b.pickupLocation.address,
        dropAddress: b.dropLocation.address,
        // `amount` is always what the worker actually keeps.
        amount: cut.netAmount,
        grossAmount: cut.grossAmount,
        platformFee: cut.platformAmount,
      };
    });
    res.status(200).json({
      total: round2(lines.reduce((s, l) => s + l.amount, 0)),
      gross: round2(gross),
      platformFee: round2(platformFee),
      platformRatePct,
      jobCount: lines.length,
      lines,
      incentiveTotal: await incentiveTotalForUser(userId),
    });
    return;
  }

  if (role === 'hamali_solo') {
    // Independent worker, not a Society member — no society bye-law
    // deduction applies, but the platform commission does, same as every
    // other earning role.
    const platformRatePct = await getPlatformCommissionPct();
    const bookings = await Booking.find({ status: 'completed', assignedHamaliIds: userId });
    let gross = 0;
    let platformFee = 0;
    const lines: EarningLine[] = bookings.map((b) => {
      const cut = applyPlatformCommission(perHamaliShare(b), platformRatePct);
      gross += cut.grossAmount;
      platformFee += cut.platformAmount;
      return {
        bookingId: b._id.toString(),
        completedAt: statusHistoryCompletedAt(b),
        pickupAddress: b.pickupLocation.address,
        dropAddress: b.dropLocation.address,
        amount: cut.netAmount,
        grossAmount: cut.grossAmount,
        platformFee: cut.platformAmount,
      };
    });
    res.status(200).json({
      total: round2(lines.reduce((s, l) => s + l.amount, 0)),
      gross: round2(gross),
      platformFee: round2(platformFee),
      platformRatePct,
      jobCount: lines.length,
      lines,
      incentiveTotal: await incentiveTotalForUser(userId),
    });
    return;
  }

  if (role === 'mutha_member') {
    // Society member — amount is the REAL net-of-commission figure
    // (governance.service.ts's recorded CommissionRecord for each booking,
    // or the plain gross share for any booking with no deduction ever
    // applied — see netShareForBookings's own doc comment).
    const platformRatePct = await getPlatformCommissionPct();
    const bookings = await Booking.find({ status: 'completed', assignedHamaliIds: userId });
    const netByBooking = await netShareForBookings(bookings, userId);
    let gross = 0;
    let platformFee = 0;
    let societyFee = 0;
    const lines: EarningLine[] = bookings.map((b) => {
      const grossShare = perHamaliShare(b);
      // The society's own bye-law deduction, already applied and recorded.
      const afterSociety = netByBooking.get(b._id.toString()) ?? grossShare;
      const societyCut = round2(grossShare - afterSociety);
      // The platform's cut is taken on the same gross, not compounded on
      // what the society already took.
      const cut = applyPlatformCommission(grossShare, platformRatePct);
      gross += cut.grossAmount;
      platformFee += cut.platformAmount;
      societyFee += societyCut;
      return {
        bookingId: b._id.toString(),
        completedAt: statusHistoryCompletedAt(b),
        pickupAddress: b.pickupLocation.address,
        dropAddress: b.dropLocation.address,
        amount: round2(Math.max(0, grossShare - cut.platformAmount - societyCut)),
        grossAmount: cut.grossAmount,
        platformFee: cut.platformAmount,
        societyFee: societyCut,
      };
    });
    res.status(200).json({
      total: round2(lines.reduce((s, l) => s + l.amount, 0)),
      gross: round2(gross),
      platformFee: round2(platformFee),
      platformRatePct,
      retained: round2(societyFee),
      jobCount: lines.length,
      lines,
      incentiveTotal: await incentiveTotalForUser(userId),
    });
    return;
  }

  if (role === 'mutha_leader') {
    const mutha = await Mutha.findOne({ leaderId: userId });
    if (!mutha) throw new ApiError(404, 'No Mutha found for this leader');

    const bookings = await Booking.find({ status: 'completed', assignedMuthaId: mutha._id });
    const groupLines: EarningLine[] = bookings.map((b) => ({
      bookingId: b._id.toString(),
      completedAt: statusHistoryCompletedAt(b),
      pickupAddress: b.pickupLocation.address,
      dropAddress: b.dropLocation.address,
      amount: round2(hamaliPoolShare(b)),
    }));

    // Per-member breakdown (spec: "/mutha/earnings - group total + per-
    // member breakdown"). Only counts a member's share on bookings where
    // that specific member was actually assigned, not every group booking.
    // `total` per member is the REAL net-of-commission figure — same
    // CommissionRecord lookup earnings.controller.ts's mutha_member branch
    // uses, batched here across every member+booking in one query rather
    // than one call per member.
    const bookingIds = bookings.map((b) => b._id);
    const records = await CommissionRecord.find({ bookingId: { $in: bookingIds } })
      .select('bookingId workerId netAmount')
      .lean();
    const recordByKey = new Map(records.map((r) => [`${r.bookingId.toString()}:${r.workerId.toString()}`, r.netAmount]));

    const memberTotals = new Map<string, number>();
    let retainedTotal = 0;
    for (const b of bookings) {
      const gross = perHamaliShare(b);
      for (const id of b.assignedHamaliIds) {
        const key = id.toString();
        const net = recordByKey.get(`${b._id.toString()}:${key}`) ?? round2(gross);
        memberTotals.set(key, (memberTotals.get(key) ?? 0) + net);
        retainedTotal += gross - net;
      }
    }
    const memberUsers = await User.find({ _id: { $in: [...memberTotals.keys()] } }).select('name phone').lean();
    const perMember = memberUsers.map((u) => ({
      userId: u._id.toString(),
      name: u.name,
      phone: u.phone,
      total: round2(memberTotals.get(u._id.toString()) ?? 0),
    }));

    const platformRatePct = await getPlatformCommissionPct();
    const groupGross = round2(groupLines.reduce((s, l) => s + l.amount, 0));
    const groupPlatformFee = applyPlatformCommission(groupGross, platformRatePct).platformAmount;

    res.status(200).json({
      // Group total stays the gross pool the Society's hamali arm actually
      // generated; `retained` is the Society's own commission+welfare kept
      // across every member on every booking, and `platformFee` is the
      // platform's cut on the same pool — all three separately surfaced so
      // the split on screen adds up to what a leader can verify.
      total: groupGross,
      gross: groupGross,
      retained: round2(retainedTotal),
      platformFee: groupPlatformFee,
      platformRatePct,
      jobCount: groupLines.length,
      lines: groupLines,
      perMember,
      commissionRatePct: mutha.commissionRatePct,
      welfareDeductionRatePct: mutha.welfareDeductionRatePct,
      incentiveTotal: await incentiveTotalForMutha(mutha._id.toString()),
    });
    return;
  }

  throw new ApiError(403, 'This role has no earnings view');
});
