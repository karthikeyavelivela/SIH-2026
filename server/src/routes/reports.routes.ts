import { Router } from 'express';
import { query } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as reportsController from '../controllers/reports.controller';

export const reportsRouter = Router();

// Admin-only. The `source=ledger` export would otherwise let a Manager who
// only holds 'view_analytics' (not ledger access) pull the full financial
// ledger through the back door — keeping this admin-only avoids that leak
// rather than trying to gate per-source inside the controller.
reportsRouter.use(verifyJwt, requireRole('admin'));

reportsRouter.get(
  '/export',
  [
    query('source').isIn(['ledger', 'bookings']),
    query('from').optional().isISO8601(),
    query('to').optional().isISO8601(),
    query('region').optional().isString().trim(),
  ],
  validate,
  reportsController.exportReport
);
