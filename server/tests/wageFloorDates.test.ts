import './setup';
import request from 'supertest';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Federation } from '../src/models/Federation';
import { GovernmentWageFloor } from '../src/models/GovernmentWageFloor';
import { Notification } from '../src/models/Notification';
import { AuditLog } from '../src/models/AuditLog';
import { signAccessToken } from '../src/services/token.service';
import { deriveRates, clearStateForRegionCache, wageFloorFor, ensureWageFloors } from '../src/services/wageFloor.service';
import { notifyAdminsOfStaleFloors } from '../src/services/wageFloorAlerts.service';

/*
 * P0.3 — the wage floor respects its notification's dates, says when it is
 * stale, checks per-unit prices, and can be managed by an admin.
 *
 * Figures below are the test fixture used across the wage-floor suites
 * (the same AP Zone I values as the seed); nothing here is a new figure.
 */

const DAY = 24 * 3600_000;

async function federations() {
  const state = await Federation.create({
    name: 'AP State Federation', type: 'state', region: 'Andhra Pradesh',
    registrationNumber: 'AP/FED/1', registeredUnderAct: 'AP Cooperative Societies Act 1964',
  });
  await Federation.create({
    name: 'Visakhapatnam District Federation', type: 'district', parentFederationId: state._id, region: 'Visakhapatnam',
    registrationNumber: 'AP/FED/VZ', registeredUnderAct: 'AP Cooperative Societies Act 1964',
  });
  clearStateForRegionCache();
}

async function floor(opts: { monthly?: number; from: Date; until?: Date; active?: boolean; notification?: string; band?: 'skilled' | 'unskilled' }) {
  const monthlyRate = opts.monthly ?? 13407;
  const { dailyRate, hourlyRate } = deriveRates(monthlyRate);
  return GovernmentWageFloor.create({
    state: 'Andhra Pradesh', zone: 'zone_1', skillBand: opts.band ?? 'skilled',
    monthlyRate, dailyRate, hourlyRate, workingDaysPerMonth: 26, workingHoursPerDay: 8,
    scheduledEmployment: 'Shops and Commercial Establishments',
    notificationNumber: opts.notification ?? 'G/3186486/2026',
    notificationDate: new Date('2026-03-23T00:00:00.000Z'),
    effectiveFrom: opts.from, effectiveUntil: opts.until,
    sourceType: 'secondary_compilation', sourceUrl: 'https://example.invalid/compilation',
    active: opts.active ?? true,
  });
}

let seq = 0;
async function agentFor(role: string, extra: Record<string, unknown> = {}) {
  seq += 1;
  const user = await User.create({ name: 'U', phone: `98830${String(seq).padStart(5, '0')}`, passwordHash: 'x', role, ...extra });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: role as never })}`);
  return { agent, user };
}

describe('dates', () => {
  it('is in force between its dates and not stale', async () => {
    await floor({ from: new Date(Date.now() - 10 * DAY), until: new Date(Date.now() + 10 * DAY) });
    const f = await wageFloorFor('Andhra Pradesh', 'skilled', 'zone_1');
    expect(f?.stale).toBe(false);
  });

  it('keeps enforcing a lapsed notification, marked stale, and says so in the refusal', async () => {
    await federations();
    await floor({ from: new Date(Date.now() - 200 * DAY), until: new Date(Date.now() - DAY) });
    const f = await wageFloorFor('Andhra Pradesh', 'skilled', 'zone_1');
    expect(f?.stale).toBe(true);
    expect(f?.hourlyRate).toBe(64.46);

    const { agent } = await agentFor('hamali_solo', { region: 'Visakhapatnam' });
    const res = await agent.put('/api/pricing/mine').send({
      categorySlug: 'electrician',
      modesOffered: ['hourly'],
      hourly: { rate: 30, minimumBlockHours: 1, travelIncluded: true },
    });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/^Last notified rate — update pending\./);
    expect(res.body.error).toMatch(/transcribed from a secondary compilation, not the gazette \(https:\/\/example\.invalid\/compilation\)/);
  });

  it('uses the previous notification until a newly entered one starts', async () => {
    await floor({ from: new Date(Date.now() - 100 * DAY), active: false, monthly: 13407, notification: 'OLD/1' });
    await floor({ from: new Date(Date.now() + 30 * DAY), monthly: 14000, notification: 'NEW/2' });
    const f = await wageFloorFor('Andhra Pradesh', 'skilled', 'zone_1');
    expect(f?.notificationNumber).toBe('OLD/1');
    expect(f?.stale).toBe(false);
    const later = await wageFloorFor('Andhra Pradesh', 'skilled', 'zone_1', new Date(Date.now() + 31 * DAY));
    expect(later?.notificationNumber).toBe('NEW/2');
  });

  it('has no floor at all where nothing was ever notified', async () => {
    expect(await wageFloorFor('Maharashtra', 'skilled', 'zone_1')).toBeNull();
  });
});

describe('per-unit prices', () => {
  beforeEach(async () => {
    await federations();
    await floor({ from: new Date(Date.now() - DAY) });
  });

  it('uses the worker\'s declared minutes per unit when given', async () => {
    const { agent } = await agentFor('hamali_solo', { region: 'Visakhapatnam' });
    const slow = await agent.put('/api/pricing/mine').send({
      categorySlug: 'electrician',
      modesOffered: ['per_unit'],
      perUnit: [{ unitType: 'per_point', rate: 20, minimumQuantity: 1, minutesPerUnit: 30 }], // ₹40/h
    });
    expect(slow.status).toBe(422);
    expect(slow.body.error).toMatch(/₹20 per unit at your 30 minutes per unit/);
    expect(slow.body.details.failures).toHaveLength(1);

    const fast = await agent.put('/api/pricing/mine').send({
      categorySlug: 'electrician',
      modesOffered: ['per_unit'],
      perUnit: [{ unitType: 'per_point', rate: 20, minimumQuantity: 1, minutesPerUnit: 10 }], // ₹120/h
    });
    expect(fast.status).toBe(200);
  });

  it('without a declared time, spreads the smallest job over the standard duration and says so', async () => {
    const { agent } = await agentFor('hamali_solo', { region: 'Visakhapatnam' });
    const res = await agent.put('/api/pricing/mine').send({
      categorySlug: 'electrician',
      modesOffered: ['per_unit'],
      perUnit: [{ unitType: 'per_point', rate: 25, minimumQuantity: 2 }], // ₹50 over 60 min
    });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/smallest job 2 × ₹25 = ₹50 over this service's standard 60 minutes/);
    expect(res.body.error).toMatch(/declare minutes per unit/);
  });

  it('reports every failing rate at once', async () => {
    const { agent } = await agentFor('hamali_solo', { region: 'Visakhapatnam' });
    const res = await agent.put('/api/pricing/mine').send({
      categorySlug: 'electrician',
      modesOffered: ['hourly', 'per_task', 'per_unit'],
      hourly: { rate: 30, minimumBlockHours: 1, travelIncluded: true },
      perTask: [{ taskName: 'Fan fitting', fixedPrice: 30 }],
      perUnit: [{ unitType: 'per_point', rate: 10, minimumQuantity: 1 }],
    });
    expect(res.status).toBe(422);
    expect(res.body.details.failures).toHaveLength(3);
  });
});

describe('admin management', () => {
  it('lists every row with its status, and deactivates one with a reason, audited', async () => {
    const { agent: admin } = await agentFor('admin');
    await floor({ from: new Date(Date.now() - 200 * DAY), until: new Date(Date.now() - DAY) });
    await floor({ from: new Date(Date.now() - DAY), band: 'unskilled', monthly: 12647 });

    const list = await admin.get('/api/admin/wage-floors');
    expect(list.status).toBe(200);
    const statuses = list.body.floors.map((f: { skillBand: string; status: string }) => `${f.skillBand}:${f.status}`).sort();
    expect(statuses).toEqual(['skilled:stale', 'unskilled:in_force']);
    expect(list.body.staleStates).toEqual(['Andhra Pradesh']);
    expect(list.body.floors[0].source).toMatch(/^Notification /);

    const target = list.body.floors.find((f: { skillBand: string }) => f.skillBand === 'unskilled');
    expect((await admin.patch(`/api/admin/wage-floors/${target._id}/deactivate`).send({ reason: 'x' })).status).toBe(400);
    const off = await admin.patch(`/api/admin/wage-floors/${target._id}/deactivate`).send({ reason: 'Entered against the wrong zone' });
    expect(off.status).toBe(200);
    expect(off.body.floor.active).toBe(false);
    expect(await AuditLog.countDocuments({ action: 'wage_floor_deactivated', targetId: target._id })).toBe(1);

    const { agent: customer } = await agentFor('customer');
    expect((await customer.get('/api/admin/wage-floors')).status).toBe(403);
  });

  it('never re-seeds a floor an admin retired', async () => {
    await User.create({ name: 'A', phone: '9883099999', passwordHash: 'x', role: 'admin' });
    const created = await ensureWageFloors();
    expect(created).toBeGreaterThan(0);
    await GovernmentWageFloor.updateMany({}, { active: false });
    expect(await ensureWageFloors()).toBe(0);
    expect(await GovernmentWageFloor.countDocuments({ active: true })).toBe(0);
  });
});

describe('stale floor notice', () => {
  it('tells each admin once a day, and not at all when nothing is stale', async () => {
    const { user: admin } = await agentFor('admin');
    expect(await notifyAdminsOfStaleFloors()).toBe(0);

    await floor({ from: new Date(Date.now() - 200 * DAY), until: new Date(Date.now() - DAY) });
    expect(await notifyAdminsOfStaleFloors()).toBe(1);
    expect(await notifyAdminsOfStaleFloors()).toBe(0); // same day

    const n = await Notification.findOne({ userId: admin._id, type: 'system_alert' });
    expect(n!.title).toBe('Wage floor needs updating');
    expect(n!.body).toMatch(/Andhra Pradesh/);
    expect(n!.link).toBe('/admin/wage-floors');
  });
});
