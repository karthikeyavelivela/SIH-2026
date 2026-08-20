import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as disputeController from '../controllers/dispute.controller';

export const disputeRouter = Router();

// Admin-only — dispute_refund_resolution is listed under the Admin (not
// Manager) hierarchy in DESIGN_INVENTORY.md.
disputeRouter.use(verifyJwt, requireRole('admin'));

disputeRouter.get(
  '/',
  [query('status').optional().isIn(['open', 'investigating', 'resolved', 'escalated'])],
  validate,
  disputeController.listDisputes
);
disputeRouter.get('/:id', [param('id').isMongoId()], validate, disputeController.getDispute);
disputeRouter.post(
  '/',
  [
    body('bookingId').isMongoId(),
    body('raisedBy').isMongoId(),
    body('claim').isString().trim().isLength({ min: 1, max: 2000 }),
    body('priority').optional().isIn(['low', 'medium', 'high', 'critical']),
  ],
  validate,
  disputeController.createDispute
);
disputeRouter.post(
  '/:id/messages',
  [param('id').isMongoId(), body('message').isString().trim().isLength({ min: 1, max: 2000 })],
  validate,
  disputeController.addDisputeMessage
);
disputeRouter.patch(
  '/:id/resolve',
  [
    param('id').isMongoId(),
    body('action').isIn(['approve_adjustment', 'partial_refund', 'reject', 'escalate']),
    body('note').isString().trim().isLength({ min: 1, max: 2000 }),
    body('amount').optional().isFloat({ min: 0 }),
  ],
  validate,
  disputeController.resolveDispute
);
