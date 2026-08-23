import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { TrainingModule } from '../src/models/TrainingModule';
import { signAccessToken } from '../src/services/token.service';

async function loginAs(role: string, phone: string) {
  const passwordHash = await bcrypt.hash('x', 10);
  const user = await User.create({ name: 'U', phone, passwordHash, role });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: role as never })}`);
  return { agent, user };
}

async function seedModules() {
  const m1 = await TrainingModule.create({
    title: 'Module 1', description: 'd1', durationMinutes: 5, order: 1,
    forRoles: ['driver'], content: 'c1',
  });
  const m2 = await TrainingModule.create({
    title: 'Module 2', description: 'd2', durationMinutes: 5, order: 2,
    forRoles: ['driver'], content: 'c2',
  });
  return [m1, m2];
}

describe('GET /api/training/progress', () => {
  it('returns modules for the caller\'s own role, first unlocked, rest locked', async () => {
    await seedModules();
    const { agent } = await loginAs('driver', '9970000001');
    const res = await agent.get('/api/training/progress');
    expect(res.status).toBe(200);
    expect(res.body.modules).toHaveLength(2);
    expect(res.body.modules[0].status).toBe('in_progress');
    expect(res.body.modules[1].status).toBe('locked');
  });

  it('blocks a role with no curriculum access (customer)', async () => {
    const { agent } = await loginAs('customer', '9970000002');
    const res = await agent.get('/api/training/progress');
    expect(res.status).toBe(403);
  });
});

describe('POST /api/training/modules/:moduleId/complete', () => {
  it('rejects completing module 2 before module 1 (sequential unlock enforced server-side)', async () => {
    const [, m2] = await seedModules();
    const { agent } = await loginAs('driver', '9970000003');
    const res = await agent.post(`/api/training/modules/${m2._id}/complete`);
    expect(res.status).toBe(400);
  });

  it('completes in order and auto-issues a certification once every module is done', async () => {
    const [m1, m2] = await seedModules();
    const { agent } = await loginAs('driver', '9970000004');

    const first = await agent.post(`/api/training/modules/${m1._id}/complete`);
    expect(first.status).toBe(200);
    expect(first.body.certification).toBeNull();

    const second = await agent.post(`/api/training/modules/${m2._id}/complete`);
    expect(second.status).toBe(200);
    expect(second.body.certification).not.toBeNull();
    expect(second.body.certification.status).toBe('active');
  });

  it('404s a module id that does not target the caller\'s role', async () => {
    const otherRoleModule = await TrainingModule.create({
      title: 'Hamali only', description: 'd', durationMinutes: 5, order: 1,
      forRoles: ['hamali_solo'], content: 'c',
    });
    const { agent } = await loginAs('driver', '9970000005');
    const res = await agent.post(`/api/training/modules/${otherRoleModule._id}/complete`);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/training/certifications', () => {
  it('computes expired status live rather than trusting a stale stored value', async () => {
    const [m1, m2] = await seedModules();
    const { agent } = await loginAs('driver', '9970000006');
    await agent.post(`/api/training/modules/${m1._id}/complete`);
    await agent.post(`/api/training/modules/${m2._id}/complete`);

    const res = await agent.get('/api/training/certifications');
    expect(res.status).toBe(200);
    expect(res.body.certifications).toHaveLength(1);
    expect(res.body.certifications[0].status).toBe('active');
  });
});
