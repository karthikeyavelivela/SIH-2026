import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { Booking } from '../models/Booking';
import { Dispute } from '../models/Dispute';
import { FraudCase } from '../models/FraudCase';
import { Payout } from '../models/Payout';

const LATE_PICKUP_THRESHOLD_MINUTES = 20;

/**
 * GET /api/admin/ops-hub — critical-incident dashboard: late pickups
 * (derived from real Booking status+timestamps, not a stored flag),
 * open disputes/fraud cases/pending payouts, and a merged
 * action-required queue pulling from all three.
 */
export const getOpsHub = asyncHandler(async (_req: Request, res: Response) => {
  const cutoff = new Date(Date.now() - LATE_PICKUP_THRESHOLD_MINUTES * 60_000);

  const [acceptedBookings, openDisputes, openFraudCases, pendingPayouts] = await Promise.all([
    Booking.find({ status: 'accepted' })
      .select('pickupLocation dropLocation statusHistory customerId')
      .populate('customerId', 'name phone'),
    Dispute.find({ status: { $in: ['open', 'investigating'] } })
      .sort({ priority: -1, createdAt: 1 })
      .limit(10)
      .populate('raisedBy', 'name'),
    FraudCase.find({ status: { $in: ['open', 'investigating'] } })
      .sort({ severity: 1, createdAt: 1 })
      .limit(10)
      .populate('userId', 'name'),
    Payout.find({ status: 'pending' }).sort({ createdAt: 1 }).limit(10).populate('userId', 'name'),
  ]);

  const latePickups = acceptedBookings
    .map((b) => {
      const acceptedEntry = [...b.statusHistory].reverse().find((h) => h.status === 'accepted');
      return { booking: b, acceptedAt: acceptedEntry?.timestamp };
    })
    .filter((row) => row.acceptedAt && row.acceptedAt < cutoff)
    .map((row) => ({
      bookingId: row.booking._id.toString(),
      pickupAddress: row.booking.pickupLocation.address,
      dropAddress: row.booking.dropLocation.address,
      acceptedAt: row.acceptedAt,
      customer: row.booking.customerId,
    }));

  const actionQueue = [
    ...openDisputes.map((d) => ({
      kind: 'dispute' as const,
      id: d._id.toString(),
      title: `Dispute: ${d.claim.slice(0, 60)}`,
      priority: d.priority,
      createdAt: d.createdAt,
    })),
    ...openFraudCases.map((c) => ({
      kind: 'fraud_case' as const,
      id: c._id.toString(),
      title: `Fraud case (${c.severity})`,
      priority: c.severity,
      createdAt: c.createdAt,
    })),
    ...pendingPayouts.map((p) => ({
      kind: 'payout' as const,
      id: p._id.toString(),
      title: `Payout ₹${p.amount} pending`,
      priority: 'medium' as const,
      createdAt: p.createdAt,
    })),
  ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  res.status(200).json({
    latePickups,
    counts: {
      latePickups: latePickups.length,
      openDisputes: openDisputes.length,
      openFraudCases: openFraudCases.length,
      pendingPayouts: pendingPayouts.length,
    },
    actionQueue,
  });
});
