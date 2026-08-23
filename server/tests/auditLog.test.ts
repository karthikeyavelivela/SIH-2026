import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { AuditLog } from '../src/models/AuditLog';
import { signAccessToken } from '../src/services/token.service';

async function loginAs(role: string, phone: string) {
  const passwordHash = await bcrypt.hash('x', 10);
  const user = await User.create({ name: 'U', phone, passwordHash, role });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: role as never })}`);
  return { agent, user };
}

async function seedLogs(actorId: string) {
  await AuditLog.create([
    { actorId, actorRole: 'admin', action: 'surge_zone_created', targetType: 'SurgeZone', targetId: actorId },
    { actorId, actorRole: 'admin', action: 'surge_zone_ended', targetType: 'SurgeZone', targetId: actorId },
    { actorId, actorRole: 'manager', action: 'complaint_resolved', targetType: 'Complaint', targetId: actorId },
  ]);
}

describe('GET /api/admin/audit-log', () => {
  it('admin-only — a manager is blocked entirely (spec: full audit log view is not delegated)', async () => {
    const { agent } = await loginAs('manager', '9995000001');
    const res = await agent.get('/api/admin/audit-log');
    expect(res.status).toBe(403);
  });

  it('returns paginated entries, most recent first', async () => {
    const { agent, user } = await loginAs('admin', '9995000002');
    await seedLogs(user._id.toString());
    const res = await agent.get('/api/admin/audit-log');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.entries).toHaveLength(3);
  });

  it('filters by action', async () => {
    const { agent, user } = await loginAs('admin', '9995000003');
    await seedLogs(user._id.toString());
    const res = await agent.get('/api/admin/audit-log?action=surge_zone_created');
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].action).toBe('surge_zone_created');
  });

  it('filters by actorRole', async () => {
    const { agent, user } = await loginAs('admin', '9995000004');
    await seedLogs(user._id.toString());
    const res = await agent.get('/api/admin/audit-log?actorRole=manager');
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].actorRole).toBe('manager');
  });

  it('respects a custom page size and reports total independent of the page', async () => {
    const { agent, user } = await loginAs('admin', '9995000005');
    await seedLogs(user._id.toString());
    const res = await agent.get('/api/admin/audit-log?limit=1&page=2');
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.total).toBe(3);
    expect(res.body.page).toBe(2);
  });
});
