import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuditLog } from '../models/AuditLog';

/** GET /api/admin/audit-log — filterable, paginated. Admin-only (see auditLog.routes.ts). */
export const listAuditLog = asyncHandler(async (req: Request, res: Response) => {
  const { actorRole, action, targetType, page, limit } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = {};
  if (actorRole) filter.actorRole = actorRole;
  if (action) filter.action = action;
  if (targetType) filter.targetType = targetType;

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 50));

  const [entries, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ timestamp: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    AuditLog.countDocuments(filter),
  ]);

  res.status(200).json({ entries, total, page: pageNum, limit: limitNum });
});
