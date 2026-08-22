import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { InsurancePlan } from '../models/InsurancePlan';
import { InsurancePolicy } from '../models/InsurancePolicy';
import { InsuranceClaim } from '../models/InsuranceClaim';
import { ParametricTrigger } from '../models/ParametricTrigger';
import { Payout } from '../models/Payout';
import { PlatformSetting, PLATFORM_SETTING_ID } from '../models/PlatformSetting';
import { writeAuditLog } from '../services/audit.service';
import {
  checkParametricTriggers,
  runParametricCheckForAllPolicies,
  MAX_PARAMETRIC_PAYOUT_GLOBAL_PER_DAY,
} from '../services/parametricInsurance.service';
import { env } from '../config/env';

/** GET /api/insurance/plans — active plans available to the caller's role, for the enrolment screen. */
export const listAvailablePlans = asyncHandler(async (req: Request, res: Response) => {
  const plans = await InsurancePlan.find({ active: true, forRoles: req.user!.role }).lean();
  res.status(200).json({ plans });
});

/**
 * POST /api/insurance/enroll — self-service enrolment with explicit
 * consent (Phase 3.2). Creates the InsurancePolicy AND, if the plan is
 * parametric, a real ParametricTrigger from the plan's defaultTrigger —
 * without this second part, "enrolling" in a parametric plan would create
 * a policy that can never actually pay out (no trigger exists for
 * parametricInsurance.service.ts to evaluate against).
 */
export const enrollInPlan = asyncHandler(async (req: Request, res: Response) => {
  const { planId, consent } = req.body as { planId: string; consent: boolean };
  if (!consent) throw new ApiError(400, 'Explicit consent is required to enrol');

  const plan = await InsurancePlan.findOne({ _id: planId, active: true, forRoles: req.user!.role });
  if (!plan) throw new ApiError(404, 'Plan not found or not available to your role');

  const existing = await InsurancePolicy.findOne({ userId: req.user!.id, planId, status: 'active' });
  if (existing) throw new ApiError(409, 'You are already enrolled in this plan');

  const policy = await InsurancePolicy.create({
    userId: req.user!.id,
    planId: plan._id,
    status: 'active',
    startDate: new Date(),
    endDate: new Date(Date.now() + 365 * 86_400_000),
  });

  let trigger = null;
  if (plan.type === 'parametric' && plan.defaultTrigger) {
    trigger = await ParametricTrigger.create({
      policyId: policy._id,
      condition: plan.defaultTrigger.condition,
      thresholdValue: plan.defaultTrigger.thresholdValue,
      periodDays: plan.defaultTrigger.periodDays,
      payoutAmount: plan.defaultTrigger.payoutAmount,
      active: true,
      events: [],
    });
  }

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'insurance_enrolled',
    targetType: 'InsurancePolicy',
    targetId: policy._id.toString(),
    details: { planId, planName: plan.name, premium: plan.premium, triggerId: trigger?._id?.toString() ?? null },
  });

  res.status(201).json({ policy, trigger });
});

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

// ═══════════════════════════════════════════════════════════════════
// Phase 3.5 admin surfaces — plan configuration (which doubles as the
// parametric trigger rule editor, since a plan's defaultTrigger IS the
// rule template every enrolment gets), the payout monitor, and the
// runtime kill switch. The manual review queue for escalated/pending
// automatic payouts is deliberately NOT duplicated here — Phase 1.4's
// disburseParametricPayout already routes every non-auto-paid trigger
// into the exact same Payout collection payout.controller.ts's admin
// queue (GET /api/admin/payouts) already serves; building a second queue
// for the same underlying records would just be two screens showing the
// same data with room to drift out of sync.
// ═══════════════════════════════════════════════════════════════════

/** GET /api/admin/insurance/plans — every plan, active or not. */
export const listAllPlans = asyncHandler(async (_req: Request, res: Response) => {
  const plans = await InsurancePlan.find().sort({ createdAt: -1 });
  res.status(200).json({ plans });
});

/** POST /api/admin/insurance/plans */
export const createPlan = asyncHandler(async (req: Request, res: Response) => {
  const { name, type, category, coverageAmount, description, forRoles, premium, defaultTrigger } = req.body;
  if (type === 'parametric' && !defaultTrigger) {
    throw new ApiError(400, 'A parametric plan requires defaultTrigger — otherwise enrolment creates a policy that can never pay out');
  }

  const plan = await InsurancePlan.create({
    name,
    type,
    category,
    coverageAmount,
    description,
    forRoles,
    premium,
    defaultTrigger: type === 'parametric' ? defaultTrigger : undefined,
  });

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'insurance_plan_created',
    targetType: 'InsurancePlan',
    targetId: plan._id.toString(),
    details: { name, type, premium },
  });

  res.status(201).json({ plan });
});

/** PATCH /api/admin/insurance/plans/:id */
export const updatePlan = asyncHandler(async (req: Request, res: Response) => {
  const plan = await InsurancePlan.findById(req.params.id);
  if (!plan) throw new ApiError(404, 'Plan not found');

  const { name, active, coverageAmount, description, premium, defaultTrigger } = req.body;
  if (name !== undefined) plan.name = name;
  if (active !== undefined) plan.active = active;
  if (coverageAmount !== undefined) plan.coverageAmount = coverageAmount;
  if (description !== undefined) plan.description = description;
  if (premium !== undefined) plan.premium = premium;
  if (defaultTrigger !== undefined) plan.defaultTrigger = defaultTrigger;
  await plan.save();

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'insurance_plan_updated',
    targetType: 'InsurancePlan',
    targetId: plan._id.toString(),
    details: req.body,
  });

  res.status(200).json({ plan });
});

/**
 * GET /api/admin/insurance/payout-monitor — today's global parametric
 * disbursement total against the daily cap, and current kill-switch state
 * (both the env var and the DB-backed toggle — an admin needs to see when
 * the env var alone is what's blocking payouts, since the DB toggle alone
 * can't override it).
 */
export const getPayoutMonitor = asyncHandler(async (_req: Request, res: Response) => {
  const startOfToday = new Date(new Date().setHours(0, 0, 0, 0));
  const [totalAgg, setting] = await Promise.all([
    Payout.aggregate([
      { $match: { source: 'parametric_insurance', status: 'paid', createdAt: { $gte: startOfToday } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    PlatformSetting.findById(PLATFORM_SETTING_ID).lean(),
  ]);

  res.status(200).json({
    todayTotal: totalAgg[0]?.total ?? 0,
    dailyCap: MAX_PARAMETRIC_PAYOUT_GLOBAL_PER_DAY,
    envKillSwitchEnabled: env.PARAMETRIC_PAYOUTS_ENABLED,
    dbKillSwitchEnabled: setting?.parametricPayoutsEnabled ?? true,
  });
});

/** PATCH /api/admin/insurance/kill-switch — the runtime (no-redeploy) half of the two kill switches. */
export const updateKillSwitch = asyncHandler(async (req: Request, res: Response) => {
  const { enabled } = req.body as { enabled: boolean };
  await PlatformSetting.findByIdAndUpdate(
    PLATFORM_SETTING_ID,
    { _id: PLATFORM_SETTING_ID, parametricPayoutsEnabled: enabled },
    { upsert: true }
  );

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: enabled ? 'parametric_kill_switch_enabled' : 'parametric_kill_switch_disabled',
    targetType: 'PlatformSetting',
    // PlatformSetting._id is the literal string 'singleton', not a real
    // ObjectId — AuditLog.targetId requires one (same reasoning as
    // payout.controller.ts's generatePayouts, a batch action with no
    // single real document to point at).
    targetId: new Types.ObjectId().toString(),
    details: { enabled, settingId: PLATFORM_SETTING_ID },
  });

  res.status(200).json({ enabled });
});
