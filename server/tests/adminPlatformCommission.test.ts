import './setup';
import request from 'supertest';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { PlatformSetting, PLATFORM_SETTING_ID } from '../src/models/PlatformSetting';
import { AuditLog } from '../src/models/AuditLog';
import { signAccessToken } from '../src/services/token.service';

/**
 * The platform commission had no writer at all. The only thing that ever
 * created its settings row was the parametric kill switch's upsert, which
 * stamped it with whatever the schema default happened to be — so a deploy
 * that lowered the rate could leave the old one silently in force with no
 * way to see or correct it from inside the product.
 */
async function agentFor(role: string, phone: string) {
  const user = await User.create({ name: 'U', phone, passwordHash: 'x', role });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: role as never })}`);
  return { agent, user };
}

describe('/api/admin/platform-commission', () => {
  it('reports the default when nothing has ever been stored', async () => {
    const { agent } = await agentFor('admin', '9870000001');
    const res = await agent.get('/api/admin/platform-commission');
    expect(res.status).toBe(200);
    expect(res.body.effectivePct).toBe(1);
    expect(res.body.storedPct).toBeNull();
    expect(res.body.defaultPct).toBe(1);
  });

  it('lets an admin change the forward rate, and audit-logs it', async () => {
    const { agent, user } = await agentFor('admin', '9870000002');
    const res = await agent.patch('/api/admin/platform-commission').send({ pct: 2.5 });
    expect(res.status).toBe(200);
    expect(res.body.effectivePct).toBe(2.5);

    const stored = await PlatformSetting.findById(PLATFORM_SETTING_ID).lean();
    expect(stored?.platformCommissionPct).toBe(2.5);

    const log = await AuditLog.findOne({ action: 'platform_commission_changed' }).lean();
    expect(log).toBeTruthy();
    expect(log?.actorId.toString()).toBe(user._id.toString());
    expect(log?.details).toMatchObject({ before: 1, after: 2.5 });
  });

  it('refuses a rate outside 0-100', async () => {
    const { agent } = await agentFor('admin', '9870000003');
    expect((await agent.patch('/api/admin/platform-commission').send({ pct: -1 })).status).toBe(400);
    expect((await agent.patch('/api/admin/platform-commission').send({ pct: 101 })).status).toBe(400);
  });

  it('is closed to a manager, who has no pricing permission of any kind', async () => {
    const { agent } = await agentFor('manager', '9870000004');
    expect((await agent.get('/api/admin/platform-commission')).status).toBe(403);
    expect((await agent.patch('/api/admin/platform-commission').send({ pct: 5 })).status).toBe(403);
  });

  it('is closed to a worker', async () => {
    const { agent } = await agentFor('hamali_solo', '9870000005');
    expect((await agent.patch('/api/admin/platform-commission').send({ pct: 0 })).status).toBe(403);
  });
});
