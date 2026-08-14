import './setup';
import { Request, Response } from 'express';
import { User } from '../src/models/User';
import { requireRole, requirePermission } from '../src/middleware/rbac';

function mockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('requireRole', () => {
  it('calls next() when role matches', () => {
    const req = { user: { id: 'x', role: 'admin' } } as unknown as Request;
    const next = jest.fn();
    requireRole('admin')(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects with 403 when role does not match', () => {
    const req = { user: { id: 'x', role: 'customer' } } as unknown as Request;
    const next = jest.fn();
    requireRole('admin')(req, mockRes(), next);
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(403);
  });
});

describe('requirePermission', () => {
  it('allows admin regardless of stored permissions', async () => {
    const admin = await User.create({
      name: 'A',
      phone: '1000000001',
      passwordHash: 'x',
      role: 'admin',
    });
    const req = { user: { id: admin._id.toString(), role: 'admin' } } as unknown as Request;
    const next = jest.fn();
    await requirePermission('edit_fare_rules')(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects manager missing the specific permission, even if role is manager', async () => {
    const manager = await User.create({
      name: 'M',
      phone: '1000000002',
      passwordHash: 'x',
      role: 'manager',
      permissions: ['verify_kyc'],
    });
    const req = { user: { id: manager._id.toString(), role: 'manager' } } as unknown as Request;
    const next = jest.fn();
    await requirePermission('edit_fare_rules')(req, mockRes(), next);
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(403);
  });

  it('allows manager holding the specific permission', async () => {
    const manager = await User.create({
      name: 'M2',
      phone: '1000000003',
      passwordHash: 'x',
      role: 'manager',
      permissions: ['edit_fare_rules'],
    });
    const req = { user: { id: manager._id.toString(), role: 'manager' } } as unknown as Request;
    const next = jest.fn();
    await requirePermission('edit_fare_rules')(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });
});
