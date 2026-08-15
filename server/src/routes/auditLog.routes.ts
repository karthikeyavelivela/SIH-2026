import { Router } from 'express';
import { query } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as auditLogController from '../controllers/auditLog.controller';

export const auditLogRouter = Router();

// Admin-only — spec: "Views full AuditLog" is an Admin capability, not
// delegated to Manager via any MANAGER_PERMISSIONS slot.
auditLogRouter.use(verifyJwt, requireRole('admin'));

auditLogRouter.get(
  '/',
  [
    query('actorRole').optional().isString(),
    query('action').optional().isString(),
    query('targetType').optional().isString(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  validate,
  auditLogController.listAuditLog
);
