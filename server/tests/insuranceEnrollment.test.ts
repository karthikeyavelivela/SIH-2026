import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { InsurancePlan } from '../src/models/InsurancePlan';
import { InsurancePolicy } from '../src/models/InsurancePolicy';
import { ParametricTrigger } from '../src/models/ParametricTrigger';
import { Payout } from '../src/models/Payout';
import { signAccessToken } from '../src/services/token.service';

async function loginAs(role: string, phone: string) {
  const passwordHash = await bcrypt.hash('Passw0rd!', 12);
  const user = await User.create({ name: 'U', phone, passwordHash, role });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: role as never })}`);
  return { agent, user };
}

async function loginAsAdmin(phone: string) {
  return loginAs('admin', phone);
}

async function makeParametricPlan(overrides: Partial<Record<string, unknown>> = {}) {
  return InsurancePlan.create({
    name: 'Income Protection',
    type: 'parametric',
    category: 'work_compensation',
    coverageAmount: 2500,
    description: 'x',
    forRoles: ['driver'],
    premium: 100,
    active: true,
    defaultTrigger: { condition: 'earnings_below_threshold', thresholdValue: 8000, periodDays: 30, payoutAmount: 2500 },
    ...overrides,
  });
}

describe('GET /api/insurance/plans + POST /api/insurance/enroll (Phase 3.2)', () => {
  it('lists only plans available to the caller\'s role', async () => {
    const { agent } = await loginAs('driver', '9870000001');
    await makeParametricPlan();
    await makeParametricPlan({ name: 'Customer-only plan', forRoles: ['customer'] });

    const res = await agent.get('/api/insurance/plans');
    expect(res.status).toBe(200);
    expect(res.body.plans).toHaveLength(1);
    expect(res.body.plans[0].name).toBe('Income Protection');
  });

  it('enrolling creates both a policy AND a real ParametricTrigger from the plan defaults', async () => {
    const { agent, user } = await loginAs('driver', '9870000002');
    const plan = await makeParametricPlan();

    const res = await agent.post('/api/insurance/enroll').send({ planId: plan._id, consent: true });
    expect(res.status).toBe(201);
    expect(res.body.trigger).toBeTruthy();
    expect(res.body.trigger.thresholdValue).toBe(8000);

    const policy = await InsurancePolicy.findOne({ userId: user._id, planId: plan._id });
    expect(policy?.status).toBe('active');
    const trigger = await ParametricTrigger.findOne({ policyId: policy!._id });
    expect(trigger).not.toBeNull();
    expect(trigger!.payoutAmount).toBe(2500);
  });

  it('rejects enrolling without explicit consent (400)', async () => {
    const { agent } = await loginAs('driver', '9870000003');
    const plan = await makeParametricPlan();
    const res = await agent.post('/api/insurance/enroll').send({ planId: plan._id, consent: false });
    expect(res.status).toBe(400);
  });

  it('rejects a second enrolment into a plan already actively held (409)', async () => {
    const { agent } = await loginAs('driver', '9870000004');
    const plan = await makeParametricPlan();
    await agent.post('/api/insurance/enroll').send({ planId: plan._id, consent: true });
    const second = await agent.post('/api/insurance/enroll').send({ planId: plan._id, consent: true });
    expect(second.status).toBe(409);
  });

  it('rejects enrolling in a plan not offered to the caller\'s role (404)', async () => {
    const { agent } = await loginAs('hamali_solo', '9870000005');
    const plan = await makeParametricPlan(); // forRoles: ['driver']
    const res = await agent.post('/api/insurance/enroll').send({ planId: plan._id, consent: true });
    expect(res.status).toBe(404);
  });

  // This whole router used to hard-gate to WORKER_ROLES
  // (driver/hamali_solo/mutha_member) at the RBAC layer, so customer,
  // mutha_leader, fleet_owner, and warehouse_hub 403'd before ever
  // reaching a controller that was already written role-agnostically —
  // InsurancePlan.forRoles' own schema enum always supported all of them.
  // Real bug, found via a live production check (customer's own insurance
  // page returned "Could not load your insurance details"), not just a
  // theoretical gap.
  it('a customer can list, enrol in, and read back their own cargo/stock coverage — not just worker roles', async () => {
    const { agent } = await loginAs('customer', '9870000006');
    const plan = await InsurancePlan.create({
      name: 'Customer Goods Protection',
      type: 'standard',
      category: 'cargo_transit',
      coverageAmount: 50000,
      description: 'x',
      forRoles: ['customer'],
      premium: 29,
      active: true,
    });

    const listRes = await agent.get('/api/insurance/plans');
    expect(listRes.status).toBe(200);
    expect(listRes.body.plans).toHaveLength(1);

    const enrollRes = await agent.post('/api/insurance/enroll').send({ planId: plan._id, consent: true });
    expect(enrollRes.status).toBe(201);

    const meRes = await agent.get('/api/insurance/me');
    expect(meRes.status).toBe(200);
    expect(meRes.body.policies).toHaveLength(1);
  });

  it.each([
    ['mutha_leader', '9870000007'],
    ['fleet_owner', '9870000008'],
    ['warehouse_hub', '9870000009'],
  ])(
    '%s can also reach their own insurance endpoints (not just driver/hamali_solo/mutha_member)',
    async (role, phone) => {
      const { agent } = await loginAs(role, phone);
      const res = await agent.get('/api/insurance/plans');
      expect(res.status).toBe(200);
    }
  );
});

describe('admin insurance plan CRUD (Phase 3.5)', () => {
  it('rejects creating a parametric plan with no defaultTrigger (400) — would enrol someone into a payout that can never fire', async () => {
    const { agent } = await loginAsAdmin('9870099991');
    const res = await agent.post('/api/admin/insurance/plans').send({
      name: 'Bad Plan',
      type: 'parametric',
      category: 'work_compensation',
      coverageAmount: 1000,
      description: 'x',
      forRoles: ['driver'],
      premium: 50,
    });
    expect(res.status).toBe(400);
  });

  it('creates a real parametric plan with defaultTrigger, and it appears in GET /api/admin/insurance/plans', async () => {
    const { agent } = await loginAsAdmin('9870099992');
    const create = await agent.post('/api/admin/insurance/plans').send({
      name: 'Good Plan',
      type: 'parametric',
      category: 'work_compensation',
      coverageAmount: 1000,
      description: 'x',
      forRoles: ['driver'],
      premium: 50,
      defaultTrigger: { condition: 'earnings_below_threshold', thresholdValue: 5000, periodDays: 30, payoutAmount: 1000 },
    });
    expect(create.status).toBe(201);

    const list = await agent.get('/api/admin/insurance/plans');
    expect(list.body.plans.map((p: { name: string }) => p.name)).toContain('Good Plan');
  });

  it('blocks a non-admin from creating a plan (403)', async () => {
    const { agent } = await loginAs('driver', '9870099993');
    const res = await agent.post('/api/admin/insurance/plans').send({
      name: 'x', type: 'standard', category: 'work_compensation', coverageAmount: 1, description: 'x', forRoles: ['driver'], premium: 1,
    });
    expect(res.status).toBe(403);
  });
});

describe('DB-backed kill switch actually blocks disbursement (Phase 3.5 / 1.4)', () => {
  it('toggling the switch off via the admin endpoint routes the next trigger to pending, not paid', async () => {
    const { agent: adminAgent } = await loginAsAdmin('9870099994');
    const { agent: driverAgent, user: driver } = await loginAs('driver', '9870000006');
    const plan = await makeParametricPlan({ defaultTrigger: { condition: 'earnings_below_threshold', thresholdValue: 999_999, periodDays: 30, payoutAmount: 500 } });
    await driverAgent.post('/api/insurance/enroll').send({ planId: plan._id, consent: true });

    const toggle = await adminAgent.patch('/api/admin/insurance/kill-switch').send({ enabled: false });
    expect(toggle.status).toBe(200);

    const me = await driverAgent.get('/api/insurance/me');
    expect(me.status).toBe(200);
    const fired = me.body.parametricTriggers.find((t: { triggered: boolean }) => t.triggered);
    expect(fired).toBeTruthy();
    expect(fired.payoutFailureReason).toMatch(/kill switch/i);

    const payout = await Payout.findOne({ userId: driver._id, source: 'parametric_insurance' });
    expect(payout?.status).toBe('pending');

    // Re-enable so this doesn't leak into another test file's run.
    await adminAgent.patch('/api/admin/insurance/kill-switch').send({ enabled: true });
  });

  it('GET /api/admin/insurance/payout-monitor reports today\'s total against the daily cap', async () => {
    const { agent } = await loginAsAdmin('9870099995');
    const res = await agent.get('/api/admin/insurance/payout-monitor');
    expect(res.status).toBe(200);
    expect(typeof res.body.todayTotal).toBe('number');
    expect(typeof res.body.dailyCap).toBe('number');
    expect(typeof res.body.envKillSwitchEnabled).toBe('boolean');
    expect(typeof res.body.dbKillSwitchEnabled).toBe('boolean');
  });
});
