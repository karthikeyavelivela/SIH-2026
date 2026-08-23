import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { Booking, IBooking } from '../models/Booking';
import { Mutha } from '../models/Mutha';
import { User } from '../models/User';
import { Incentive } from '../models/Incentive';
import { CommissionRecord } from '../models/CommissionRecord';
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
 * No commission/platform-cut model exists at the platform level — driver
 * and hamali_solo (independent, non-cooperative workers) still keep 100%
 * pass-through, unchanged since Phase 2. A Society-affiliated worker
 * (mutha_member/mutha_leader) is different as of SIH26089 Phase B.2: their
 * own Society's real bye-law commission/welfare rates apply — see the
 * mutha_member/mutha_leader branches below, which read the actual
 * governance.service.ts-recorded net amount rather than this raw gross
 * share directly.
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
  amount: number;
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
    const bookings = await Booking.find({ status: 'completed', assignedDriverIds: userId });
    const lines: EarningLine[] = bookings.map((b) => ({
      bookingId: b._id.toString(),
      completedAt: statusHistoryCompletedAt(b),
      pickupAddress: b.pickupLocation.address,
      dropAddress: b.dropLocation.address,
      amount: round2(vehicleShare(b)),
    }));
    res.status(200).json({
      total: round2(lines.reduce((s, l) => s + l.amount, 0)),
      jobCount: lines.length,
      lines,
      incentiveTotal: await incentiveTotalForUser(userId),
    });
    return;
  }

  if (role === 'hamali_solo') {
    // Independent worker, not a Society member — no cooperative
    // commission/welfare deduction applies, same 100% pass-through as
    // always.
    const bookings = await Booking.find({ status: 'completed', assignedHamaliIds: userId });
    const lines: EarningLine[] = bookings.map((b) => ({
      bookingId: b._id.toString(),
      completedAt: statusHistoryCompletedAt(b),
      pickupAddress: b.pickupLocation.address,
      dropAddress: b.dropLocation.address,
      amount: round2(perHamaliShare(b)),
    }));
    res.status(200).json({
      total: round2(lines.reduce((s, l) => s + l.amount, 0)),
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
    const bookings = await Booking.find({ status: 'completed', assignedHamaliIds: userId });
    const netByBooking = await netShareForBookings(bookings, userId);
    const lines: EarningLine[] = bookings.map((b) => ({
      bookingId: b._id.toString(),
      completedAt: statusHistoryCompletedAt(b),
      pickupAddress: b.pickupLocation.address,
      dropAddress: b.dropLocation.address,
      amount: round2(netByBooking.get(b._id.toString()) ?? perHamaliShare(b)),
    }));
    res.status(200).json({
      total: round2(lines.reduce((s, l) => s + l.amount, 0)),
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

    res.status(200).json({
      // Group total stays the gross pool the Society's hamali arm actually
      // generated (unchanged meaning from before this phase); `retained`
      // is the new, separately-surfaced figure — real commission+welfare
      // kept by the Society across every member on every booking, the
      // society-side mirror of each member's own CommissionRecord.
      total: round2(groupLines.reduce((s, l) => s + l.amount, 0)),
      retained: round2(retainedTotal),
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
