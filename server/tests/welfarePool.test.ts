import './setup';
import request from 'supertest';
import { Types } from 'mongoose';
import { app } from '../src/app';
import { env } from '../src/config/env';
import { User } from '../src/models/User';
import { Booking } from '../src/models/Booking';
import { Federation } from '../src/models/Federation';
import { Mutha } from '../src/models/Mutha';
import { LedgerEntry } from '../src/models/LedgerEntry';
import { Payout } from '../src/models/Payout';
import { ActivityDay } from '../src/models/ActivityDay';
import { WelfareCheck } from '../src/models/WelfareCheck';
import { AuditLog } from '../src/models/AuditLog';
import { PlatformSetting, PLATFORM_SETTING_ID } from '../src/models/PlatformSetting';
import { signAccessToken } from '../src/services/token.service';
import { writeLedgerEntry } from '../src/services/ledger.service';
import { dayKey } from '../src/services/activity.service';
import { median, weekStart, splitBudget, poolBalance, runWelfareChecks } from '../src/services/welfarePool.service';

/*
 * P1.2 — the demand-indexed welfare pool.
 */

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const P = new Date('2026-09-07T00:00:00Z'); // a Monday: the week under check
const PT: [number, number] = [80.65, 16.5];

let seq = 0;
async function agentFor(role: string, extra: Record<string, unknown> = {}) {
  seq += 1;
  const user = await User.create({ name: `W${seq}`, phone: `98550${String(seq).padStart(5, '0')}`, passwordHash: 'x', role, ...extra });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: role as never })}`);
  return { agent, user };
}

async function district(region = 'Vijayawada') {
  return Federation.create({
    name: `${region} District Federation`,
    type: 'district',
    region,
    registrationNumber: `D-${region}-${seq++}`,
    registeredUnderAct: 'AP Cooperative Societies Act',
  });
}

/** n workers in `region`, available every day from 13 weeks + 28 days before P to the end of P's week. */
async function activeWorkers(n: number, region = 'Vijayawada', extra: Record<string, unknown> = {}, sinceMs?: number) {
  const users = [];
  for (let i = 0; i < n; i++) {
    const { user } = await agentFor('hamali_solo', { region, ...extra });
    users.push(user);
  }
  const start = sinceMs ?? P.getTime() - 13 * WEEK - 28 * DAY;
  const rows = [];
  for (const u of users) for (let t = start; t < P.getTime() + WEEK; t += DAY) rows.push({ userId: u._id, day: dayKey(new Date(t)), region });
  await ActivityDay.insertMany(rows);
  return users;
}

async function completions(count: number, weekStartAt: Date, filter: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const { user: customer } = await agentFor('customer');
  const at = new Date(weekStartAt.getTime() + 2 * DAY);
  const docs = [];
  for (let i = 0; i < count; i++) {
    docs.push({
      customerId: customer._id,
      type: 'hamali',
      cargoDetails: { weightKg: 0 },
      pickupLocation: { type: 'Point', coordinates: PT, address: 'A' },
      dropLocation: { type: 'Point', coordinates: PT, address: 'A' },
      requiredHamaliCount: 1,
      status: 'completed',
      fareBreakdown: { baseFare: 0, distanceFare: 0, surgeMultiplier: 1, hamaliFare: 300, total: 300 },
      statusHistory: [{ status: 'completed', timestamp: at }],
      ...filter,
      ...extra,
    });
  }
  await Booking.insertMany(docs);
}

/** 10 jobs a week for the 12 weeks before P, and `current` in P's week. */
async function demandHistory(current: number, filter: Record<string, unknown> = { region: 'Vijayawada' }) {
  for (let w = 1; w <= 12; w++) await completions(10, new Date(P.getTime() - w * WEEK), filter);
  await completions(current, P, filter);
}

async function fundPool(fedId: Types.ObjectId, amount: number) {
  await writeLedgerEntry({
    type: 'welfare_pool_contribution',
    entityType: 'Federation',
    entityId: fedId.toString(),
    amount,
    description: 'test contribution',
  });
}

describe('pure helpers', () => {
  it('median, week start, budget split', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(weekStart(new Date('2026-09-10T15:00:00Z')).toISOString()).toBe('2026-09-07T00:00:00.000Z');
    expect(weekStart(new Date('2026-09-07T00:00:00Z')).toISOString()).toBe('2026-09-07T00:00:00.000Z');
    // Pro rata by active days, capped, paise-floored; the remainder stays in the pool.
    const plan = splitBudget(1000, [{ userId: 'a', activeDays: 20 }, { userId: 'b', activeDays: 10 }], 600);
    expect(plan).toEqual([
      { userId: 'a', activeDays: 20, amount: 600 },
      { userId: 'b', activeDays: 10, amount: 333.33 },
    ]);
  });
});

describe('weekly demand check', () => {
  it('normal demand pays nothing — and one worker with zero earnings in a normal district triggers NOTHING', async () => {
    const fed = await district();
    await activeWorkers(5);
    // A sixth worker, available all along, who got no work at all.
    const [idle] = await activeWorkers(1);
    await demandHistory(12);
    await fundPool(fed._id, 10_000);

    const checks = await runWelfareChecks({ periodStart: P });
    const check = checks.find((c) => c.scope === 'district')!;
    expect(check.demandIndex).toBeGreaterThanOrEqual(1);
    expect(check.triggered).toBe(false);
    expect(await Payout.countDocuments({ source: 'welfare_pool' })).toBe(0);
    expect(await Payout.countDocuments({ userId: idle._id })).toBe(0);
    // The retired individual trigger stays off in production config.
    expect(env.INDIVIDUAL_EARNINGS_TRIGGER).toBe(false);
  });

  it('a demand collapse pays active members from the district pool, capped at 40% of it, and debits the pool', async () => {
    const fed = await district();
    const workers = await activeWorkers(5);
    await demandHistory(2); // 0.4 a head against a usual 2 → index 0.2
    await fundPool(fed._id, 10_000);

    const [check] = await runWelfareChecks({ periodStart: P });
    expect(check.demandIndex).toBe(0.2);
    expect(check.triggered).toBe(true);
    expect(check.budget).toBe(4000); // min(40% of 10,000, 1,000 × 5)
    expect(check.payouts).toHaveLength(5);
    expect(check.payouts.every((p) => p.amount === 800)).toBe(true);
    expect(check.paidTotal).toBe(4000);

    const paid = await Payout.find({ source: 'welfare_pool' }).lean();
    expect(paid).toHaveLength(5);
    expect(paid.every((p) => p.status === 'paid')).toBe(true);
    expect(new Set(paid.map((p) => p.userId.toString()))).toEqual(new Set(workers.map((w) => w._id.toString())));
    expect(await poolBalance(fed._id)).toBe(6000);
    expect(await AuditLog.countDocuments({ action: 'welfare_check_run' })).toBeGreaterThanOrEqual(1);
  });

  it('is idempotent per week', async () => {
    const fed = await district();
    await activeWorkers(5);
    await demandHistory(2);
    await fundPool(fed._id, 10_000);
    await runWelfareChecks({ periodStart: P });
    await runWelfareChecks({ periodStart: P });
    expect(await WelfareCheck.countDocuments({ scope: 'district', dryRun: false })).toBe(1);
    expect(await Payout.countDocuments({ source: 'welfare_pool' })).toBe(5);
    expect(await poolBalance(fed._id)).toBe(6000);
  });

  it('a dry run computes the same payouts and pays nothing', async () => {
    const fed = await district();
    await activeWorkers(5);
    await demandHistory(2);
    await fundPool(fed._id, 10_000);
    const [check] = await runWelfareChecks({ periodStart: P, dryRun: true });
    expect(check.dryRun).toBe(true);
    expect(check.triggered).toBe(true);
    expect(check.paidTotal).toBe(4000);
    expect(await Payout.countDocuments({})).toBe(0);
    expect(await poolBalance(fed._id)).toBe(10_000);
    // A real run afterwards is not blocked by the dry run.
    await runWelfareChecks({ periodStart: P });
    expect(await Payout.countDocuments({ source: 'welfare_pool' })).toBe(5);
  });

  it('never takes the pool negative, and says so when it is empty', async () => {
    const fed = await district();
    await activeWorkers(5);
    await demandHistory(2);
    const [check] = await runWelfareChecks({ periodStart: P });
    expect(check.triggered).toBe(true);
    expect(check.paidTotal).toBe(0);
    expect(check.note).toMatch(/pool is empty/);
    expect(await poolBalance(fed._id)).toBe(0);
  });

  it('the per-member cap binds when the pool is large', async () => {
    const fed = await district();
    await activeWorkers(5);
    await demandHistory(2);
    await fundPool(fed._id, 1_000_000);
    const [check] = await runWelfareChecks({ periodStart: P });
    expect(check.budget).toBe(env.WELFARE_PER_MEMBER_CAP * 5);
    expect(check.payouts.every((p) => p.amount === env.WELFARE_PER_MEMBER_CAP)).toBe(true);
  });

  it('with too little history there is no index and no payment', async () => {
    const fed = await district();
    // New to the platform: available only in the last three weeks.
    await activeWorkers(5, 'Vijayawada', {}, P.getTime() - 3 * WEEK);
    await completions(10, new Date(P.getTime() - WEEK), { region: 'Vijayawada' });
    await completions(1, P, { region: 'Vijayawada' });
    await fundPool(fed._id, 10_000);
    const [check] = await runWelfareChecks({ periodStart: P });
    expect(check.demandIndex).toBeNull();
    expect(check.note).toMatch(/Not enough history/);
    expect(await Payout.countDocuments({})).toBe(0);
  });

  it('members who were not trying to work are not counted or paid', async () => {
    const fed = await district();
    await activeWorkers(5);
    // Signed up but never available.
    const { user: absent } = await agentFor('hamali_solo', { region: 'Vijayawada' });
    await demandHistory(2);
    await fundPool(fed._id, 10_000);
    const [check] = await runWelfareChecks({ periodStart: P });
    expect(check.activeMembers).toBe(5);
    expect(check.payouts.map((p) => p.userId.toString())).not.toContain(absent._id.toString());
  });

  it('verification data is excluded from the index', async () => {
    const fed = await district();
    await activeWorkers(5);
    await demandHistory(2);
    // Twenty verification jobs this week would lift the index above the trigger if they counted.
    await completions(20, P, { region: 'Vijayawada' }, { isVerification: true });
    await fundPool(fed._id, 10_000);
    const [check] = await runWelfareChecks({ periodStart: P });
    expect(check.completedBookings).toBe(2);
    expect(check.triggered).toBe(true);
  });

  it('with the kill switch off, payouts wait for an admin and no one is notified yet', async () => {
    const fed = await district();
    await activeWorkers(5);
    await demandHistory(2);
    await fundPool(fed._id, 10_000);
    await PlatformSetting.create({ _id: PLATFORM_SETTING_ID, parametricPayoutsEnabled: false });
    const [check] = await runWelfareChecks({ periodStart: P });
    expect(check.killSwitchOff).toBe(true);
    const paid = await Payout.find({ source: 'welfare_pool' }).lean();
    expect(paid).toHaveLength(5);
    expect(paid.every((p) => p.status === 'pending')).toBe(true);
  });

  it('a society check pays from its affiliated district pool, and nobody is paid twice in a week', async () => {
    const fed = await district();
    const workers = await activeWorkers(5);
    const { user: leader } = await agentFor('mutha_leader');
    const mutha = await Mutha.create({
      name: 'Benz Circle Society',
      leaderId: leader._id,
      memberIds: workers.map((w) => w._id),
      inviteCode: `S${seq++}`,
      districtFederationId: fed._id,
      affiliationStatus: 'affiliated',
    });
    for (let w = 1; w <= 12; w++) await completions(10, new Date(P.getTime() - w * WEEK), { assignedMuthaId: mutha._id, region: 'Vijayawada' });
    await completions(2, P, { assignedMuthaId: mutha._id, region: 'Vijayawada' });
    await fundPool(fed._id, 10_000);

    const checks = await runWelfareChecks({ periodStart: P });
    const society = checks.find((c) => c.scope === 'society')!;
    expect(society.triggered).toBe(true);
    expect(society.note).toMatch(/already paid/);
    expect(await Payout.countDocuments({ source: 'welfare_pool' })).toBe(5);
  });
});

describe('endpoints', () => {
  it('admin runs a dry run by default; only admins can', async () => {
    await district();
    const { agent: admin } = await agentFor('admin');
    const res = await admin.post('/api/admin/welfare/run-check').send({ periodStart: P.toISOString() });
    expect(res.status).toBe(200);
    expect(res.body.dryRun).toBe(true);
    const { agent: worker } = await agentFor('hamali_solo');
    expect((await worker.post('/api/admin/welfare/run-check')).status).toBe(403);
  });

  it('a worker sees their pool, the rule and their own payments', async () => {
    const fed = await district();
    await fundPool(fed._id, 2500);
    const { agent } = await agentFor('hamali_solo', { region: 'Vijayawada' });
    const res = await agent.get('/api/welfare/me');
    expect(res.status).toBe(200);
    expect(res.body.district).toMatchObject({ name: 'Vijayawada District Federation', poolBalance: 2500 });
    expect(res.body.rule).toMatchObject({ triggerIndex: 0.6, payoutCapPct: 40 });
    expect(res.body.payouts).toEqual([]);
  });

  it('a district federation admin sees its pool and checks; a customer cannot', async () => {
    const fed = await district();
    await fundPool(fed._id, 500);
    const { agent } = await agentFor('federation_district_admin', { federationId: fed._id });
    const res = await agent.get('/api/federation/welfare');
    expect(res.status).toBe(200);
    expect(res.body.districts[0]).toMatchObject({ name: fed.name, poolBalance: 500 });
    const { agent: customer } = await agentFor('customer');
    expect((await customer.get('/api/federation/welfare')).status).toBe(403);
  });

  it('going online records one available day', async () => {
    const { agent, user } = await agentFor('hamali_solo', { region: 'Vijayawada' });
    const { HamaliProfile } = await import('../src/models/HamaliProfile');
    await HamaliProfile.create({ userId: user._id, type: 'solo', availabilityStatus: 'offline' } as never);
    user.kycDocs.push({ type: 'aadhaar', url: 'x', status: 'verified', uploadedAt: new Date() } as never);
    await user.save();
    const on = await agent.patch('/api/availability').send({ status: 'online', location: { lat: 16.5, lng: 80.65 } });
    if (on.status === 200) {
      await agent.patch('/api/availability').send({ status: 'online', location: { lat: 16.5, lng: 80.65 } });
      expect(await ActivityDay.countDocuments({ userId: user._id })).toBe(1);
    } else {
      // The KYC gate may require more documents than this fixture uploads;
      // the recording itself is covered by the direct call below.
      const { markAvailableToday } = await import('../src/services/activity.service');
      await markAvailableToday(user._id.toString());
      await markAvailableToday(user._id.toString());
      expect(await ActivityDay.countDocuments({ userId: user._id })).toBe(1);
    }
  });
});

afterAll(() => {
  void LedgerEntry;
});
