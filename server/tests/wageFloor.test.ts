import './setup';
import request from 'supertest';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Mutha } from '../src/models/Mutha';
import { Federation } from '../src/models/Federation';
import { ServiceCategory } from '../src/models/ServiceCategory';
import { GovernmentWageFloor } from '../src/models/GovernmentWageFloor';
import { AuditLog } from '../src/models/AuditLog';
import { signAccessToken } from '../src/services/token.service';
import {
  deriveRates,
  skillBandForCategory,
  clearStateForRegionCache,
} from '../src/services/wageFloor.service';

/**
 * The statutory wage floor.
 *
 * FYRO's two existing floors — a society's bye-law minimum and the
 * federation's cap above it — are both the cooperative's own numbers. This
 * one is a state government's, and a rate below it is not merely low, it is
 * unlawful. These tests hold the properties that make the claim checkable:
 * the derivation is published, the refusal names the notification, a state
 * with no notification is not silently treated as having a floor of zero,
 * and no rate is enforced against a divisor nobody measured.
 */

const NOTIFICATION = {
  scheduledEmployment: 'Shops and Commercial Establishments',
  notificationNumber: 'G/3186486/2026',
  notificationDate: new Date('2026-03-23T00:00:00.000Z'),
  effectiveFrom: new Date('2026-04-01T00:00:00.000Z'),
  sourceType: 'secondary_compilation' as const,
};

/** Zone I, skilled: ₹13,407/month ÷ 26 ÷ 8 = ₹64.46/hour. */
async function seedApFloors() {
  const state = await Federation.create({
    name: 'AP State Federation',
    type: 'state',
    region: 'Andhra Pradesh',
    registrationNumber: 'AP/FED/1',
    registeredUnderAct: 'AP Cooperative Societies Act 1964',
  });
  await Federation.create({
    name: 'Visakhapatnam District Federation',
    type: 'district',
    parentFederationId: state._id,
    region: 'Visakhapatnam',
    registrationNumber: 'AP/FED/VZ',
    registeredUnderAct: 'AP Cooperative Societies Act 1964',
  });
  clearStateForRegionCache();

  for (const [skillBand, monthlyRate] of [
    ['unskilled', 12647],
    ['semi_skilled', 13027],
    ['skilled', 13407],
    ['highly_skilled', 13887],
  ] as const) {
    const { dailyRate, hourlyRate } = deriveRates(monthlyRate);
    await GovernmentWageFloor.create({
      ...NOTIFICATION,
      state: 'Andhra Pradesh',
      zone: 'zone_1',
      skillBand,
      monthlyRate,
      dailyRate,
      hourlyRate,
      workingDaysPerMonth: 26,
      workingHoursPerDay: 8,
      active: true,
    });
  }
}

async function agentFor(role: string, phone: string, extra: Record<string, unknown> = {}) {
  const user = await User.create({ name: 'U', phone, passwordHash: 'x', role, ...extra });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: role as never })}`);
  return { agent, user };
}

beforeEach(() => {
  clearStateForRegionCache();
});

describe('deriving the hourly floor from a monthly notification', () => {
  it('divides by the working days and then the working day', () => {
    // ₹13,407 a month, 26 working days, an 8-hour day.
    expect(deriveRates(13407)).toEqual({ dailyRate: 515.65, hourlyRate: 64.46 });
    expect(deriveRates(12647)).toEqual({ dailyRate: 486.42, hourlyRate: 60.8 });
  });

  it('uses the divisors it is given, not the defaults', () => {
    expect(deriveRates(13407, 30, 12)).toEqual({ dailyRate: 446.9, hourlyRate: 37.24 });
  });
});

describe('which band a trade falls in', () => {
  it('does not put a caregiver and an electrician in the same band', () => {
    expect(skillBandForCategory('electrician')).toBe('skilled');
    expect(skillBandForCategory('caregiver')).toBe('semi_skilled');
    expect(skillBandForCategory('cleaner')).toBe('unskilled');
  });

  it('falls to the lowest band for an unmapped trade, not the highest', () => {
    // A trade nobody has classified must not inherit a skilled worker's
    // floor by accident: the visible failure is a floor that is too
    // permissive, which an admin can see, not a wall of refusals.
    expect(skillBandForCategory('a_trade_added_later')).toBe('unskilled');
    expect(skillBandForCategory(undefined)).toBe('unskilled');
  });
});

describe('publishing a rate below the statutory minimum', () => {
  beforeEach(async () => {
    await seedApFloors();
    await ServiceCategory.create({
      name: 'Electrician',
      slug: 'electrician',
      icon: 'PowerIcon',
      accentColor: 'primary',
      pricingUnit: 'per_hour',
      requiresVehicle: false,
      requiresMaterials: false,
      defaultDurationMinutes: 60,
      minWorkers: 1,
      dispatchType: 'hamali',
    });
  });

  it('refuses it, and names the notification it would breach', async () => {
    const { agent } = await agentFor('hamali_solo', '9880000001', { region: 'Visakhapatnam' });
    const res = await agent.put('/api/pricing/mine').send({
      categorySlug: 'electrician',
      modesOffered: ['hourly'],
      hourly: { rate: 50, minimumBlockHours: 2, travelIncluded: true },
    });

    expect(res.status).toBe(422);
    // A refusal a worker cannot check is not a fair-wage mechanism.
    expect(res.body.error).toContain('G/3186486/2026');
    expect(res.body.error).toContain('64.46');
    expect(res.body.error).toContain('Andhra Pradesh');
    // The working is in the message, not just the verdict.
    expect(res.body.error).toContain('13407');
    expect(res.body.error).toContain('26 days');
    expect(res.body.error).toContain('8 hours');
  });

  it('accepts a rate at the floor exactly', async () => {
    const { agent } = await agentFor('hamali_solo', '9880000002', { region: 'Visakhapatnam' });
    const res = await agent.put('/api/pricing/mine').send({
      categorySlug: 'electrician',
      modesOffered: ['hourly'],
      hourly: { rate: 64.46, minimumBlockHours: 2, travelIncluded: true },
    });
    expect(res.status).toBe(200);
  });

  it('refuses rather than quietly raising the rate to the floor', async () => {
    const { agent, user } = await agentFor('hamali_solo', '9880000003', { region: 'Visakhapatnam' });
    await agent.put('/api/pricing/mine').send({
      categorySlug: 'electrician',
      modesOffered: ['hourly'],
      hourly: { rate: 10, minimumBlockHours: 1, travelIncluded: true },
    });
    const { WorkerPricingProfile } = await import('../src/models/WorkerPricingProfile');
    // Nothing was written at all — there is no window in which an unlawful
    // rate is published, and no rate on the board the worker never chose.
    expect(await WorkerPricingProfile.countDocuments({ workerId: user._id })).toBe(0);
  });

  it('checks a per-task price as the wage it is, over the time the task takes', async () => {
    // P0.3: a fixed price is a wage for the time the task takes — the
    // worker's own estimate, or the service's standard duration when they
    // gave none. The refusal shows that conversion so it can be argued with.
    const { agent } = await agentFor('hamali_solo', '9880000004', { region: 'Visakhapatnam' });
    const cheap = await agent.put('/api/pricing/mine').send({
      categorySlug: 'electrician',
      modesOffered: ['per_task'],
      perTask: [{ taskName: 'Switch replacement', fixedPrice: 40 }],
    });
    expect(cheap.status).toBe(422);
    expect(cheap.body.error).toMatch(/₹40 for 60 minutes, this service's standard duration/);
    expect(cheap.body.error).toMatch(/Notification G\/3186486\/2026 dated 23 Mar 2026/);

    const quick = await agent.put('/api/pricing/mine').send({
      categorySlug: 'electrician',
      modesOffered: ['per_task'],
      perTask: [{ taskName: 'Switch replacement', fixedPrice: 40, estimatedDurationMinutes: 20 }],
    });
    expect(quick.status).toBe(200); // ₹40 for 20 minutes = ₹120 an hour
  });

  it('leaves a worker in a state with no notification alone', async () => {
    const { agent } = await agentFor('hamali_solo', '9880000005', { region: 'Pune' });
    const res = await agent.put('/api/pricing/mine').send({
      categorySlug: 'electrician',
      modesOffered: ['hourly'],
      hourly: { rate: 5, minimumBlockHours: 1, travelIncluded: true },
    });
    // A state with no row is one whose notification nobody has entered —
    // not a state with a floor of zero, and not a reason to borrow Andhra
    // Pradesh's figures.
    expect(res.status).toBe(200);
  });
});

describe('a society floor may not be a promise to underpay', () => {
  beforeEach(async () => {
    await seedApFloors();
  });

  it('refuses an hourly society floor set below the statutory minimum', async () => {
    const { agent, user: leader } = await agentFor('mutha_leader', '9880000010', { region: 'Visakhapatnam' });
    await Mutha.create({
      name: 'Test Society',
      leaderId: leader._id,
      memberIds: [],
      inviteCode: 'WAGE01',
      region: 'Visakhapatnam',
    });

    const res = await agent.put('/api/pricing/society/floors').send({
      categorySlug: 'electrician',
      mode: 'hourly',
      minimumRate: 40,
    });
    expect(res.status).toBe(422);
    expect(res.body.error).toContain('G/3186486/2026');
  });

  it('allows one above it', async () => {
    const { agent, user: leader } = await agentFor('mutha_leader', '9880000011', { region: 'Visakhapatnam' });
    await Mutha.create({
      name: 'Test Society 2',
      leaderId: leader._id,
      memberIds: [],
      inviteCode: 'WAGE02',
      region: 'Visakhapatnam',
    });

    const res = await agent.put('/api/pricing/society/floors').send({
      categorySlug: 'electrician',
      mode: 'hourly',
      minimumRate: 120,
    });
    expect(res.status).toBe(200);
  });
});

describe('reading the floors', () => {
  beforeEach(async () => {
    await seedApFloors();
  });

  it('is open to a worker, who is the person it protects', async () => {
    const { agent } = await agentFor('hamali_solo', '9880000020', { region: 'Visakhapatnam' });
    const res = await agent.get('/api/wage-floors?state=Andhra%20Pradesh');
    expect(res.status).toBe(200);
    expect(res.body.floors).toHaveLength(4);
    // The mapping is part of the answer: a worker needs to know which band
    // their trade was put in.
    expect(res.body.categorySkillBands.electrician).toBe('skilled');
  });

  it('publishes the divisors, so the hourly figure can be checked', async () => {
    const { agent } = await agentFor('customer', '9880000021');
    const res = await agent.get('/api/wage-floors/applicable?region=Visakhapatnam&categorySlug=electrician');
    expect(res.status).toBe(200);
    expect(res.body.floor.monthlyRate).toBe(13407);
    expect(res.body.floor.workingDaysPerMonth).toBe(26);
    expect(res.body.floor.workingHoursPerDay).toBe(8);
    expect(res.body.floor.hourlyRate).toBe(64.46);
    expect(res.body.skillBand).toBe('skilled');
  });

  it('says there is no floor rather than inventing one for an unknown region', async () => {
    const { agent } = await agentFor('customer', '9880000022');
    const res = await agent.get('/api/wage-floors/applicable?region=Nowhere');
    expect(res.status).toBe(200);
    expect(res.body.floor).toBeNull();
    expect(res.body.reason).toBe('region_not_in_a_known_state');
  });
});

describe('an admin publishing a new notification', () => {
  beforeEach(async () => {
    await seedApFloors();
  });

  it('supersedes the old row rather than overwriting it, and logs both', async () => {
    const { agent } = await agentFor('admin', '9880000030');
    const res = await agent.post('/api/admin/wage-floors').send({
      state: 'Andhra Pradesh',
      zone: 'zone_1',
      skillBand: 'skilled',
      monthlyRate: 14200,
      scheduledEmployment: 'Shops and Commercial Establishments',
      notificationNumber: 'G/9999999/2026',
      notificationDate: '2026-09-25',
      effectiveFrom: '2026-10-01',
      sourceType: 'gazette',
    });
    expect(res.status).toBe(201);
    // Derived server-side, never accepted from the caller, so a typo cannot
    // become the number the platform enforces.
    expect(res.body.floor.dailyRate).toBe(546.15);
    expect(res.body.floor.hourlyRate).toBe(68.27);

    // "What was the floor last April" is a question a dispute turns on.
    const all = await GovernmentWageFloor.find({ state: 'Andhra Pradesh', skillBand: 'skilled' }).lean();
    expect(all).toHaveLength(2);
    expect(all.filter((f) => f.active)).toHaveLength(1);

    expect(await AuditLog.countDocuments({ action: 'wage_floor_superseded' })).toBe(1);
    expect(await AuditLog.countDocuments({ action: 'wage_floor_published' })).toBe(1);
  });

  it('will not publish a floor with no notification number behind it', async () => {
    const { agent } = await agentFor('admin', '9880000031');
    const res = await agent.post('/api/admin/wage-floors').send({
      state: 'Kerala',
      zone: 'zone_1',
      skillBand: 'skilled',
      monthlyRate: 14000,
      scheduledEmployment: 'Shops',
      notificationDate: '2026-09-25',
      effectiveFrom: '2026-10-01',
      sourceType: 'gazette',
    });
    expect(res.status).toBe(400);
  });

  it('records which kind of source the figures came from', async () => {
    const { agent } = await agentFor('admin', '9880000032');
    const res = await agent.post('/api/admin/wage-floors').send({
      state: 'Telangana',
      zone: 'zone_1',
      skillBand: 'unskilled',
      monthlyRate: 12000,
      scheduledEmployment: 'Shops',
      notificationNumber: 'TS/1/2026',
      notificationDate: '2026-09-25',
      effectiveFrom: '2026-10-01',
      sourceType: 'secondary_compilation',
      sourceNote: 'Gazette PDF not retrievable; figures from a compliance compilation.',
    });
    expect(res.status).toBe(201);
    // A figure read out of the gazette and one transcribed from a vendor's
    // summary are not the same kind of fact.
    expect(res.body.floor.sourceType).toBe('secondary_compilation');
    expect(res.body.floor.sourceNote).toContain('not retrievable');
  });

  it('is closed to a manager and to a worker', async () => {
    const payload = {
      state: 'Kerala',
      zone: 'zone_1',
      skillBand: 'skilled',
      monthlyRate: 14000,
      scheduledEmployment: 'Shops',
      notificationNumber: 'KL/1/2026',
      notificationDate: '2026-09-25',
      effectiveFrom: '2026-10-01',
      sourceType: 'gazette',
    };
    const { agent: manager } = await agentFor('manager', '9880000033');
    expect((await manager.post('/api/admin/wage-floors').send(payload)).status).toBe(403);
    const { agent: worker } = await agentFor('hamali_solo', '9880000034');
    expect((await worker.post('/api/admin/wage-floors').send(payload)).status).toBe(403);
  });
});
