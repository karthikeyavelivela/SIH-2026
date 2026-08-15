import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { Booking, IBooking } from '../models/Booking';
import { Mutha } from '../models/Mutha';
import { User } from '../models/User';
import { Incentive } from '../models/Incentive';

/**
 * A completed booking's fareBreakdown stores every component PRE-surge
 * except `total` (see fare.service.ts's computeFareBreakdown doc comment).
 * To attribute an accurate, surge-inclusive amount to one side of a combo
 * booking, scale that side's pre-surge component by (total /
 * preSurgeSubtotal) — the exact approach that doc comment recommends for
 * any caller needing a post-surge component, so this isn't a new
 * convention, just its first real consumer.
 *
 * No commission/platform-cut model exists yet (not specified anywhere in
 * the build spec) — Phase 2 assumes 100% pass-through to the
 * driver/hamali/Mutha side. A commission rate is a natural Phase 4/5
 * addition once payments actually move real money.
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

  if (role === 'hamali_solo' || role === 'mutha_member') {
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
    const memberTotals = new Map<string, number>();
    for (const b of bookings) {
      const share = perHamaliShare(b);
      for (const id of b.assignedHamaliIds) {
        const key = id.toString();
        memberTotals.set(key, (memberTotals.get(key) ?? 0) + share);
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
      total: round2(groupLines.reduce((s, l) => s + l.amount, 0)),
      jobCount: groupLines.length,
      lines: groupLines,
      perMember,
      incentiveTotal: await incentiveTotalForMutha(mutha._id.toString()),
    });
    return;
  }

  throw new ApiError(403, 'This role has no earnings view');
});
