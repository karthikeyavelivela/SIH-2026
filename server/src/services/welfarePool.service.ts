import { Types } from 'mongoose';
import { env } from '../config/env';
import { ActivityDay } from '../models/ActivityDay';
import { Booking } from '../models/Booking';
import { Federation } from '../models/Federation';
import { LedgerEntry } from '../models/LedgerEntry';
import { Mutha } from '../models/Mutha';
import { Payout } from '../models/Payout';
import { PlatformSetting, PLATFORM_SETTING_ID } from '../models/PlatformSetting';
import { User } from '../models/User';
import { WelfareCheck, IWelfareCheck, WelfareScope } from '../models/WelfareCheck';
import { WelfarePool } from '../models/WelfarePool';
import { writeAuditLog, SYSTEM_ACTOR_ID } from './audit.service';
import { writeLedgerEntry } from './ledger.service';
import { createNotification } from './notification.service';
import { dayKey } from './activity.service';

/**
 * P1.2 — the demand-indexed welfare pool.
 *
 * Replaces the old individual trigger, which paid a worker whenever their own
 * earnings dipped — a slow month for one person, however it came about.
 * Welfare here answers a different question: did the work itself dry up?
 *
 * Each week, for every district and every society with at least
 * WELFARE_MIN_SOCIETY_MEMBERS members:
 *
 *   demand index = (completed jobs this week ÷ active members this week)
 *                  ÷ median of the same ratio over the previous 12 weeks
 *
 * "Active" means available or working on at least WELFARE_MIN_ACTIVE_DAYS of
 * the 28 days to the end of that week — people who were trying to work.
 * Below WELFARE_TRIGGER_INDEX the district's pool pays its active members,
 * pro rata by active days, capped at WELFARE_PAYOUT_CAP_PCT of the pool and
 * WELFARE_PER_MEMBER_CAP a head. The pool never goes negative. Each scope is
 * checked once per week (a dry run computes the same thing and pays nothing).
 * Verification data is excluded throughout.
 */

const MS_DAY = 86_400_000;
const MS_WEEK = 7 * MS_DAY;
const HISTORY_WEEKS = 12;
const ACTIVE_WINDOW_DAYS = 28;
const WORKER_ROLES = ['hamali_solo', 'mutha_member', 'driver'];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** UTC Monday 00:00 of the week containing `at`. */
export function weekStart(at: Date): Date {
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(d.getTime() - dow * MS_DAY);
}

/** The last full week before `at`. */
export function lastCompletedWeek(at: Date = new Date()): { start: Date; end: Date } {
  const end = weekStart(at);
  return { start: new Date(end.getTime() - MS_WEEK), end };
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export async function poolBalance(districtFederationId: string | Types.ObjectId): Promise<number> {
  const id = new Types.ObjectId(String(districtFederationId));
  const rows = await LedgerEntry.aggregate([
    { $match: { entityType: 'Federation', entityId: id, type: { $in: ['welfare_pool_contribution', 'welfare_pool_payout'] } } },
    { $group: { _id: '$type', total: { $sum: '$amount' } } },
  ]);
  const inflow = rows.find((r) => r._id === 'welfare_pool_contribution')?.total ?? 0;
  const outflow = rows.find((r) => r._id === 'welfare_pool_payout')?.total ?? 0;
  return round2(inflow - outflow);
}

async function payoutsEnabled(): Promise<boolean> {
  if (!env.PARAMETRIC_PAYOUTS_ENABLED) return false;
  const setting = await PlatformSetting.findById(PLATFORM_SETTING_ID).select('parametricPayoutsEnabled').lean();
  return setting?.parametricPayoutsEnabled ?? true;
}

interface ScopeDef {
  scope: WelfareScope;
  scopeId: Types.ObjectId;
  scopeName: string;
  region?: string;
  poolFederationId?: Types.ObjectId;
  memberIds: Types.ObjectId[];
  bookingFilter: Record<string, unknown>;
}

async function districtScopes(): Promise<ScopeDef[]> {
  const districts = await Federation.find({ type: 'district' }).select('_id name region').lean();
  const out: ScopeDef[] = [];
  for (const d of districts) {
    const members = await User.find({ region: d.region, role: { $in: WORKER_ROLES }, isVerification: { $ne: true } })
      .select('_id')
      .lean();
    out.push({
      scope: 'district',
      scopeId: d._id,
      scopeName: d.name,
      region: d.region,
      poolFederationId: d._id,
      memberIds: members.map((m) => m._id),
      bookingFilter: { region: d.region },
    });
  }
  return out;
}

async function societyScopes(): Promise<ScopeDef[]> {
  const societies = await Mutha.find({}).select('_id name memberIds districtFederationId affiliationStatus').lean();
  const out: ScopeDef[] = [];
  for (const m of societies) {
    if ((m.memberIds?.length ?? 0) < env.WELFARE_MIN_SOCIETY_MEMBERS) continue;
    const affiliated = m.affiliationStatus === 'affiliated' && m.districtFederationId;
    out.push({
      scope: 'society',
      scopeId: m._id,
      scopeName: m.name,
      poolFederationId: affiliated ? m.districtFederationId : undefined,
      memberIds: m.memberIds,
      bookingFilter: { assignedMuthaId: m._id },
    });
  }
  return out;
}

/** Distinct active days per member over [from, to): available days ∪ days they worked a job. */
async function activeDaysByMember(memberIds: Types.ObjectId[], from: Date, to: Date): Promise<Map<string, Set<string>>> {
  const days = new Map<string, Set<string>>(memberIds.map((id) => [id.toString(), new Set<string>()]));
  if (memberIds.length === 0) return days;

  const available = await ActivityDay.find({ userId: { $in: memberIds }, day: { $gte: dayKey(from), $lt: dayKey(to) } })
    .select('userId day')
    .lean();
  for (const a of available) days.get(a.userId.toString())?.add(a.day);

  const worked = await Booking.find({
    isVerification: { $ne: true },
    $or: [{ assignedHamaliIds: { $in: memberIds } }, { assignedDriverIds: { $in: memberIds } }],
    statusHistory: { $elemMatch: { status: { $in: ['in_progress', 'completed'] }, timestamp: { $gte: from, $lt: to } } },
  })
    .select('assignedHamaliIds assignedDriverIds statusHistory')
    .lean();
  for (const b of worked) {
    const people = [...(b.assignedHamaliIds ?? []), ...(b.assignedDriverIds ?? [])].map(String);
    for (const h of b.statusHistory) {
      if (!['in_progress', 'completed'].includes(h.status) || h.timestamp < from || h.timestamp >= to) continue;
      for (const p of people) days.get(p)?.add(dayKey(new Date(h.timestamp)));
    }
  }
  return days;
}

function completedAt(b: { statusHistory: { status: string; timestamp: Date }[] }): Date | null {
  const h = [...b.statusHistory].reverse().find((x) => x.status === 'completed');
  return h ? new Date(h.timestamp) : null;
}

export interface WelfareComputation {
  activeMembers: number;
  completedBookings: number;
  perActiveMember: number | null;
  trailingMedian: number | null;
  historyWeeks: number;
  demandIndex: number | null;
  note?: string;
  /** Active members in the checked week, with their active days (for the split). */
  active: { userId: string; activeDays: number }[];
}

/** The index for one scope and one week. Reads only; writes nothing. */
export async function computeDemandIndex(def: ScopeDef, periodStart: Date): Promise<WelfareComputation> {
  const periodEnd = new Date(periodStart.getTime() + MS_WEEK);
  const earliest = new Date(periodStart.getTime() - HISTORY_WEEKS * MS_WEEK - ACTIVE_WINDOW_DAYS * MS_DAY);

  // One read each for activity and completions across the whole history.
  const days = await activeDaysByMember(def.memberIds, earliest, periodEnd);
  const bookings = await Booking.find({
    ...def.bookingFilter,
    status: 'completed',
    isVerification: { $ne: true },
    statusHistory: { $elemMatch: { status: 'completed', timestamp: { $gte: new Date(periodStart.getTime() - HISTORY_WEEKS * MS_WEEK), $lt: periodEnd } } },
  })
    .select('statusHistory')
    .lean();
  const completions = bookings.map(completedAt).filter((d): d is Date => d !== null);

  const weekRatio = (weekStartAt: Date) => {
    const weekEnd = new Date(weekStartAt.getTime() + MS_WEEK);
    const windowStart = dayKey(new Date(weekEnd.getTime() - ACTIVE_WINDOW_DAYS * MS_DAY));
    const windowEnd = dayKey(weekEnd);
    const active: { userId: string; activeDays: number }[] = [];
    for (const [userId, set] of days) {
      let n = 0;
      for (const d of set) if (d >= windowStart && d < windowEnd) n += 1;
      if (n >= env.WELFARE_MIN_ACTIVE_DAYS) active.push({ userId, activeDays: n });
    }
    const done = completions.filter((c) => c >= weekStartAt && c < weekEnd).length;
    return { active, done, ratio: active.length > 0 ? done / active.length : null };
  };

  const current = weekRatio(periodStart);
  const history: number[] = [];
  for (let w = 1; w <= HISTORY_WEEKS; w++) {
    const r = weekRatio(new Date(periodStart.getTime() - w * MS_WEEK));
    if (r.ratio !== null) history.push(r.ratio);
  }
  const med = median(history);

  const base = {
    activeMembers: current.active.length,
    completedBookings: current.done,
    perActiveMember: current.ratio === null ? null : round2(current.ratio),
    trailingMedian: med === null ? null : round2(med),
    historyWeeks: history.length,
    active: current.active,
  };
  if (current.active.length === 0) return { ...base, demandIndex: null, note: 'No active members this week' };
  if (history.length < env.WELFARE_MIN_HISTORY_WEEKS) {
    return { ...base, demandIndex: null, note: `Not enough history (${history.length} of ${env.WELFARE_MIN_HISTORY_WEEKS} weeks needed)` };
  }
  if (!med || med <= 0) return { ...base, demandIndex: null, note: 'No completed work in the last 12 weeks to compare against' };
  return { ...base, demandIndex: Math.round(((current.ratio ?? 0) / med) * 1000) / 1000 };
}

/** Splits a budget in paise, pro rata by active days, each capped; what is left stays in the pool. */
export function splitBudget(budget: number, active: { userId: string; activeDays: number }[], perMemberCap: number) {
  const totalDays = active.reduce((s, a) => s + a.activeDays, 0);
  if (totalDays === 0 || budget <= 0) return [];
  const budgetPaise = Math.floor(budget * 100);
  const capPaise = Math.floor(perMemberCap * 100);
  return active
    .map((a) => ({ ...a, amount: Math.min(capPaise, Math.floor((budgetPaise * a.activeDays) / totalDays)) / 100 }))
    .filter((a) => a.amount > 0);
}

export interface RunOptions {
  at?: Date;
  periodStart?: Date;
  dryRun?: boolean;
  actor?: { id: string; role: string };
}

async function checkScope(def: ScopeDef, periodStart: Date, opts: Required<Pick<RunOptions, 'dryRun'>> & RunOptions): Promise<IWelfareCheck> {
  const periodEnd = new Date(periodStart.getTime() + MS_WEEK);

  if (!opts.dryRun) {
    const existing = await WelfareCheck.findOne({ scope: def.scope, scopeId: def.scopeId, periodStart, dryRun: false }).lean();
    if (existing) return existing as IWelfareCheck;
  }

  const c = await computeDemandIndex(def, periodStart);
  const triggered = c.demandIndex !== null && c.demandIndex < env.WELFARE_TRIGGER_INDEX;
  const killSwitchOff = !(await payoutsEnabled());
  const balance = def.poolFederationId ? await poolBalance(def.poolFederationId) : 0;

  let note = c.note;
  let plan: { userId: string; activeDays: number; amount: number }[] = [];
  let budget = 0;
  if (triggered) {
    const period = dayKey(periodStart);
    // One welfare payment per person per week, whichever scope triggers first.
    const alreadyPaid = await Payout.find({ source: 'welfare_pool', period, userId: { $in: c.active.map((a) => a.userId) } })
      .select('userId')
      .lean();
    const paidSet = new Set(alreadyPaid.map((p) => p.userId.toString()));
    const eligible = c.active.filter((a) => !paidSet.has(a.userId));
    if (!def.poolFederationId) {
      note = 'Demand fell below the trigger, but this society is not affiliated to a district, so it has no pool to pay from';
    } else if (balance <= 0) {
      note = 'Demand fell below the trigger, but the district pool is empty';
    } else if (eligible.length === 0) {
      note = 'Demand fell below the trigger; every active member was already paid for this week';
    } else {
      budget = round2(Math.min((env.WELFARE_PAYOUT_CAP_PCT / 100) * balance, env.WELFARE_PER_MEMBER_CAP * eligible.length));
      plan = splitBudget(budget, eligible, env.WELFARE_PER_MEMBER_CAP);
    }
  }

  const record = {
    scope: def.scope,
    scopeId: def.scopeId,
    scopeName: def.scopeName,
    region: def.region,
    poolFederationId: def.poolFederationId,
    periodStart,
    periodEnd,
    dryRun: opts.dryRun,
    activeMembers: c.activeMembers,
    completedBookings: c.completedBookings,
    perActiveMember: c.perActiveMember,
    trailingMedian: c.trailingMedian,
    historyWeeks: c.historyWeeks,
    demandIndex: c.demandIndex,
    note,
    triggered,
    poolBalanceBefore: balance,
    budget,
    paidTotal: 0,
    killSwitchOff,
    payouts: [] as IWelfareCheck['payouts'],
  };

  if (opts.dryRun) {
    record.payouts = plan.map((p) => ({ userId: new Types.ObjectId(p.userId), activeDays: p.activeDays, amount: p.amount }));
    record.paidTotal = round2(plan.reduce((s, p) => s + p.amount, 0));
    const saved = await WelfareCheck.create(record);
    await auditCheck(saved, opts.actor);
    return saved.toObject();
  }

  // Claim the week before any money moves: the unique index means a second
  // run racing this one fails here instead of paying twice.
  let check;
  try {
    check = await WelfareCheck.create(record);
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      return (await WelfareCheck.findOne({ scope: def.scope, scopeId: def.scopeId, periodStart, dryRun: false }).lean()) as IWelfareCheck;
    }
    throw err;
  }

  let paid = 0;
  for (const p of plan) {
    // Re-read the balance each time: the pool must never go negative, even
    // if another district check drew on it meanwhile.
    const left = await poolBalance(def.poolFederationId!);
    if (left < p.amount) break;
    const payout = await new Payout({
      userId: p.userId,
      amount: p.amount,
      period: dayKey(periodStart),
      status: killSwitchOff ? 'pending' : 'paid',
      decidedAt: killSwitchOff ? undefined : new Date(),
      source: 'welfare_pool',
      sourceRefId: check._id,
      breakdown: { demandIndex: c.demandIndex ?? 0, activeDays: p.activeDays },
    }).save();
    await writeLedgerEntry({
      type: 'welfare_pool_payout',
      entityType: 'Federation',
      entityId: def.poolFederationId!.toString(),
      amount: p.amount,
      description: `Welfare pool payment to a member of ${def.scopeName}, week of ${dayKey(periodStart)} (demand index ${c.demandIndex})${killSwitchOff ? ' — reserved, awaiting admin approval (kill switch)' : ''}`,
      region: def.region,
    });
    check.payouts.push({ userId: new Types.ObjectId(p.userId), activeDays: p.activeDays, amount: p.amount, payoutId: payout._id });
    paid += p.amount;
    if (!killSwitchOff) {
      await createNotification(p.userId, 'welfare_payout', { amount: p.amount, pool: def.scopeName }).catch(() => {});
    }
  }
  check.paidTotal = round2(paid);
  await check.save();
  if (def.poolFederationId) {
    await WelfarePool.updateOne(
      { districtFederationId: def.poolFederationId },
      { $set: { lastCheckedAt: new Date() }, $setOnInsert: { region: def.region ?? def.scopeName } },
      { upsert: true }
    );
  }
  await auditCheck(check, opts.actor);
  return check.toObject();
}

async function auditCheck(check: { _id: Types.ObjectId; scope: string; scopeId: Types.ObjectId; demandIndex: number | null; triggered: boolean; paidTotal: number; dryRun: boolean; note?: string }, actor?: { id: string; role: string }) {
  await writeAuditLog({
    actorId: actor?.id ?? SYSTEM_ACTOR_ID,
    actorRole: (actor?.role ?? 'system') as never,
    action: check.dryRun ? 'welfare_check_dry_run' : 'welfare_check_run',
    targetType: check.scope === 'district' ? 'Federation' : 'Mutha',
    targetId: check.scopeId.toString(),
    details: { checkId: check._id.toString(), demandIndex: check.demandIndex, triggered: check.triggered, paidTotal: check.paidTotal, note: check.note },
  });
}

/** Runs the check for every district and qualifying society for one week. */
export async function runWelfareChecks(opts: RunOptions = {}): Promise<IWelfareCheck[]> {
  const periodStart = opts.periodStart ? weekStart(opts.periodStart) : lastCompletedWeek(opts.at ?? new Date()).start;
  const scopes = [...(await districtScopes()), ...(await societyScopes())];
  const results: IWelfareCheck[] = [];
  for (const def of scopes) {
    results.push(await checkScope(def, periodStart, { ...opts, dryRun: opts.dryRun ?? false }));
  }
  return results;
}

/** Weekly: every six hours, make sure last week has been checked (idempotent). */
export function startWelfareRunner(): NodeJS.Timeout | null {
  if (env.NODE_ENV === 'test') return null;
  const tick = () => {
    runWelfareChecks().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('welfare check run failed:', err);
    });
  };
  setTimeout(tick, 60_000).unref();
  const handle = setInterval(tick, 6 * 60 * 60 * 1000);
  handle.unref();
  return handle;
}
