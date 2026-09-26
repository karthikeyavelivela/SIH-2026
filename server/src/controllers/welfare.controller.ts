import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { env } from '../config/env';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { Federation } from '../models/Federation';
import { Mutha } from '../models/Mutha';
import { Payout } from '../models/Payout';
import { User } from '../models/User';
import { WelfareCheck } from '../models/WelfareCheck';
import { ActivityDay } from '../models/ActivityDay';
import { poolBalance, runWelfareChecks } from '../services/welfarePool.service';
import { dayKey } from '../services/activity.service';

/** The rule's parameters, sent with every welfare view so screens explain the real numbers. */
function ruleParams() {
  return {
    triggerIndex: env.WELFARE_TRIGGER_INDEX,
    payoutCapPct: env.WELFARE_PAYOUT_CAP_PCT,
    perMemberCap: env.WELFARE_PER_MEMBER_CAP,
    minActiveDays: env.WELFARE_MIN_ACTIVE_DAYS,
    minSocietyMembers: env.WELFARE_MIN_SOCIETY_MEMBERS,
    historyWeeks: 12,
  };
}

/** POST /api/admin/welfare/run-check?dryRun=true|false — admin runs last week's checks now. Dry run by default. */
export const runCheck = asyncHandler(async (req: Request, res: Response) => {
  const dryRun = String(req.query.dryRun ?? 'true') !== 'false';
  const raw = (req.body as { periodStart?: string } | undefined)?.periodStart;
  const periodStart = typeof raw === 'string' ? new Date(raw) : undefined;
  if (periodStart && Number.isNaN(periodStart.getTime())) throw new ApiError(400, 'periodStart is not a valid date');
  const checks = await runWelfareChecks({ dryRun, periodStart, actor: { id: req.user!.id, role: req.user!.role } });
  res.status(200).json({ dryRun, checks });
});

/** GET /api/admin/welfare/checks — recent real checks, newest first. */
export const listChecks = asyncHandler(async (_req: Request, res: Response) => {
  const checks = await WelfareCheck.find({ dryRun: false }).sort({ periodStart: -1, createdAt: -1 }).limit(200).lean();
  res.status(200).json({ checks, rule: ruleParams() });
});

/** GET /api/welfare/me — a worker's own welfare card: their pool, recent checks, what they were paid. */
export const getMyWelfare = asyncHandler(async (req: Request, res: Response) => {
  const me = await User.findById(req.user!.id).select('region').lean();
  const district = me?.region
    ? await Federation.findOne({ type: 'district', region: me.region }).select('_id name region').lean()
    : null;
  const society = await Mutha.findOne({ memberIds: req.user!.id }).select('_id name').lean();

  const scopeIds = [district?._id, society?._id].filter(Boolean) as Types.ObjectId[];
  const recentChecks = await WelfareCheck.find({ scopeId: { $in: scopeIds }, dryRun: false })
    .sort({ periodStart: -1 })
    .limit(8)
    .select('scope scopeName periodStart demandIndex triggered note activeMembers')
    .lean();
  const payouts = await Payout.find({ userId: req.user!.id, source: 'welfare_pool' })
    .sort({ createdAt: -1 })
    .limit(10)
    .select('amount period status createdAt')
    .lean();
  const since = new Date(Date.now() - 28 * 86_400_000);
  const availableDaysLast28 = await ActivityDay.countDocuments({ userId: req.user!.id, day: { $gte: dayKey(since) } });

  res.status(200).json({
    district: district ? { id: district._id, name: district.name, poolBalance: await poolBalance(district._id) } : null,
    society: society ? { id: society._id, name: society.name } : null,
    recentChecks,
    payouts,
    availableDaysLast28,
    rule: ruleParams(),
  });
});

/** GET /api/federation/welfare — pool balance, index trend and payouts per district. */
export const getFederationWelfare = asyncHandler(async (req: Request, res: Response) => {
  const caller = await User.findById(req.user!.id).select('federationId').lean();
  if (!caller?.federationId) throw new ApiError(404, 'No federation assigned to this account');
  const fed = await Federation.findById(caller.federationId).select('_id name type region').lean();
  if (!fed) throw new ApiError(404, 'Federation not found');

  // A state federation sees every district under it; a district sees itself.
  const districts =
    fed.type === 'state'
      ? await Federation.find({ type: 'district', parentFederationId: fed._id }).select('_id name region').lean()
      : [fed];

  const panels = [];
  for (const d of districts) {
    const checks = await WelfareCheck.find({ poolFederationId: d._id, dryRun: false })
      .sort({ periodStart: -1 })
      .limit(24)
      .select('scope scopeName periodStart demandIndex triggered paidTotal activeMembers completedBookings note killSwitchOff')
      .lean();
    panels.push({ id: d._id, name: d.name, region: d.region, poolBalance: await poolBalance(d._id), checks });
  }
  res.status(200).json({ federation: { id: fed._id, name: fed.name, type: fed.type }, districts: panels, rule: ruleParams() });
});
