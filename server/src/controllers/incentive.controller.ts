import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { IncentiveRule } from '../models/IncentiveRule';
import { Incentive } from '../models/Incentive';
import { User } from '../models/User';
import { Mutha } from '../models/Mutha';
import {
  runIncentiveRule,
  completedJobCountForUser,
  completedJobCountForMutha,
} from '../services/incentive.service';
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

// ---- GET /api/incentives/my-progress ----
// Worker-facing (not admin) — surfaces live progress toward the nearest
// active incentive rule the caller already qualifies for on rating but
// hasn't yet hit the job-count threshold for. Spec: "gamified incentives
// visible in real numbers ('2 more trips to bonus')" — rules/grants
// already existed server-side (admin/incentives), this was the missing
// half: nothing showed a worker where they stood.
export const myIncentiveProgress = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const role = req.user!.role;

  let ratingAvg: number;
  let completedJobs: number;
  let region: string | undefined;

  if (role === 'mutha_leader') {
    const mutha = await Mutha.findOne({ leaderId: userId });
    if (!mutha) throw new ApiError(404, 'No Mutha found for this leader');
    ratingAvg = mutha.ratingAvg;
    completedJobs = await completedJobCountForMutha(mutha._id.toString());
    region = mutha.region;
  } else if (['driver', 'hamali_solo', 'mutha_member'].includes(role)) {
    const user = await User.findById(userId).select('ratingAvg region').lean();
    if (!user) throw new ApiError(404, 'User not found');
    ratingAvg = user.ratingAvg;
    completedJobs = await completedJobCountForUser(userId);
    region = user.region;
  } else {
    throw new ApiError(403, 'This role has no incentive progress');
  }

  const rules = await IncentiveRule.find({
    active: true,
    $or: [{ region: { $exists: false } }, { region: null }, { region: region ?? null }],
  }).lean();

  // Nearest incomplete rule the caller already qualifies for on rating —
  // smallest remaining job count wins. Rules the caller doesn't meet the
  // rating bar for aren't "trips away", they're a rating problem, so
  // they're excluded from this specific nudge.
  let nearest: { rule: typeof rules[number]; remainingJobs: number } | null = null;
  for (const rule of rules) {
    if (ratingAvg < rule.minRatingAvg) continue;
    const remainingJobs = Math.max(0, rule.minCompletedJobs - completedJobs);
    if (nearest === null || remainingJobs < nearest.remainingJobs) {
      nearest = { rule, remainingJobs };
    }
  }

  if (!nearest) {
    res.status(200).json({ progress: null });
    return;
  }

  res.status(200).json({
    progress: {
      bonusAmount: nearest.rule.bonusAmount,
      completedJobs,
      requiredJobs: nearest.rule.minCompletedJobs,
      remainingJobs: nearest.remainingJobs,
    },
  });
});
