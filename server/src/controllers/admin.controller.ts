import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { publicUser } from '../utils/publicUser';
import { rethrowAsConflict } from '../utils/mongoErrors';
import { User } from '../models/User';
import { writeAuditLog } from '../services/audit.service';

const BCRYPT_COST = 12;

export const listManagers = asyncHandler(async (_req: Request, res: Response) => {
  const managers = await User.find({ role: 'manager' }).sort({ createdAt: -1 });
  res.status(200).json({ managers: managers.map(publicUser) });
});

export const createManager = asyncHandler(async (req: Request, res: Response) => {
  const { name, phone, password, permissions } = req.body;
  const existing = await User.findOne({ phone });
  if (existing) throw new ApiError(409, 'Phone already registered');

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  let manager;
  try {
    manager = await User.create({
      name,
      phone,
      passwordHash,
      role: 'manager',
      permissions: permissions ?? [],
    });
  } catch (err) {
    rethrowAsConflict(err, 'Phone number');
  }

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'manager_created',
    targetType: 'User',
    targetId: manager._id.toString(),
    details: { permissions: manager.permissions },
  });

  res.status(201).json({ manager: publicUser(manager) });
});

export const updateManagerPermissions = asyncHandler(async (req: Request, res: Response) => {
  const { permissions } = req.body;
  const manager = await User.findOne({ _id: req.params.id, role: 'manager' });
  if (!manager) throw new ApiError(404, 'Manager not found');

  const before = manager.permissions;
  manager.permissions = permissions;
  await manager.save();

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'manager_permissions_updated',
    targetType: 'User',
    targetId: manager._id.toString(),
    details: { before, after: permissions },
  });

  res.status(200).json({ manager: publicUser(manager) });
});

// Escapes regex metacharacters so `search` is matched as a literal substring,
// not interpreted as a pattern — closes a ReDoS/CPU-exhaustion vector where
// an adversarial pattern (nested quantifiers/alternation) run against every
// name/phone value in the collection would multiply scan cost. The route
// also caps `search` length (see admin.routes.ts) as a second guard.
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const listUsers = asyncHandler(async (req: Request, res: Response) => {
  const { search, role, page = '1', limit = '20' } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = { role: { $nin: ['admin', 'manager'] } };
  if (role) filter.role = role;
  if (search) {
    const pattern = escapeRegex(search);
    filter.$or = [
      { name: { $regex: pattern, $options: 'i' } },
      { phone: { $regex: pattern, $options: 'i' } },
    ];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    User.countDocuments(filter),
  ]);

  res.status(200).json({ users: users.map(publicUser), total, page: pageNum, limit: limitNum });
});

export const updateUserRole = asyncHandler(async (req: Request, res: Response) => {
  const { role } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'User not found');
  if (user.role === 'admin') throw new ApiError(400, 'Cannot change an admin account role via this endpoint');

  const before = user.role;
  user.role = role;
  await user.save();

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'role_change',
    targetType: 'User',
    targetId: user._id.toString(),
    details: { before, after: role },
  });

  res.status(200).json({ user: publicUser(user) });
});

export const updateUserStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'User not found');
  if (user.role === 'admin') throw new ApiError(400, 'Cannot change an admin account status via this endpoint');

  const before = user.accountStatus;
  user.accountStatus = status;
  await user.save();

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'status_change',
    targetType: 'User',
    targetId: user._id.toString(),
    details: { before, after: status },
  });

  res.status(200).json({ user: publicUser(user) });
});
