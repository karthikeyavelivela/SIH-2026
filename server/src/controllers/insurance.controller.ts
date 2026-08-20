import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { InsurancePlan } from '../models/InsurancePlan';
import { InsurancePolicy } from '../models/InsurancePolicy';
import { InsuranceClaim } from '../models/InsuranceClaim';
import { ParametricTrigger } from '../models/ParametricTrigger';
import { writeAuditLog } from '../services/audit.service';
import { checkParametricTriggers, runParametricCheckForAllPolicies } from '../services/parametricInsurance.service';

/**
 * GET /api/insurance/me — the caller's own active policies (with plan
 * details joined), current parametric-trigger status for each, and their
 * claim history. Every query below is scoped to req.user!.id server-side;
 * nothing here ever trusts a client-supplied user id.
 */
export const getMyInsurance = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const role = req.user!.role;

  const policies = await InsurancePolicy.find({ userId }).sort({ startDate: -1 }).lean();
  const planIds = policies.map((p) => p.planId);
  const plans = await InsurancePlan.find({ _id: { $in: planIds } }).lean();
  const planById = new Map(plans.map((p) => [p._id.toString(), p]));

  const policiesWithPlan = policies.map((p) => ({
    ...p,
    plan: planById.get(p.planId.toString()) ?? null,
  }));

  // See parametricInsurance.service.ts's doc comment: this both reports
  // current status AND fires a genuinely-due payout, idempotently. Runs
  // first so the full-history fetch just below reflects any event it just
  // persisted this call.
  const parametricTriggers = await checkParametricTriggers(userId, role);

  // Full per-period event history (not just the current period) for the
  // "trigger history" the worker-facing dashboard shows — a payout ledger
  // in place of a Payment record; see parametricInsurance.service.ts's top
  // doc comment / this task's final report for why.
  const policyIds = policies.map((p) => p._id);
  const parametricTriggerHistory = await ParametricTrigger.find({ policyId: { $in: policyIds } })
    .select('policyId condition thresholdValue periodDays payoutAmount events')
    .lean();

  const claims = await InsuranceClaim.find({ userId }).sort({ createdAt: -1 }).lean();

  res.status(200).json({ policies: policiesWithPlan, parametricTriggers, parametricTriggerHistory, claims });
});

/**
 * POST /api/insurance/claims — file a new claim. The policy must belong to
 * req.user!.id and be active; ownership is re-verified here, never trusted
 * from the client-supplied policyId.
 */
export const fileClaim = asyncHandler(async (req: Request, res: Response) => {
  const { policyId, incidentDescription, incidentDate, photos } = req.body;

  const policy = await InsurancePolicy.findOne({ _id: policyId, userId: req.user!.id });
  if (!policy) throw new ApiError(404, 'Policy not found');
  if (policy.status !== 'active') throw new ApiError(400, 'Cannot file a claim against a non-active policy');

  const claim = await InsuranceClaim.create({
    userId: req.user!.id,
    policyId: policy._id,
    incidentDescription,
    incidentDate,
    photos: Array.isArray(photos) ? photos : [],
    status: 'submitted',
  });

  res.status(201).json({ claim });
});

/** GET /api/insurance/claims/:id — scoped to owner. */
export const getClaimById = asyncHandler(async (req: Request, res: Response) => {
  const claim = await InsuranceClaim.findOne({ _id: req.params.id, userId: req.user!.id });
  if (!claim) throw new ApiError(404, 'Claim not found');
  res.status(200).json({ claim });
});

// ---- Admin ----

/** GET /api/admin/insurance/claims — all claims, for review. */
export const listAllClaims = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  const claims = await InsuranceClaim.find(filter).sort({ createdAt: -1 }).lean();
  res.status(200).json({ claims });
});

/**
 * PATCH /api/admin/insurance/claims/:id — approve/reject/mark-paid.
 * Audit-logged, same pattern as complaint.controller.ts's resolveComplaint.
 */
export const updateClaimStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status, payoutAmount, reviewNote } = req.body;

  const claim = await InsuranceClaim.findById(req.params.id);
  if (!claim) throw new ApiError(404, 'Claim not found');
  if (claim.status === 'paid') throw new ApiError(400, 'This claim is already paid — final state');

  claim.status = status;
  if (typeof payoutAmount === 'number') claim.payoutAmount = payoutAmount;
  if (reviewNote) claim.reviewNote = reviewNote;
  claim.reviewedByUserId = new Types.ObjectId(req.user!.id);
  await claim.save();

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'insurance_claim_status_updated',
    targetType: 'InsuranceClaim',
    targetId: claim._id.toString(),
    details: { status, payoutAmount, reviewNote },
  });

  res.status(200).json({ claim });
});

/**
 * POST /api/admin/insurance/parametric/run-check — admin-callable manual
 * (or future-scheduler) trigger for the batch parametric check, across
 * every worker's active parametric policies platform-wide.
 */
export const runParametricCheck = asyncHandler(async (_req: Request, res: Response) => {
  const results = await runParametricCheckForAllPolicies();
  res.status(200).json({ results });
});
