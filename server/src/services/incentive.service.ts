import { User } from '../models/User';
import { Mutha } from '../models/Mutha';
import { Booking } from '../models/Booking';
import { Incentive } from '../models/Incentive';
import { IIncentiveRule } from '../models/IncentiveRule';

/** Calendar-month grant period — one grant per target per rule per period, so re-running the engine mid-month never double-grants. */
export function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7); // 'YYYY-MM'
}

async function completedJobCountForUser(userId: string): Promise<number> {
  return Booking.countDocuments({
    status: 'completed',
    $or: [{ assignedDriverIds: userId }, { assignedHamaliIds: userId }],
  });
}

async function completedJobCountForMutha(muthaId: string): Promise<number> {
  return Booking.countDocuments({ status: 'completed', assignedMuthaId: muthaId });
}

export interface GrantResult {
  targetType: 'user' | 'mutha';
  targetId: string;
  bonusAmount: number;
}

/**
 * Runs one active rule against every eligible worker (driver/hamali_solo/
 * mutha_member individually) and every Mutha, granting an Incentive to
 * anyone who clears BOTH thresholds and hasn't already been granted
 * against this rule this period. Manual-trigger only for now (spec allows
 * either "scheduled job or manual trigger" — a cron wrapper around this
 * same function is the natural Phase 5+ addition, not built here since
 * nothing in this codebase runs a job scheduler yet).
 */
export async function runIncentiveRule(rule: IIncentiveRule, adminId: string): Promise<GrantResult[]> {
  const period = currentPeriod();
  const granted: GrantResult[] = [];
  // Dedup key for "already granted this rule this period" — Incentive's
  // spec-fixed schema has no ruleId field, so criteriaSnapshot (a required,
  // human-readable field the schema DOES define) doubles as that key. A
  // rule edited after already granting would produce a different snapshot
  // and grant again — acceptable: an edited rule IS materially a different
  // criteria set.
  const snapshot = `minRatingAvg=${rule.minRatingAvg},minCompletedJobs=${rule.minCompletedJobs},bonusAmount=${rule.bonusAmount}`;

  const workerFilter: Record<string, unknown> = {
    role: { $in: ['driver', 'hamali_solo', 'mutha_member'] },
    ratingAvg: { $gte: rule.minRatingAvg },
  };
  if (rule.region) workerFilter.region = rule.region;

  const candidateUsers = await User.find(workerFilter).select('_id ratingAvg').lean();
  for (const user of candidateUsers) {
    const jobCount = await completedJobCountForUser(user._id.toString());
    if (jobCount < rule.minCompletedJobs) continue;

    const already = await Incentive.findOne({
      targetUserId: user._id,
      period,
      criteriaSnapshot: snapshot,
    });
    if (already) continue;

    await Incentive.create({
      targetUserId: user._id,
      period,
      ratingAvgAtGrant: user.ratingAvg,
      bonusAmount: rule.bonusAmount,
      criteriaSnapshot: snapshot,
      grantedByAdminId: adminId,
    });
    granted.push({ targetType: 'user', targetId: user._id.toString(), bonusAmount: rule.bonusAmount });
  }

  const muthaFilter: Record<string, unknown> = { ratingAvg: { $gte: rule.minRatingAvg } };
  if (rule.region) muthaFilter.region = rule.region;
  const candidateMuthas = await Mutha.find(muthaFilter).select('_id ratingAvg').lean();
  for (const mutha of candidateMuthas) {
    const jobCount = await completedJobCountForMutha(mutha._id.toString());
    if (jobCount < rule.minCompletedJobs) continue;

    const already = await Incentive.findOne({
      targetMuthaId: mutha._id,
      period,
      criteriaSnapshot: snapshot,
    });
    if (already) continue;

    await Incentive.create({
      targetMuthaId: mutha._id,
      period,
      ratingAvgAtGrant: mutha.ratingAvg,
      bonusAmount: rule.bonusAmount,
      criteriaSnapshot: snapshot,
      grantedByAdminId: adminId,
    });
    granted.push({ targetType: 'mutha', targetId: mutha._id.toString(), bonusAmount: rule.bonusAmount });
  }

  return granted;
}
