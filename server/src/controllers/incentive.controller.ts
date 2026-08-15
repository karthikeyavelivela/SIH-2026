import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { IncentiveRule } from '../models/IncentiveRule';
import { Incentive } from '../models/Incentive';
import { runIncentiveRule } from '../services/incentive.service';
import { writeAuditLog } from '../services/audit.service';

export const createIncentiveRule = asyncHandler(async (req: Request, res: Response) => {
  const { minRatingAvg, minCompletedJobs, bonusAmount, region } = req.body;
  const rule = await IncentiveRule.create({
    minRatingAvg,
    minCompletedJobs,
    bonusAmount,
    region,
    active: true,
    createdByAdminId: req.user!.id,
  });
  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'incentive_rule_created',
    targetType: 'IncentiveRule',
    targetId: rule._id.toString(),
    details: { minRatingAvg, minCompletedJobs, bonusAmount, region },
  });
  res.status(201).json({ rule });
});

export const listIncentiveRules = asyncHandler(async (_req: Request, res: Response) => {
  const rules = await IncentiveRule.find().sort({ createdAt: -1 });
  res.status(200).json({ rules });
});

export const deactivateIncentiveRule = asyncHandler(async (req: Request, res: Response) => {
  const rule = await IncentiveRule.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
  if (!rule) throw new ApiError(404, 'Incentive rule not found');
  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'incentive_rule_deactivated',
    targetType: 'IncentiveRule',
    targetId: rule._id.toString(),
  });
  res.status(200).json({ rule });
});

/** POST /api/admin/incentives/run — spec: "scheduled job or manual trigger"; this is the manual trigger. Runs every active rule. */
export const runIncentives = asyncHandler(async (req: Request, res: Response) => {
  const rules = await IncentiveRule.find({ active: true });
  const results = [];
  for (const rule of rules) {
    const granted = await runIncentiveRule(rule, req.user!.id);
    results.push({ ruleId: rule._id.toString(), granted });
    // One audit entry per rule (rule._id is a real target to point at) —
    // deliberately not a single "batch" entry with a synthetic non-ObjectId
    // target, which AuditLog's schema (targetId: ObjectId, required)
    // doesn't support anyway.
    await writeAuditLog({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: 'incentives_run',
      targetType: 'IncentiveRule',
      targetId: rule._id.toString(),
      details: { grantedCount: granted.length },
    });
  }
  const totalGranted = results.reduce((sum, r) => sum + r.granted.length, 0);

  res.status(200).json({ results, totalGranted });
});

export const listIncentives = asyncHandler(async (_req: Request, res: Response) => {
  const incentives = await Incentive.find().sort({ createdAt: -1 }).limit(200);
  res.status(200).json({ incentives });
});
