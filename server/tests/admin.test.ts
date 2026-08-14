import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { AuditLog } from '../src/models/AuditLog';

async function loginAsAdmin() {
  const passwordHash = await bcrypt.hash('AdminPass1!', 12);
  const admin = await User.create({
    name: 'Root Admin',
    phone: '9111111111',
    passwordHash,
    role: 'admin',
  });
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ phone: '9111111111', password: 'AdminPass1!' });
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
});
