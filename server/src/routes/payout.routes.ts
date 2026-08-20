import { Router } from 'express';
import { param, query } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as payoutController from '../controllers/payout.controller';

export const payoutRouter = Router();

// Admin-only — payout_approvals is an Admin-hierarchy screen per
// DESIGN_INVENTORY.md.
payoutRouter.use(verifyJwt, requireRole('admin'));

payoutRouter.get(
  '/',
  [query('status').optional().isIn(['pending', 'approved', 'rejected', 'paid'])],
  validate,
  payoutController.listPayouts
);
payoutRouter.patch('/:id/approve', [param('id').isMongoId()], validate, payoutController.approvePayout);
payoutRouter.patch('/:id/reject', [param('id').isMongoId()], validate, payoutController.rejectPayout);
payoutRouter.patch('/:id/paid', [param('id').isMongoId()], validate, payoutController.markPayoutPaid);
