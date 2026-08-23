import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { rethrowAsConflict } from '../utils/mongoErrors';
import { Federation } from '../models/Federation';
import { Mutha } from '../models/Mutha';
import { User } from '../models/User';
import { Booking } from '../models/Booking';
import { TrainingModule } from '../models/TrainingModule';
import { TrainingProgress } from '../models/TrainingProgress';
import { Certification } from '../models/Certification';
import { InsurancePolicy } from '../models/InsurancePolicy';
import { Dispute } from '../models/Dispute';
import { Complaint } from '../models/Complaint';
import { writeAuditLog } from '../services/audit.service';
import { publicUser } from '../utils/publicUser';
import type { Role } from '@fyro/shared';

const BCRYPT_COST = 12;

/**
 * federationId isn't embedded in the JWT (unlike `role`) — re-fetched live
 * from the DB on every call, same "not trusted from a stale token"
 * reasoning rbac.ts's requirePermission already applies to a manager's
 * permissions[]. A federation admin whose assignment changes takes effect
 * on their very next request, not after their token expires.
 */
async function getCallerFederationId(userId: string): Promise<string> {
  const caller = await User.findById(userId).select('federationId').lean();
  if (!caller?.federationId) throw new ApiError(404, 'No federation assigned to this account');
  return caller.federationId.toString();
}

// ---- Admin-only: creating the hierarchy itself ----
// Federations are platform-established (same posture as Region/FareRule) —
// no self-service creation exists anywhere, matching the real-world fact
// that a Ministry of Cooperation-recognised federation isn't something a
// user signs up and creates for themselves.

export const createFederation = asyncHandler(async (req: Request, res: Response) => {
  const { name, type, parentFederationId, region, registrationNumber, registeredUnderAct, contactDetails, maxCommissionRatePct, maxWelfareDeductionRatePct } =
    req.body;

  if (type === 'district') {
    if (!parentFederationId) throw new ApiError(400, 'A district federation requires parentFederationId (its state federation)');
    const parent = await Federation.findById(parentFederationId).select('type').lean();
    if (!parent) throw new ApiError(404, 'Parent (state) federation not found');
    if (parent.type !== 'state') throw new ApiError(400, 'parentFederationId must reference a state federation');
  } else if (parentFederationId) {
    throw new ApiError(400, 'A state federation cannot have a parentFederationId');
  }

  let federation;
  try {
    federation = await Federation.create({
      name,
      type,
      parentFederationId: type === 'district' ? parentFederationId : undefined,
      region,
      registrationNumber,
      registeredUnderAct,
      contactDetails: contactDetails ?? {},
      maxCommissionRatePct,
      maxWelfareDeductionRatePct,
    });
  } catch (err) {
    rethrowAsConflict(err, `Registration number "${registrationNumber}"`);
  }

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'federation_created',
    targetType: 'Federation',
    targetId: federation._id.toString(),
    details: { name, type, region },
  });

  res.status(201).json({ federation });
});

export const listFederations = asyncHandler(async (req: Request, res: Response) => {
  const { type } = req.query as { type?: string };
  const filter: Record<string, unknown> = {};
  if (type) filter.type = type;
  const federations = await Federation.find(filter).sort({ type: 1, name: 1 });
  res.status(200).json({ federations });
});

/**
 * Admin-only — creates a federation_state_admin/federation_district_admin
 * account, same shape as admin.controller.ts's createManager (platform-
 * assigned, no self-signup) with the one addition of binding the account
 * to a specific Federation via User.federationId.
 */
export const createFederationAdmin = asyncHandler(async (req: Request, res: Response) => {
  const { name, phone, password, role, federationId } = req.body as {
    name: string;
    phone: string;
    password: string;
    role: Role;
    federationId: string;
  };

  const federation = await Federation.findById(federationId).select('type').lean();
  if (!federation) throw new ApiError(404, 'Federation not found');
  if (
    (role === 'federation_state_admin' && federation.type !== 'state') ||
    (role === 'federation_district_admin' && federation.type !== 'district')
  ) {
    throw new ApiError(400, `role "${role}" does not match the federation's type "${federation.type}"`);
  }

  const existing = await User.findOne({ phone });
  if (existing) throw new ApiError(409, 'Phone already registered');

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  let admin;
  try {
    admin = await User.create({ name, phone, passwordHash, role, federationId });
  } catch (err) {
    rethrowAsConflict(err, 'Phone number');
  }

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'federation_admin_created',
    targetType: 'User',
    targetId: admin._id.toString(),
    details: { role, federationId },
  });

  res.status(201).json({ admin: publicUser(admin) });
});

// ---- Federation-admin self-service: scoped dashboard ----

/**
 * Every Society (Mutha) affiliated anywhere within a federation's own
 * subtree — for a district federation, that's societies with
 * districtFederationId === this federation's own _id; for a state
 * federation, every society affiliated to ANY district federation whose
 * parentFederationId is this state federation. Server-side scoping only
 * (never trusts a client-supplied federationId beyond the caller's own
 * User.federationId) — same IDOR discipline as every other "my own scope"
 * endpoint in this codebase.
 */
async function societyIdsInScope(federationId: string, federationType: 'state' | 'district'): Promise<string[]> {
  if (federationType === 'district') {
    const societies = await Mutha.find({ districtFederationId: federationId, affiliationStatus: 'affiliated' })
      .select('_id')
      .lean();
    return societies.map((s) => s._id.toString());
  }
  const districts = await Federation.find({ parentFederationId: federationId, type: 'district' }).select('_id').lean();
  const districtIds = districts.map((d) => d._id);
  const societies = await Mutha.find({ districtFederationId: { $in: districtIds }, affiliationStatus: 'affiliated' })
    .select('_id')
    .lean();
  return societies.map((s) => s._id.toString());
}

/**
 * GET /api/federation/me — the scoped dashboard both federation-admin
 * roles share (district sees its own societies; state sees every society
 * under every one of its districts) — every number here is a real
 * aggregation against the same models the rest of this app already reads
 * (Booking, TrainingProgress, InsurancePolicy, Dispute, Complaint), never
 * fabricated. On zero societies in scope, returns real zeros/empty arrays
 * rather than a fabricated placeholder.
 */
export const getMyFederationDashboard = asyncHandler(async (req: Request, res: Response) => {
  const federationId = await getCallerFederationId(req.user!.id);

  const federation = await Federation.findById(federationId);
  if (!federation) throw new ApiError(404, 'Federation not found');

  const societyIds = await societyIdsInScope(federation._id.toString(), federation.type);
  const societies = await Mutha.find({ _id: { $in: societyIds } })
    .select('name region leaderId memberIds ratingAvg activeJobsCount commissionRatePct welfareDeductionRatePct districtFederationId')
    .lean();

  // State tier only — a per-district rollup, so a state admin can see which
  // district is thin on affiliated societies without opening each one.
  let districts: { _id: string; name: string; region: string; societyCount: number }[] | undefined;
  if (federation.type === 'state') {
    const districtDocs = await Federation.find({ parentFederationId: federation._id, type: 'district' })
      .select('name region')
      .lean();
    const countByDistrict = new Map<string, number>();
    for (const s of societies) {
      const key = s.districtFederationId?.toString();
      if (key) countByDistrict.set(key, (countByDistrict.get(key) ?? 0) + 1);
    }
    districts = districtDocs.map((d) => ({
      _id: d._id.toString(),
      name: d.name,
      region: d.region,
      societyCount: countByDistrict.get(d._id.toString()) ?? 0,
    }));
  }

  const memberIds = societies.flatMap((s) => [s.leaderId.toString(), ...s.memberIds.map((m) => m.toString())]);
  const uniqueMemberIds = [...new Set(memberIds)];

  const [completedBookings, trainingProgress, activePolicies, openDisputes, openComplaints] = await Promise.all([
    Booking.find({ assignedMuthaId: { $in: societyIds }, status: 'completed' })
      .select('assignedMuthaId fareBreakdown.total')
      .lean(),
    TrainingProgress.find({ userId: { $in: uniqueMemberIds } }).select('userId status').lean(),
    InsurancePolicy.countDocuments({ userId: { $in: uniqueMemberIds }, status: 'active' }),
    Dispute.countDocuments({ raisedBy: { $in: uniqueMemberIds }, status: { $in: ['open', 'investigating'] } }),
    Complaint.countDocuments({ raisedByUserId: { $in: uniqueMemberIds }, status: { $in: ['open', 'investigating'] } }),
  ]);

  const jobsCompleted = completedBookings.length;
  const earningsDistributed = Math.round(completedBookings.reduce((s, b) => s + b.fareBreakdown.total, 0) * 100) / 100;

  const totalModulesTargetingMembers = await TrainingModule.countDocuments({
    forRoles: { $in: ['mutha_leader', 'mutha_member'] },
  });
  const completedCount = trainingProgress.filter((p) => p.status === 'completed').length;
  const expectedCompletions = totalModulesTargetingMembers * uniqueMemberIds.length;
  const trainingCompletionRatePct =
    expectedCompletions > 0 ? Math.round((completedCount / expectedCompletions) * 1000) / 10 : 0;

  const welfareEnrolmentRatePct =
    uniqueMemberIds.length > 0 ? Math.round((activePolicies / uniqueMemberIds.length) * 1000) / 10 : 0;

  res.status(200).json({
    federation,
    districts,
    counts: {
      societies: societies.length,
      workers: uniqueMemberIds.length,
      jobsCompleted,
      earningsDistributed,
      trainingCompletionRatePct,
      welfareEnrolmentRatePct,
      grievancesOpen: openDisputes + openComplaints,
    },
    societies: societies.map((s) => ({
      _id: s._id,
      name: s.name,
      region: s.region,
      memberCount: s.memberIds.length + 1,
      ratingAvg: s.ratingAvg,
      activeJobsCount: s.activeJobsCount,
      commissionRatePct: s.commissionRatePct,
      welfareDeductionRatePct: s.welfareDeductionRatePct,
    })),
  });
});

/**
 * GET /api/federation/:id — a state admin drilling into one specific
 * district federation's own dashboard. Deliberately NOT available to a
 * district admin for any id but their own (they already have /me for
 * that) — scoped by verifying the target district's parentFederationId
 * really is the caller's own federationId, never trusted from the URL
 * alone.
 */
export const getDistrictFederationDashboard = asyncHandler(async (req: Request, res: Response) => {
  if (req.user!.role !== 'federation_state_admin') {
    throw new ApiError(403, 'Only a state federation admin may view another federation\'s dashboard this way');
  }
  const target = await Federation.findById(req.params.id);
  if (!target || target.type !== 'district') throw new ApiError(404, 'District federation not found');
  const callerFederationId = await getCallerFederationId(req.user!.id);
  if (target.parentFederationId?.toString() !== callerFederationId) {
    throw new ApiError(403, 'This district federation is not under your state federation');
  }

  const societyIds = await societyIdsInScope(target._id.toString(), 'district');
  const societies = await Mutha.find({ _id: { $in: societyIds } }).select('name region memberIds').lean();
  const memberCount = societies.reduce((s, soc) => s + soc.memberIds.length + 1, 0);
  const jobsCompleted = await Booking.countDocuments({ assignedMuthaId: { $in: societyIds }, status: 'completed' });

  res.status(200).json({
    federation: target,
    counts: { societies: societies.length, workers: memberCount, jobsCompleted },
  });
});

// ---- Society affiliation lifecycle ----

/** GET /api/federation/affiliation-requests — district admin's own pending queue. */
export const listAffiliationRequests = asyncHandler(async (req: Request, res: Response) => {
  const federationId = await getCallerFederationId(req.user!.id);
  const requests = await Mutha.find({ districtFederationId: federationId, affiliationStatus: 'pending' })
    .select('name region leaderId societyRegistrationNumber registeredUnderAct')
    .populate('leaderId', 'name phone')
    .lean();
  res.status(200).json({ requests });
});

/** PATCH /api/federation/affiliation-requests/:muthaId/decide — district admin approves/rejects, scoped to their own federation only. */
export const decideAffiliationRequest = asyncHandler(async (req: Request, res: Response) => {
  const { approve } = req.body as { approve: boolean };
  const federationId = await getCallerFederationId(req.user!.id);

  const mutha = await Mutha.findOne({ _id: req.params.muthaId, districtFederationId: federationId, affiliationStatus: 'pending' });
  if (!mutha) throw new ApiError(404, 'No pending affiliation request found for this society under your federation');

  mutha.affiliationStatus = approve ? 'affiliated' : 'unaffiliated';
  if (!approve) mutha.districtFederationId = undefined;
  await mutha.save();

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: approve ? 'society_affiliation_approved' : 'society_affiliation_rejected',
    targetType: 'Mutha',
    targetId: mutha._id.toString(),
    details: { federationId },
  });

  res.status(200).json({ mutha });
});

/** PATCH /api/federation/societies/:muthaId/suspend — district admin, scoped to their own already-affiliated societies only. */
export const suspendSociety = asyncHandler(async (req: Request, res: Response) => {
  const federationId = await getCallerFederationId(req.user!.id);

  const mutha = await Mutha.findOne({ _id: req.params.muthaId, districtFederationId: federationId, affiliationStatus: 'affiliated' });
  if (!mutha) throw new ApiError(404, 'No affiliated society with this id found under your federation');

  mutha.affiliationStatus = 'suspended';
  await mutha.save();

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'society_suspended',
    targetType: 'Mutha',
    targetId: mutha._id.toString(),
  });

  res.status(200).json({ mutha });
});

const REFRESHER_WINDOW_DAYS = 30;

/**
 * GET /api/federation/training-needs — SIH26089 Phase B.3. Per-society
 * breakdown of two real, actionable numbers: skillGapPct (share of members
 * with zero completed training modules — nothing to certify them on at
 * all) and dueForRefreshCount (members holding a Certification whose
 * validUntil is already past, or within REFRESHER_WINDOW_DAYS) — the exact
 * "which societies have skill gaps, which workers are due for refresher"
 * assessment the PS's own training-alignment ask names. Every number is a
 * real aggregation against TrainingProgress/Certification, scoped to the
 * caller's own federation subtree, never fabricated.
 */
export const getTrainingNeedsAssessment = asyncHandler(async (req: Request, res: Response) => {
  const federationId = await getCallerFederationId(req.user!.id);
  const federation = await Federation.findById(federationId).select('type').lean();
  if (!federation) throw new ApiError(404, 'Federation not found');

  const societyIds = await societyIdsInScope(federationId, federation.type);
  const societies = await Mutha.find({ _id: { $in: societyIds } }).select('name region leaderId memberIds').lean();

  const refresherCutoff = new Date(Date.now() + REFRESHER_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const assessment = await Promise.all(
    societies.map(async (society) => {
      const memberIds = [society.leaderId.toString(), ...society.memberIds.map((m) => m.toString())];
      const [membersWithProgress, dueForRefresh] = await Promise.all([
        TrainingProgress.distinct('userId', { userId: { $in: memberIds }, status: 'completed' }),
        Certification.countDocuments({ userId: { $in: memberIds }, validUntil: { $lte: refresherCutoff } }),
      ]);
      const membersWithNoProgress = memberIds.length - membersWithProgress.length;
      const skillGapPct = memberIds.length > 0 ? Math.round((membersWithNoProgress / memberIds.length) * 1000) / 10 : 0;

      return {
        muthaId: society._id,
        name: society.name,
        region: society.region,
        memberCount: memberIds.length,
        skillGapPct,
        dueForRefreshCount: dueForRefresh,
      };
    })
  );

  res.status(200).json({ assessment });
});

/** PATCH /api/federation/me/bounds — a district federation admin sets the commission/welfare-rate CEILING its affiliated societies may set for themselves. */
export const updateFederationBounds = asyncHandler(async (req: Request, res: Response) => {
  const { maxCommissionRatePct, maxWelfareDeductionRatePct } = req.body as {
    maxCommissionRatePct?: number;
    maxWelfareDeductionRatePct?: number;
  };
  const federationId = await getCallerFederationId(req.user!.id);

  const federation = await Federation.findByIdAndUpdate(
    federationId,
    { maxCommissionRatePct, maxWelfareDeductionRatePct },
    { new: true }
  );
  if (!federation) throw new ApiError(404, 'Federation not found');

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'federation_bounds_updated',
    targetType: 'Federation',
    targetId: federation._id.toString(),
    details: { maxCommissionRatePct, maxWelfareDeductionRatePct },
  });

  res.status(200).json({ federation });
});
