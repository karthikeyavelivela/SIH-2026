import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { signAccessToken } from '../src/services/token.service';

async function loginAs(role: string, phone: string) {
  const passwordHash = await bcrypt.hash('x', 10);
  const user = await User.create({ name: 'U', phone, passwordHash, role });
  const agent = request.agent(app);
  const accessToken = signAccessToken({ id: user._id.toString(), role: role as never });
  agent.jar.setCookie(`accessToken=${accessToken}`);
  return { agent, user };
}

describe('POST /api/admin/regions', () => {
  it('launches a new region', async () => {
    const { agent } = await loginAs('admin', '9950000001');
    const res = await agent.post('/api/admin/regions').send({ name: 'Vijayawada' });
    expect(res.status).toBe(201);
    expect(res.body.region.enabled).toBe(true);
  });

  it('rejects a duplicate region name (409)', async () => {
    const { agent } = await loginAs('admin', '9950000002');
    await agent.post('/api/admin/regions').send({ name: 'Guntur' });
    const res = await agent.post('/api/admin/regions').send({ name: 'Guntur' });
    expect(res.status).toBe(409);
  });

  it('is forbidden for a non-admin role', async () => {
    const { agent } = await loginAs('manager', '9950000003');
    const res = await agent.post('/api/admin/regions').send({ name: 'Tirupati' });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/admin/regions/:id', () => {
  it('disables and re-enables a region', async () => {
    const { agent } = await loginAs('admin', '9950000004');
    const created = await agent.post('/api/admin/regions').send({ name: 'Kakinada' });

    const disabled = await agent.patch(`/api/admin/regions/${created.body.region._id}`).send({ enabled: false });
    expect(disabled.status).toBe(200);
    expect(disabled.body.region.enabled).toBe(false);

    const listed = await agent.get('/api/admin/regions');
    expect(listed.body.regions.find((r: { name: string }) => r.name === 'Kakinada').enabled).toBe(false);
  });
});

describe('GET /api/admin/audit-log', () => {
  it('lists entries created by admin actions, filterable by action', async () => {
    const { agent } = await loginAs('admin', '9950000005');
    await agent.post('/api/admin/regions').send({ name: 'Rajahmundry' });

    const res = await agent.get('/api/admin/audit-log?action=region_launched');
    expect(res.status).toBe(200);
    expect(res.body.entries.length).toBeGreaterThanOrEqual(1);
    expect(res.body.entries[0].action).toBe('region_launched');
  });

  it('is forbidden for a manager (Admin-only, no permission carve-out)', async () => {
    const { agent } = await loginAs('manager', '9950000006');
    const res = await agent.get('/api/admin/audit-log');
    expect(res.status).toBe(403);
  });
});
