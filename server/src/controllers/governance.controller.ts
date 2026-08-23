import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { Mutha } from '../models/Mutha';
import { Federation } from '../models/Federation';
import { MemberShare } from '../models/MemberShare';
import { CommissionRecord } from '../models/CommissionRecord';
import { SurplusDistribution } from '../models/SurplusDistribution';
import { Poll } from '../models/Poll';
import { Vote } from '../models/Vote';
import { User } from '../models/User';
import { writeAuditLog } from '../services/audit.service';
import { writeLedgerEntry } from '../services/ledger.service';
import { assertWithinFederationBounds, computeSurplus, distributeSurplus } from '../services/governance.service';

async function requireLeaderMutha(userId: string) {
  const mutha = await Mutha.findOne({ leaderId: userId });
  if (!mutha) throw new ApiError(404, 'No Mutha found for this leader');
  return mutha;
}

/** A caller is either the leader or a listed member of `mutha` — used everywhere a "my society" read is scoped to leader+members, never an outsider. */
function assertInSociety(mutha: { leaderId: Types.ObjectId; memberIds: Types.ObjectId[] }, userId: string): void {
  const isLeader = mutha.leaderId.toString() === userId;
  const isMember = mutha.memberIds.some((m) => m.toString() === userId);
  if (!isLeader && !isMember) throw new ApiError(403, 'You are not a member of this society');
}

// ---- Bye-laws (Phase B.2) ----

/**
 * PATCH /api/governance/bye-laws — the society's own leader sets its real
 * commission/welfare rates, bounded by its affiliated district federation's
 * ceiling (Mutha.districtFederationId, only meaningful once
 * affiliationStatus === 'affiliated' — an unaffiliated society has no
 * federation-imposed ceiling to check against, same as before affiliation
 * existed as a concept).
 */
export const updateByLaws = asyncHandler(async (req: Request, res: Response) => {
  const { commissionRatePct, welfareDeductionRatePct } = req.body as {
    commissionRatePct: number;
    welfareDeductionRatePct: number;
  };
  const mutha = await requireLeaderMutha(req.user!.id);

  if (mutha.affiliationStatus === 'affiliated' && mutha.districtFederationId) {
    const federation = await Federation.findById(mutha.districtFederationId)
      .select('maxCommissionRatePct maxWelfareDeductionRatePct')
      .lean();
    const violation = assertWithinFederationBounds(
      commissionRatePct,
      welfareDeductionRatePct,
      federation?.maxCommissionRatePct,
      federation?.maxWelfareDeductionRatePct
    );
    if (violation) throw new ApiError(400, violation);
  }

  mutha.commissionRatePct = commissionRatePct;
  mutha.welfareDeductionRatePct = welfareDeductionRatePct;
  await mutha.save();

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'society_byelaws_updated',
    targetType: 'Mutha',
    targetId: mutha._id.toString(),
    details: { commissionRatePct, welfareDeductionRatePct },
  });

  res.status(200).json({ mutha });
});

/** POST /api/mutha/affiliation-request (mounted from mutha.routes.ts, handler lives here since it's governance-flavoured) — leader requests affiliation to a district federation. */
export const requestAffiliation = asyncHandler(async (req: Request, res: Response) => {
  const { districtFederationId, societyRegistrationNumber, registeredUnderAct } = req.body as {
    districtFederationId: string;
    societyRegistrationNumber: string;
    registeredUnderAct: string;
  };
  const mutha = await requireLeaderMutha(req.user!.id);
  if (mutha.affiliationStatus === 'affiliated') throw new ApiError(400, 'This society is already affiliated');

  const federation = await Federation.findOne({ _id: districtFederationId, type: 'district' }).select('_id').lean();
  if (!federation) throw new ApiError(404, 'District federation not found');

  mutha.districtFederationId = federation._id;
  mutha.societyRegistrationNumber = societyRegistrationNumber;
  mutha.registeredUnderAct = registeredUnderAct as typeof mutha.registeredUnderAct;
  mutha.affiliationStatus = 'pending';
  await mutha.save();

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'society_affiliation_requested',
    targetType: 'Mutha',
    targetId: mutha._id.toString(),
    details: { districtFederationId },
  });

  res.status(200).json({ mutha });
});

// ---- Member shares / equity (Phase B.2) ----

/** POST /api/governance/shares/issue — leader-only, issues/tops-up one member's (or their own) share stake. Also posts a real 'equity' LedgerEntry so a share purchase is itself part of the auditable money trail, not just a number on a row. */
export const issueShares = asyncHandler(async (req: Request, res: Response) => {
  const { userId, shareCount, shareValue } = req.body as { userId: string; shareCount: number; shareValue: number };
  const mutha = await requireLeaderMutha(req.user!.id);
  assertInSociety(mutha, userId);

  const existing = await MemberShare.findOne({ userId, muthaId: mutha._id });
  let record;
  if (existing) {
    existing.shareCount += shareCount;
    existing.shareValue = shareValue;
    record = await existing.save();
  } else {
    record = await MemberShare.create({ userId, muthaId: mutha._id, shareCount, shareValue });
  }

  await writeLedgerEntry({
    type: 'equity',
    entityType: 'User',
    entityId: userId,
    amount: Math.round(shareCount * shareValue * 100) / 100,
    description: `${shareCount} share(s) issued in ${mutha.name}`,
    status: 'posted',
    region: mutha.region,
  });

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'shares_issued',
    targetType: 'MemberShare',
    targetId: record._id.toString(),
    details: { userId, shareCount, shareValue },
  });

  res.status(200).json({ share: record });
});

/** GET /api/governance/shares — leader sees the whole cap table; a member sees only their own row. */
export const listShares = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const role = req.user!.role;

  let mutha;
  if (role === 'mutha_leader') {
    mutha = await requireLeaderMutha(userId);
  } else {
    mutha = await Mutha.findOne({ memberIds: userId });
    if (!mutha) throw new ApiError(404, 'No society found for this member');
  }

  const filter = role === 'mutha_leader' ? { muthaId: mutha._id } : { muthaId: mutha._id, userId };
  const shares = await MemberShare.find(filter).populate('userId', 'name phone').lean();
  res.status(200).json({ shares, totalShares: shares.reduce((s, sh) => s + sh.shareCount, 0) });
});

// ---- Surplus distribution (Phase B.2) ----

/** POST /api/governance/surplus/compute — leader triggers a real computation over a real period; writes nothing to the ledger yet (that only happens on distribute). */
export const computeSurplusForSociety = asyncHandler(async (req: Request, res: Response) => {
  const { periodStart, periodEnd } = req.body as { periodStart: string; periodEnd: string };
  const mutha = await requireLeaderMutha(req.user!.id);

  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    throw new ApiError(400, 'periodStart must be a valid date before periodEnd');
  }

  const { totalSurplus, perShareAmount, lineItems } = await computeSurplus(mutha._id.toString(), start, end);

  let distribution;
  try {
    distribution = await SurplusDistribution.create({
      muthaId: mutha._id,
      periodStart: start,
      periodEnd: end,
      totalSurplus,
      perShareAmount,
      lineItems,
      status: 'computed',
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      throw new ApiError(409, 'A surplus distribution for this exact period already exists');
    }
    throw err;
  }

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'surplus_computed',
    targetType: 'SurplusDistribution',
    targetId: distribution._id.toString(),
    details: { totalSurplus, perShareAmount, memberCount: lineItems.length },
  });

  res.status(201).json({ distribution });
});

/** POST /api/governance/surplus/:id/distribute — leader confirms a computed distribution; this is the one call that actually posts real negative 'surplus' LedgerEntry rows per member. */
export const distributeSurplusForSociety = asyncHandler(async (req: Request, res: Response) => {
  const mutha = await requireLeaderMutha(req.user!.id);
  const distribution = await SurplusDistribution.findOne({ _id: req.params.id, muthaId: mutha._id });
  if (!distribution) throw new ApiError(404, 'Surplus distribution not found for your society');
  if (distribution.status === 'distributed') throw new ApiError(409, 'Already distributed');

  await distributeSurplus(distribution._id.toString(), req.user!.id);

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'surplus_distributed',
    targetType: 'SurplusDistribution',
    targetId: distribution._id.toString(),
    details: { totalSurplus: distribution.totalSurplus, memberCount: distribution.lineItems.length },
  });

  res.status(200).json({ distribution: await SurplusDistribution.findById(distribution._id) });
});

/** GET /api/governance/surplus — leader or member views their society's distribution history. */
export const listSurplusDistributions = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const role = req.user!.role;
  let mutha;
  if (role === 'mutha_leader') {
    mutha = await requireLeaderMutha(userId);
  } else {
    mutha = await Mutha.findOne({ memberIds: userId });
    if (!mutha) throw new ApiError(404, 'No society found for this member');
  }
  const distributions = await SurplusDistribution.find({ muthaId: mutha._id }).sort({ periodStart: -1 });
  res.status(200).json({ distributions });
});

// ---- Transparent commission history (Phase B.2) ----

/** GET /api/governance/commission-records/me — a member's own, real, itemized "what was deducted and why" history — the PS's own transparency ask, answered directly rather than folded silently into a smaller earnings number. */
export const getMyCommissionRecords = asyncHandler(async (req: Request, res: Response) => {
  const records = await CommissionRecord.find({ workerId: req.user!.id }).sort({ createdAt: -1 }).limit(100);
  res.status(200).json({ records });
});

// ---- Democratic controls: polls / voting (Phase B.2) ----

// A 'rate_card' poll option's `value` is a JSON-encoded
// {commissionRatePct, welfareDeductionRatePct} proposal string — the
// client builds this with a plain JSON.stringify when creating the poll;
// closePoll below is what parses and (if it passes the federation bound
// check) actually applies it.

export const createPoll = asyncHandler(async (req: Request, res: Response) => {
  const { type, question, options, closesAt } = req.body as {
    type: 'rate_card' | 'leader_election';
    question: string;
    options: { label: string; value: string }[];
    closesAt: string;
  };
  const mutha = await requireLeaderMutha(req.user!.id);

  const closes = new Date(closesAt);
  if (Number.isNaN(closes.getTime()) || closes <= new Date()) {
    throw new ApiError(400, 'closesAt must be a valid future date');
  }
  if (!Array.isArray(options) || options.length < 2) throw new ApiError(400, 'A poll needs at least 2 options');

  const poll = await Poll.create({
    muthaId: mutha._id,
    type,
    question,
    options,
    createdByUserId: req.user!.id,
    closesAt: closes,
  });

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'poll_created',
    targetType: 'Poll',
    targetId: poll._id.toString(),
    details: { type, question },
  });

  res.status(201).json({ poll });
});

export const listPolls = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const role = req.user!.role;
  let mutha;
  if (role === 'mutha_leader') {
    mutha = await requireLeaderMutha(userId);
  } else {
    mutha = await Mutha.findOne({ memberIds: userId });
    if (!mutha) throw new ApiError(404, 'No society found for this member');
  }

  const polls = await Poll.find({ muthaId: mutha._id }).sort({ createdAt: -1 });
  const myVotes = await Vote.find({ pollId: { $in: polls.map((p) => p._id) }, userId }).lean();
  const votedPollIds = new Set(myVotes.map((v) => v.pollId.toString()));

  res.status(200).json({ polls: polls.map((p) => ({ ...p.toObject(), hasVoted: votedPollIds.has(p._id.toString()) })) });
});

export const castVote = asyncHandler(async (req: Request, res: Response) => {
  const { optionIndex } = req.body as { optionIndex: number };
  const userId = req.user!.id;
  const role = req.user!.role;

  const poll = await Poll.findById(req.params.id);
  if (!poll) throw new ApiError(404, 'Poll not found');
  if (poll.status !== 'open') throw new ApiError(400, 'This poll is closed');
  if (poll.closesAt < new Date()) throw new ApiError(400, 'This poll has passed its closing time');
  if (optionIndex < 0 || optionIndex >= poll.options.length) throw new ApiError(400, 'Invalid option index');

  const mutha = await Mutha.findById(poll.muthaId).select('leaderId memberIds').lean();
  if (!mutha) throw new ApiError(404, 'Society not found');
  assertInSociety(mutha, userId);
  void role;

  try {
    await Vote.create({ pollId: poll._id, userId, optionIndex });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw new ApiError(409, 'You have already voted on this poll');
    throw err;
  }

  res.status(201).json({ ok: true });
});

/**
 * POST /api/governance/polls/:id/close — leader-only, real consequences:
 * a closed 'leader_election' winning option really does reassign
 * Mutha.leaderId; a closed 'rate_card' winning option really does update
 * the society's commissionRatePct/welfareDeductionRatePct (still bounds-
 * checked against the district federation's ceiling, same as a direct
 * bye-law edit — a vote can't out-vote a federation-imposed limit).
 */
export const closePoll = asyncHandler(async (req: Request, res: Response) => {
  const mutha = await requireLeaderMutha(req.user!.id);
  const poll = await Poll.findOne({ _id: req.params.id, muthaId: mutha._id });
  if (!poll) throw new ApiError(404, 'Poll not found for your society');
  if (poll.status === 'closed') throw new ApiError(409, 'Already closed');

  const votes = await Vote.find({ pollId: poll._id }).lean();
  const tally = new Array(poll.options.length).fill(0);
  for (const v of votes) tally[v.optionIndex] += 1;
  const winningOptionIndex = tally.indexOf(Math.max(...tally));

  poll.status = 'closed';
  poll.closedAt = new Date();
  poll.winningOptionIndex = votes.length > 0 ? winningOptionIndex : undefined;
  await poll.save();

  let consequence: Record<string, unknown> = {};
  if (votes.length > 0) {
    const winningOption = poll.options[winningOptionIndex];
    if (poll.type === 'leader_election') {
      const newLeaderId = winningOption.value;
      const isEligible =
        mutha.leaderId.toString() === newLeaderId || mutha.memberIds.some((m) => m.toString() === newLeaderId);
      if (isEligible) {
        const newLeader = await User.findByIdAndUpdate(newLeaderId, { role: 'mutha_leader' });
        const oldLeaderId = mutha.leaderId.toString();
        mutha.leaderId = new Types.ObjectId(newLeaderId);
        mutha.memberIds = [...mutha.memberIds.filter((m) => m.toString() !== newLeaderId), new Types.ObjectId(oldLeaderId)];
        await mutha.save();
        if (oldLeaderId !== newLeaderId) await User.findByIdAndUpdate(oldLeaderId, { role: 'mutha_member' });
        consequence = { newLeaderId, newLeaderName: newLeader?.name };
      }
    } else if (poll.type === 'rate_card') {
      try {
        const proposal = JSON.parse(winningOption.value) as { commissionRatePct: number; welfareDeductionRatePct: number };
        let violation: string | null = null;
        if (mutha.affiliationStatus === 'affiliated' && mutha.districtFederationId) {
          const federation = await Federation.findById(mutha.districtFederationId)
            .select('maxCommissionRatePct maxWelfareDeductionRatePct')
            .lean();
          violation = assertWithinFederationBounds(
            proposal.commissionRatePct,
            proposal.welfareDeductionRatePct,
            federation?.maxCommissionRatePct,
            federation?.maxWelfareDeductionRatePct
          );
        }
        if (!violation) {
          mutha.commissionRatePct = proposal.commissionRatePct;
          mutha.welfareDeductionRatePct = proposal.welfareDeductionRatePct;
          await mutha.save();
          consequence = proposal;
        } else {
          consequence = { appliedError: violation };
        }
      } catch {
        consequence = { appliedError: 'Malformed rate-card proposal value' };
      }
    }
  }

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'poll_closed',
    targetType: 'Poll',
    targetId: poll._id.toString(),
    details: { winningOptionIndex: poll.winningOptionIndex, voteCount: votes.length, consequence },
  });

  res.status(200).json({ poll, tally, consequence });
});
