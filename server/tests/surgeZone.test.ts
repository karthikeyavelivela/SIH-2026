import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { SurgeZone } from '../src/models/SurgeZone';
import { signAccessToken } from '../src/services/token.service';

async function loginAs(role: string, phone: string, permissions: string[] = []) {
  const passwordHash = await bcrypt.hash('x', 10);
  const user = await User.create({ name: 'U', phone, passwordHash, role, permissions });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: role as never })}`);
  return { agent, user };
}

describe('POST /api/admin/surge-zones', () => {
  it('a manager without edit_fare_rules is blocked', async () => {
    const { agent } = await loginAs('manager', '9992000001', ['view_analytics']);
    const res = await agent.post('/api/admin/surge-zones').send({ name: 'Zone A', multiplier: 1.5, durationMinutes: 60 });
    expect(res.status).toBe(403);
  });

  it('creates a manual surge zone with a real expiresAt derived from durationMinutes', async () => {
    const { agent } = await loginAs('admin', '9992000002');
    const before = Date.now();
    const res = await agent.post('/api/admin/surge-zones').send({ name: 'Zone B', multiplier: 1.8, durationMinutes: 30 });
    expect(res.status).toBe(201);
    expect(res.body.zone.isManual).toBe(true);
    const expiresAt = new Date(res.body.zone.expiresAt).getTime();
    expect(expiresAt).toBeGreaterThan(before + 29 * 60_000);
    expect(expiresAt).toBeLessThan(before + 31 * 60_000);
  });

  it('rejects a multiplier above the platform cap', async () => {
    const { agent } = await loginAs('admin', '9992000003');
    const res = await agent.post('/api/admin/surge-zones').send({ name: 'Too High', multiplier: 5, durationMinutes: 30 });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/admin/surge-zones and PATCH .../end', () => {
  it('lists only unexpired zones as active, expired ones separately', async () => {
    const { agent, user: admin } = await loginAs('admin', '9992000004');
    await SurgeZone.create({ name: 'Active', multiplier: 1.5, expiresAt: new Date(Date.now() + 60_000), isManual: true, createdBy: admin._id });
    await SurgeZone.create({ name: 'Expired', multiplier: 1.5, expiresAt: new Date(Date.now() - 60_000), isManual: true, createdBy: admin._id });

    const res = await agent.get('/api/admin/surge-zones');
    expect(res.status).toBe(200);
    expect(res.body.active).toHaveLength(1);
    expect(res.body.active[0].name).toBe('Active');
    expect(res.body.recentExpired).toHaveLength(1);
  });

  it('ending a zone sets expiresAt to now, immediately deactivating it', async () => {
    const { agent, user: admin } = await loginAs('admin', '9992000005');
    const zone = await SurgeZone.create({ name: 'ToEnd', multiplier: 1.5, expiresAt: new Date(Date.now() + 60 * 60_000), isManual: true, createdBy: admin._id });

    const res = await agent.patch(`/api/admin/surge-zones/${zone._id}/end`);
    expect(res.status).toBe(200);
    expect(new Date(res.body.zone.expiresAt).getTime()).toBeLessThanOrEqual(Date.now());
  });
});
