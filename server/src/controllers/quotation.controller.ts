import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { Quotation } from '../models/Quotation';
import { VariationOrder } from '../models/VariationOrder';
import {
  requestQuotation,
  scheduleVisit,
  completeVisit,
  submitQuotation,
  requestChanges,
  acceptQuotation,
  rejectQuotation,
  confirmMilestone,
  requestVariation,
  approveVariation,
  payableFor,
  isExpired,
} from '../services/quotation.service';
import { writeAuditLog } from '../services/audit.service';

/**
 * The quotation endpoints.
 *
 * Every route is scoped to one of the two parties by the service, never by a
 * role check alone: a worker can only act on quotations addressed to them, a
 * customer only on their own. The service also owns the state machine, so
 * this file contains no branching on status — an out-of-order call comes back
 * as a 409 from one place rather than from twelve.
 */

/** Both sides' lists, each from their own end. */
export const listMine = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const asWorker = req.query.as === 'worker';

  const quotations = await Quotation.find(asWorker ? { workerId: userId } : { customerId: userId })
    .sort({ updatedAt: -1 })
    .limit(50)
    .populate(asWorker ? 'customerId' : 'workerId', 'name phone ratingAvg')
    .lean();

  // An expired quotation is reported as expired even if no write has happened
  // since it lapsed — the alternative is a list that shows a price as live
  // for as long as nobody touches it.
  res.status(200).json({
    quotations: quotations.map((q) => ({
      ...q,
      status: q.status === 'submitted' && isExpired(q) ? 'expired' : q.status,
    })),
  });
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const quotation = await Quotation.findOne({
    _id: req.params.id,
    $or: [{ customerId: userId }, { workerId: userId }],
  })
    .populate('workerId', 'name phone ratingAvg')
    .populate('customerId', 'name phone')
    .lean();
  if (!quotation) throw new ApiError(404, 'Quotation not found');

  const variations = await VariationOrder.find({ quotationId: quotation._id }).sort({ requestedAt: 1 }).lean();
  const payable = quotation.frozenTotal !== undefined ? await payableFor(quotation._id.toString()) : null;

  res.status(200).json({
    quotation: { ...quotation, status: quotation.status === 'submitted' && isExpired(quotation) ? 'expired' : quotation.status },
    variations,
    payable,
  });
});

// ------------------------------------------------------------- customer

export const create = asyncHandler(async (req: Request, res: Response) => {
  const { workerId, categorySlug, jobDescription, photos } = req.body;
  const quotation = await requestQuotation({
    customerId: req.user!.id,
    workerId,
    categorySlug,
    jobDescription,
    photos,
  });
  res.status(201).json({ quotation });
});

export const accept = asyncHandler(async (req: Request, res: Response) => {
  const { coordinates, address, region } = req.body as {
    coordinates: [number, number];
    address: string;
    region?: string;
  };
  const { quotation, booking } = await acceptQuotation(req.user!.id, req.params.id, {
    coordinates,
    address,
    region,
  });

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'quotation_accepted',
    targetType: 'Quotation',
    targetId: quotation._id.toString(),
    // The frozen figure is in the audit log because it is the number the
    // customer agreed to, and that is worth being able to prove later.
    details: { frozenTotal: quotation.frozenTotal, bookingId: booking._id.toString() },
  });

  res.status(200).json({ quotation, bookingId: booking._id.toString() });
});

export const reject = asyncHandler(async (req: Request, res: Response) => {
  const quotation = await rejectQuotation(req.user!.id, req.params.id, req.body?.reason);
  res.status(200).json({ quotation });
});

export const negotiate = asyncHandler(async (req: Request, res: Response) => {
  const quotation = await requestChanges(req.user!.id, req.params.id, req.body.note);
  res.status(200).json({ quotation });
});

export const confirmMilestonePayment = asyncHandler(async (req: Request, res: Response) => {
  const quotation = await confirmMilestone(req.user!.id, req.params.id, Number(req.params.index));
  res.status(200).json({ quotation });
});

export const decideVariation = asyncHandler(async (req: Request, res: Response) => {
  const variation = await approveVariation(
    req.user!.id,
    req.params.variationId,
    !!req.body.approve,
    req.body?.note
  );

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: variation.status === 'approved' ? 'variation_approved' : 'variation_rejected',
    targetType: 'VariationOrder',
    targetId: variation._id.toString(),
    details: { amount: variation.amount },
  });

  res.status(200).json({ variation });
});

// --------------------------------------------------------------- worker

export const schedule = asyncHandler(async (req: Request, res: Response) => {
  const scheduledAt = new Date(req.body.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) throw new ApiError(400, 'That is not a valid date');
  const quotation = await scheduleVisit(req.user!.id, req.params.id, scheduledAt);
  res.status(200).json({ quotation });
});

export const markVisitDone = asyncHandler(async (req: Request, res: Response) => {
  const quotation = await completeVisit(req.user!.id, req.params.id);
  res.status(200).json({ quotation });
});

export const submit = asyncHandler(async (req: Request, res: Response) => {
  const quotation = await submitQuotation(req.user!.id, req.params.id, {
    lineItems: req.body.lineItems,
    validityDays: req.body.validityDays,
    note: req.body.note,
  });
  res.status(200).json({ quotation });
});

export const raiseVariation = asyncHandler(async (req: Request, res: Response) => {
  const variation = await requestVariation(req.user!.id, req.params.id, {
    description: req.body.description,
    amount: Number(req.body.amount),
  });
  res.status(201).json({ variation });
});
