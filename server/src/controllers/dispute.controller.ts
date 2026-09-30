import { Request, Response } from 'express';
import { releaseSettlementHoldIfClear } from '../services/completion.service';
import { Types } from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { Dispute } from '../models/Dispute';
import { Booking } from '../models/Booking';
import { writeAuditLog } from '../services/audit.service';
import {
  initialRouting,
  announceNewDispute,
  escalateDispute,
  canActOn,
  queueFilterFor,
} from '../services/disputeRouting.service';

/**
 * P1.5 — a dispute a non-admin resolver may act on, or 404. Existence of a
 * dispute outside someone's scope is not their business either.
 */
async function actionable(req: Request) {
  const dispute = await Dispute.findById(req.params.id);
  if (!dispute || !(await canActOn({ id: req.user!.id, role: req.user!.role }, dispute))) {
    throw new ApiError(404, 'Dispute not found');
  }
  return dispute;
}

/** GET /api/admin/disputes — queue, filterable by status. */
export const listDisputes = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  const disputes = await Dispute.find(filter)
    .sort({ priority: -1, createdAt: 1 })
    .populate('raisedBy', 'name phone role')
    .populate('bookingId', 'status fareBreakdown');
  res.status(200).json({ disputes });
});

/** GET /api/admin/disputes/:id — side-by-side claim vs system record + comms log. */
export const getDispute = asyncHandler(async (req: Request, res: Response) => {
  await actionable(req);
  const dispute = await Dispute.findById(req.params.id)
    .populate('raisedBy', 'name phone role')
    .populate('resolution.resolvedByAdminId', 'name');
  res.status(200).json({ dispute });
});

/**
 * GET /api/dispute-queue — P1.5: the disputes waiting at the caller's level
 * and in their scope (a leader's society, a federation's district or state).
 * Unresolved by default; ?status=resolved shows what they closed.
 */
export const listQueue = asyncHandler(async (req: Request, res: Response) => {
  const scope = await queueFilterFor({ id: req.user!.id, role: req.user!.role });
  if (!scope) {
    res.status(200).json({ disputes: [] });
    return;
  }
  const { status } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = { ...scope };
  if (status === 'resolved') {
    // Resolved at the caller's level, even though `level` no longer moves.
    delete filter.level;
    filter.status = 'resolved';
    filter['resolution.level'] = scope.level ?? { $exists: true };
  } else {
    filter.status = { $ne: 'resolved' };
  }
  const disputes = await Dispute.find(filter)
    .sort({ slaDueAt: 1, createdAt: 1 })
    .populate('raisedBy', 'name phone role')
    .populate('bookingId', 'status fareBreakdown');
  res.status(200).json({ disputes });
});

/** POST /api/admin/disputes/:id/escalate and /api/dispute-queue/:id/escalate — move it up a level now. */
export const escalate = asyncHandler(async (req: Request, res: Response) => {
  const dispute = await actionable(req);
  if (dispute.status === 'resolved') throw new ApiError(409, 'This dispute is already resolved');
  const note = (req.body as { note?: string } | undefined)?.note;
  if (note) dispute.communicationLog.push({ from: req.user!.role, message: note, at: new Date() });
  await escalateDispute(dispute, { id: req.user!.id, role: req.user!.role }, 'escalated');
  res.status(200).json({ dispute });
});

/**
 * Creates a dispute against a real booking, snapshotting the booking's
 * current status/fare/distance as the "system record" half of the
 * side-by-side view. Not exposed to every role — admin/manager only, for
 * now this stands in for a future customer-facing "raise a dispute" flow.
 */
export const createDispute = asyncHandler(async (req: Request, res: Response) => {
  const { bookingId, raisedBy, claim, priority } = req.body;
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError(404, 'Booking not found');

  const dispute = await Dispute.create({
    bookingId,
    raisedBy,
    claim,
    priority: priority ?? 'medium',
    status: 'open',
    systemRecord: {
      status: booking.status,
      fareTotal: booking.fareBreakdown.total,
      distanceKm: booking.distanceKm,
      pickupAddress: booking.pickupLocation.address,
      dropAddress: booking.dropLocation.address,
      statusHistory: booking.statusHistory,
    },
    communicationLog: [],
    ...(await initialRouting(booking)),
  });
  await announceNewDispute(dispute);

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'dispute_created',
    targetType: 'Dispute',
    targetId: dispute._id.toString(),
    details: { bookingId, priority: dispute.priority },
  });

  res.status(201).json({ dispute });
});

/**
 * POST /api/disputes — Phase 4 (Agent B item): a customer or worker
 * raising a dispute on their OWN booking directly, rather than only an
 * admin being able to open one. `raisedBy` is derived from req.user!.id
 * here, never taken from the body — createDispute (admin route, above)
 * still accepts a client-supplied raisedBy because an admin genuinely
 * needs to open a dispute on someone else's behalf; this self-service
 * route has no such need and no such trust.
 */
export const createMyDispute = asyncHandler(async (req: Request, res: Response) => {
  const { bookingId, claim, priority } = req.body;
  const userId = req.user!.id;

  const booking = await Booking.findOne({
    _id: bookingId,
    $or: [{ customerId: userId }, { assignedDriverIds: userId }, { assignedHamaliIds: userId }],
  });
  if (!booking) throw new ApiError(404, 'Booking not found, or you were not a party to it');

  const dispute = await Dispute.create({
    bookingId,
    raisedBy: userId,
    claim,
    priority: priority ?? 'medium',
    status: 'open',
    systemRecord: {
      status: booking.status,
      fareTotal: booking.fareBreakdown.total,
      distanceKm: booking.distanceKm,
      pickupAddress: booking.pickupLocation.address,
      dropAddress: booking.dropLocation.address,
      statusHistory: booking.statusHistory,
    },
    communicationLog: [],
    ...(await initialRouting(booking)),
  });
  await announceNewDispute(dispute);

  await writeAuditLog({
    actorId: userId,
    actorRole: req.user!.role,
    action: 'dispute_created_self_service',
    targetType: 'Dispute',
    targetId: dispute._id.toString(),
    details: { bookingId, priority: dispute.priority },
  });

  res.status(201).json({ dispute });
});

/** GET /api/disputes/mine — the caller's own raised disputes. */
export const listMyDisputes = asyncHandler(async (req: Request, res: Response) => {
  const disputes = await Dispute.find({ raisedBy: req.user!.id }).sort({ createdAt: -1 });
  res.status(200).json({ disputes });
});

/** POST /api/admin/disputes/:id/messages — append to the communication log. */
export const addDisputeMessage = asyncHandler(async (req: Request, res: Response) => {
  const { message } = req.body;
  const dispute = await actionable(req);

  dispute.communicationLog.push({ from: req.user!.role, message, at: new Date() });
  await dispute.save();

  res.status(200).json({ dispute });
});

const RESOLUTION_STATUS: Record<string, 'resolved' | 'escalated'> = {
  approve_adjustment: 'resolved',
  partial_refund: 'resolved',
  reject: 'resolved',
  escalate: 'escalated',
};

/**
 * PATCH /api/admin/disputes/:id/resolve — records a resolution decision.
 * Deliberately does NOT trigger a real Razorpay refund (that's a later
 * phase per the build spec) — this only writes the decision + audit log.
 */
export const resolveDispute = asyncHandler(async (req: Request, res: Response) => {
  const { action, note, amount } = req.body as {
    action: 'approve_adjustment' | 'partial_refund' | 'reject' | 'escalate';
    note: string;
    amount?: number;
  };
  const dispute = await actionable(req);
  if (dispute.status === 'resolved') throw new ApiError(409, 'This dispute is already resolved');

  // P1.5: "escalate" moves it to the next level rather than parking it.
  if (action === 'escalate') {
    dispute.communicationLog.push({ from: req.user!.role, message: note, at: new Date() });
    await escalateDispute(dispute, { id: req.user!.id, role: req.user!.role }, 'escalated');
    res.status(200).json({ dispute });
    return;
  }

  dispute.resolution = {
    action,
    note,
    amount,
    resolvedByAdminId: new Types.ObjectId(req.user!.id),
    resolvedAt: new Date(),
    level: dispute.level,
  };
  dispute.status = RESOLUTION_STATUS[action];
  dispute.slaDueAt = undefined;
  await dispute.save();

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'dispute_resolved',
    targetType: 'Dispute',
    targetId: dispute._id.toString(),
    details: { resolutionAction: action, note, amount: amount ?? null, resultingStatus: dispute.status, level: dispute.level },
  });
  if (dispute.status === 'resolved') {
    await releaseSettlementHoldIfClear(dispute.bookingId.toString());
  }

  res.status(200).json({ dispute });
});
