import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { AuditLog } from '../src/models/AuditLog';
import { signAccessToken } from '../src/services/token.service';

// Mints the accessToken cookie directly via the token service rather than
// calling POST /api/auth/login. This file is about admin AUTHORIZATION
// logic, not the login flow itself (that's covered by auth.test.ts) — going
// through the real HTTP login endpoint here would burn against the shared
// per-file authLimiter bucket (5/min, module-scoped per test file) on every
// single test, which doesn't scale as more admin tests get added and has
// nothing to do with what this file is actually testing.
async function loginAsAdmin(phoneSuffix = '9111111111') {
  const passwordHash = await bcrypt.hash('AdminPass1!', 12);
  const admin = await User.create({
    name: 'Root Admin',
    phone: phoneSuffix,
    passwordHash,
    role: 'admin',
  });
  const agent = request.agent(app);
  const accessToken = signAccessToken({ id: admin._id.toString(), role: 'admin' });
  agent.jar.setCookie(`accessToken=${accessToken}`);
  return { agent, admin };
}

describe('admin users/managers', () => {
  it('lets admin create a manager with scoped permissions', async () => {
    const { agent } = await loginAsAdmin();
    const res = await agent.post('/api/admin/managers').send({
      name: 'Manager One',
      phone: '9222222222',
      password: 'ManagerPass1!',
      permissions: ['verify_kyc', 'manage_region:Visakhapatnam'],
    });
    expect(res.status).toBe(201);
    expect(res.body.manager.permissions).toContain('verify_kyc');
  });

  it('lets admin reassign a user role and writes an audit log entry', async () => {
    const { agent } = await loginAsAdmin();
    const passwordHash = await bcrypt.hash('Passw0rd!', 12);
    const customer = await User.create({
      name: 'Cust',
      phone: '9333333333',
      passwordHash,
      role: 'customer',
    });

    const res = await agent.patch(`/api/admin/users/${customer._id}/role`).send({ role: 'hamali_solo' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('hamali_solo');

    const logs = await AuditLog.find({ targetId: customer._id, action: 'role_change' });
    expect(logs.length).toBe(1);
  });

  it('lets admin suspend a user', async () => {
    const { agent } = await loginAsAdmin();
    const passwordHash = await bcrypt.hash('Passw0rd!', 12);
    const customer = await User.create({
      name: 'Cust2',
      phone: '9333333334',
      passwordHash,
      role: 'customer',
    });
    const res = await agent.patch(`/api/admin/users/${customer._id}/status`).send({ status: 'suspended' });
    expect(res.status).toBe(200);
    expect(res.body.user.accountStatus).toBe('suspended');
  });

  it('rejects a non-admin (customer) hitting admin routes', async () => {
    const passwordHash = await bcrypt.hash('Passw0rd!', 12);
    await User.create({ name: 'C', phone: '9444444444', passwordHash, role: 'customer' });
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ phone: '9444444444', password: 'Passw0rd!' });

    const res = await agent.get('/api/admin/users');
    expect(res.status).toBe(403);
  });

  it('rejects a manager without create-manager privilege from creating another manager', async () => {
    const passwordHash = await bcrypt.hash('Passw0rd!', 12);
    await User.create({
      name: 'Mgr',
      phone: '9555555555',
      passwordHash,
      role: 'manager',
      permissions: ['verify_kyc'],
    });
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ phone: '9555555555', password: 'Passw0rd!' });

    const res = await agent.post('/api/admin/managers').send({
      name: 'New Mgr',
      phone: '9666666666',
      password: 'Passw0rd!',
      permissions: ['verify_kyc'],
    });
    expect(res.status).toBe(403);
  });

  it('rejects an arbitrary/unknown permission string on manager creation', async () => {
    const { agent } = await loginAsAdmin();
    const res = await agent.post('/api/admin/managers').send({
      name: 'Bad Perm Mgr',
      phone: '9777777777',
      password: 'Passw0rd!',
      permissions: ['not_a_real_permission'],
    });
    expect(res.status).toBe(400);
    const created = await User.findOne({ phone: '9777777777' });
    expect(created).toBeNull();
  });

  it('refuses to change an admin target account role or status, even for a different admin actor', async () => {
    const targetPasswordHash = await bcrypt.hash('TargetAdminPass1!', 12);
    const targetAdmin = await User.create({
      name: 'Target Admin',
      phone: '9888888888',
      passwordHash: targetPasswordHash,
      role: 'admin',
    });
    const { agent } = await loginAsAdmin();

    const roleRes = await agent.patch(`/api/admin/users/${targetAdmin._id}/role`).send({ role: 'customer' });
    expect(roleRes.status).toBe(400);

    const statusRes = await agent
      .patch(`/api/admin/users/${targetAdmin._id}/status`)
      .send({ status: 'suspended' });
    expect(statusRes.status).toBe(400);

    const reloaded = await User.findById(targetAdmin._id);
    expect(reloaded?.role).toBe('admin');
    expect(reloaded?.accountStatus).toBe('active');
  });

  it('soft-deletes a user via DELETE, marking status deleted and writing an audit entry', async () => {
    const { agent } = await loginAsAdmin();
    const passwordHash = await bcrypt.hash('Passw0rd!', 12);
    const customer = await User.create({
      name: 'ToDelete',
      phone: '9999999999',
      passwordHash,
      role: 'customer',
    });

    const res = await agent.delete(`/api/admin/users/${customer._id}`);
    expect(res.status).toBe(200);
    expect(res.body.user.accountStatus).toBe('deleted');

    const reloaded = await User.findById(customer._id);
    expect(reloaded?.accountStatus).toBe('deleted');

    const logs = await AuditLog.find({ targetId: customer._id, action: 'status_change' });
    expect(logs.length).toBe(1);
  });
});
