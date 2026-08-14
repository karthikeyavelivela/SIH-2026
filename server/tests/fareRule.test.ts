import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { FareRule } from '../src/models/FareRule';

async function loginAsAdmin() {
  const passwordHash = await bcrypt.hash('AdminPass1!', 12);
  const admin = await User.create({ name: 'Admin', phone: '9800000001', passwordHash, role: 'admin' });
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ phone: '9800000001', password: 'AdminPass1!' });
  return agent;
}

describe('fare rule admin CRUD', () => {
  it('lets admin create, list, update, and deactivate a fare rule', async () => {
    const agent = await loginAsAdmin();

    const create = await agent.post('/api/admin/fare-rules').send({
      region: 'Visakhapatnam',
      category: 'vehicle_small',
      baseFare: 150,
      perKmRate: 18,
      minimumFare: 250,
    });
    expect(create.status).toBe(201);
    const ruleId = create.body.fareRule._id;

    const list = await agent.get('/api/admin/fare-rules?region=Visakhapatnam');
    expect(list.status).toBe(200);
    expect(list.body.fareRules.length).toBe(1);

    const update = await agent.patch(`/api/admin/fare-rules/${ruleId}`).send({ baseFare: 175 });
    expect(update.status).toBe(200);
    expect(update.body.fareRule.baseFare).toBe(175);

    const deactivate = await agent.patch(`/api/admin/fare-rules/${ruleId}`).send({ active: false });
    expect(deactivate.status).toBe(200);
    expect(deactivate.body.fareRule.active).toBe(false);
  });

  it('rejects a non-admin from creating a fare rule', async () => {
    const passwordHash = await bcrypt.hash('Passw0rd!', 12);
    await User.create({ name: 'C', phone: '9800000002', passwordHash, role: 'customer' });
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ phone: '9800000002', password: 'Passw0rd!' });

    const res = await agent.post('/api/admin/fare-rules').send({
      region: 'Test',
      category: 'vehicle_small',
      baseFare: 100,
      perKmRate: 10,
      minimumFare: 200,
    });
    expect(res.status).toBe(403);
  });

  it('validates category against the known enum', async () => {
    const agent = await loginAsAdmin();
    const res = await agent.post('/api/admin/fare-rules').send({
      region: 'Test',
      category: 'not_a_real_category',
      baseFare: 100,
      perKmRate: 10,
      minimumFare: 200,
    });
    expect(res.status).toBe(400);
  });

  it('creating a second active fare rule for the same region+category supersedes (deactivates) the first, leaving only one active', async () => {
    const agent = await loginAsAdmin();

    const first = await agent.post('/api/admin/fare-rules').send({
      region: 'Guntur',
      category: 'vehicle_medium',
      baseFare: 300,
      perKmRate: 20,
      minimumFare: 400,
    });
    expect(first.status).toBe(201);
    const firstId = first.body.fareRule._id;

    const second = await agent.post('/api/admin/fare-rules').send({
      region: 'Guntur',
      category: 'vehicle_medium',
      baseFare: 350,
      perKmRate: 22,
      minimumFare: 450,
    });
    expect(second.status).toBe(201);

    // Task 6's booking-creation lookup depends on there being at most one
    // active rule per region+category — this is the invariant that guards it.
    const activeRules = await FareRule.find({ region: 'Guntur', category: 'vehicle_medium', active: true });
    expect(activeRules.length).toBe(1);
    expect(activeRules[0]._id.toString()).toBe(second.body.fareRule._id);

    const firstReloaded = await FareRule.findById(firstId);
    expect(firstReloaded?.active).toBe(false);
  });
});
