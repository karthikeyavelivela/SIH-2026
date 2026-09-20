import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { Booking, IBooking } from '../models/Booking';
import { Mutha } from '../models/Mutha';
import { User } from '../models/User';
import { Incentive } from '../models/Incentive';
import { CommissionRecord } from '../models/CommissionRecord';
import { LedgerEntry } from '../models/LedgerEntry';
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
 *   1. The PLATFORM commission — ₹1 per ₹100 by default, the single rate
 *      defined in platformCommission.service.ts. It applies to every
 *      earning role: driver, hamali_solo, mutha_member, mutha_leader,
 *      fleet_owner and warehouse_hub.
 *   2. A SOCIETY's own bye-law commission and welfare rates, which apply
 *      only to a society-affiliated worker on a society-assigned job
 *      (governance.service.ts).
 *
 * So a society member in a 6% + 2% society keeps 100 − 1 − 6 − 2 = 91% of
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
  /** The rate actually charged on THIS job, which is not always today's. */
  platformRatePct?: number;
  societyFee?: number;
}

/**
 * The platform rate that was ACTUALLY charged on each of these bookings.
 *
 * Every branch below used to price every past job at today's rate, so the
 * day the platform commission moved from 10% to 1% every worker's history
 * would have quietly rewritten itself — a job completed under 10% would
 * start reading as though ₹9 of a ₹900 share had been taken when ₹90 was.
 * The society half of the same screen has never had this problem, because
 * governance.service.ts records a CommissionRecord per job and reads it
 * back rather than recomputing (see netShareForBookings).
 *
 * The platform half has an equivalent permanent record: the 'fee'
 * LedgerEntry written once at completion. The rate is recovered from it by
 * division rather than by parsing the percentage out of its description
 * string, so it stays correct no matter how that text is worded.
 *
 * A booking with no fee row — completed before this mechanism existed, or
 * while the rate was zero — falls back to the live rate, which is the same
 * thing the code did before and is the only honest answer available.
 */
async function chargedPlatformRates(bookings: IBooking[]): Promise<Map<string, number>> {
  const byId = new Map(bookings.map((b) => [b._id.toString(), b]));
  const rows = await LedgerEntry.find({
    type: 'fee',
    entityType: 'Booking',
    entityId: { $in: [...byId.keys()] },
  })
    .select('entityId amount')
    .lean();

  const rates = new Map<string, number>();
  for (const row of rows) {
    // LedgerEntry.entityId is an ObjectId; the map is keyed on its string.
    const id = row.entityId.toString();
    const total = byId.get(id)?.fareBreakdown?.total;
    if (!total || total <= 0 || typeof row.amount !== 'number') continue;
    rates.set(id, round2((row.amount / total) * 100));
  }
  return rates;
}

/** The distinct rates behind a set of lines, so a screen can say "10%" when they agree and stay vague when they do not. */
function ratesApplied(lines: EarningLine[]): number[] {
  return [...new Set(lines.map((l) => l.platformRatePct).filter((r): r is number => typeof r === 'number'))].sort(
    (a, b) => a - b
  );
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
    const charged = await chargedPlatformRates(bookings);
    let gross = 0;
    let platformFee = 0;
    const lines: EarningLine[] = bookings.map((b) => {
      const ratePct = charged.get(b._id.toString()) ?? platformRatePct;
      const cut = applyPlatformCommission(vehicleShare(b), ratePct);
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
        platformRatePct: ratePct,
      };
    });
    res.status(200).json({
      total: round2(lines.reduce((s, l) => s + l.amount, 0)),
      gross: round2(gross),
      platformFee: round2(platformFee),
      platformRatePct,
      platformRatesApplied: ratesApplied(lines),
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
    const charged = await chargedPlatformRates(bookings);
    let gross = 0;
    let platformFee = 0;
    const lines: EarningLine[] = bookings.map((b) => {
      const ratePct = charged.get(b._id.toString()) ?? platformRatePct;
      const cut = applyPlatformCommission(perHamaliShare(b), ratePct);
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
        platformRatePct: ratePct,
      };
    });
    res.status(200).json({
      total: round2(lines.reduce((s, l) => s + l.amount, 0)),
      gross: round2(gross),
      platformFee: round2(platformFee),
      platformRatePct,
      platformRatesApplied: ratesApplied(lines),
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
    const charged = await chargedPlatformRates(bookings);
    let gross = 0;
    let platformFee = 0;
    let societyFee = 0;
    const lines: EarningLine[] = bookings.map((b) => {
      const grossShare = perHamaliShare(b);
      // The society's own bye-law deduction, already applied and recorded.
      const afterSociety = netByBooking.get(b._id.toString()) ?? grossShare;
      const societyCut = round2(grossShare - afterSociety);
      // The platform's cut is taken on the same gross, not compounded on
      // what the society already took, and at the rate that job was
      // actually charged rather than today's.
      const ratePct = charged.get(b._id.toString()) ?? platformRatePct;
      const cut = applyPlatformCommission(grossShare, ratePct);
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
        platformRatePct: ratePct,
        societyFee: societyCut,
      };
    });
    res.status(200).json({
      total: round2(lines.reduce((s, l) => s + l.amount, 0)),
      gross: round2(gross),
      platformFee: round2(platformFee),
      platformRatePct,
      platformRatesApplied: ratesApplied(lines),
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
    // Per booking at its own charged rate, then summed — applying one rate
    // to the whole pool would misstate it the moment the pool spans a rate
    // change.
    const chargedGroup = await chargedPlatformRates(bookings);
    let groupPlatformFee = 0;
    for (const line of groupLines) {
      const ratePct = chargedGroup.get(line.bookingId) ?? platformRatePct;
      line.platformRatePct = ratePct;
      groupPlatformFee += applyPlatformCommission(line.amount, ratePct).platformAmount;
    }
    groupPlatformFee = round2(groupPlatformFee);
    const groupGross = round2(groupLines.reduce((s, l) => s + l.amount, 0));

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
      platformRatesApplied: ratesApplied(groupLines),
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
