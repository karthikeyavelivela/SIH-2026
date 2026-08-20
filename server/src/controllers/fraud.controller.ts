import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { FraudCase } from '../models/FraudCase';
import { FraudSignal } from '../models/FraudSignal';
import { User } from '../models/User';
import { writeAuditLog } from '../services/audit.service';

/** GET /api/admin/fraud/cases — severity-ranked queue. */
export const listFraudCases = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;

  const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const cases = await FraudCase.find(filter).populate('userId', 'name phone role accountStatus').lean();
  cases.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  res.status(200).json({ cases });
});

/** GET /api/admin/fraud/cases/:id — case detail with its full evidence trail. */
export const getFraudCase = asyncHandler(async (req: Request, res: Response) => {
  const fraudCase = await FraudCase.findById(req.params.id).populate('userId', 'name phone role accountStatus');
  if (!fraudCase) throw new ApiError(404, 'Fraud case not found');
  const signals = await FraudSignal.find({ _id: { $in: fraudCase.signalIds } }).sort({ detectedAt: -1 });
  res.status(200).json({ case: fraudCase, signals });
});

/** PATCH /api/admin/fraud/cases/:id/investigate — marks a case under active review. */
export const investigateFraudCase = asyncHandler(async (req: Request, res: Response) => {
  const fraudCase = await FraudCase.findById(req.params.id);
  if (!fraudCase) throw new ApiError(404, 'Fraud case not found');
  if (fraudCase.status !== 'open') throw new ApiError(409, 'Only an open case can move to investigating');

  fraudCase.status = 'investigating';
  await fraudCase.save();

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'fraud_case_investigating',
    targetType: 'FraudCase',
    targetId: fraudCase._id.toString(),
  });

  res.status(200).json({ case: fraudCase });
});

/**
 * PATCH /api/admin/fraud/cases/:id/resolve — 'clear' (false positive) or
 * 'suspend' (real consequence: sets User.accountStatus = 'suspended').
 * The client requires a confirm-modal step before calling this for
 * 'suspend', matching UserTable.tsx's suspend/delete confirm pattern.
 */
export const resolveFraudCase = asyncHandler(async (req: Request, res: Response) => {
  const { resolution, notes } = req.body as { resolution: 'clear' | 'suspend'; notes?: string };
  const fraudCase = await FraudCase.findById(req.params.id);
  if (!fraudCase) throw new ApiError(404, 'Fraud case not found');
  if (fraudCase.status === 'cleared' || fraudCase.status === 'suspended') {
    throw new ApiError(409, 'This case has already been resolved');
  }

  fraudCase.status = resolution === 'suspend' ? 'suspended' : 'cleared';
  fraudCase.notes = notes;
  fraudCase.resolvedByAdminId = new Types.ObjectId(req.user!.id);
  fraudCase.resolvedAt = new Date();
  await fraudCase.save();

  if (resolution === 'suspend') {
    await User.findByIdAndUpdate(fraudCase.userId, { accountStatus: 'suspended' });
  }

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: resolution === 'suspend' ? 'fraud_case_suspended_user' : 'fraud_case_cleared',
    targetType: 'FraudCase',
    targetId: fraudCase._id.toString(),
    details: { userId: fraudCase.userId.toString(), notes: notes ?? null },
  });

  res.status(200).json({ case: fraudCase });
});
