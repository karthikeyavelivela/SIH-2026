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
});
