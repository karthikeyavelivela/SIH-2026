import { Router } from 'express';
import { query } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as ledgerController from '../controllers/ledger.controller';

export const ledgerRouter = Router();

// Admin-only — the platform financial ledger is not delegated to Manager
// via any MANAGER_PERMISSIONS slot (no 'view_ledger' permission exists),
// same posture as fareRule.routes.ts / incentive.routes.ts for money-adjacent
// admin surfaces.
ledgerRouter.use(verifyJwt, requireRole('admin'));

const filters = [
  query('type').optional().isIn(['revenue', 'payout', 'fee', 'refund']),
  query('from').optional().isISO8601(),
  query('to').optional().isISO8601(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
];

ledgerRouter.get('/', filters, validate, ledgerController.listLedger);
ledgerRouter.get('/export', filters, validate, ledgerController.exportLedgerCsv);
