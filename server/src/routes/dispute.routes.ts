import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as disputeController from '../controllers/dispute.controller';

export const disputeRouter = Router();

// Self-service — customer/driver/hamali_solo/mutha_member/mutha_leader
// raising or viewing THEIR OWN disputes. Mounted separately at
// /api/disputes (see app.ts) from the admin-only router below (mounted at
// /api/admin/disputes) — same split pattern as insurance.routes.ts's
// insuranceRouter/adminInsuranceRouter.
export const myDisputeRouter = Router();
myDisputeRouter.use(
  verifyJwt,
  requireRole('customer', 'driver', 'hamali_solo', 'mutha_member', 'mutha_leader')
);
myDisputeRouter.get('/mine', disputeController.listMyDisputes);
myDisputeRouter.post(
  '/',
  [
    body('bookingId').isMongoId(),
    body('claim').isString().trim().isLength({ min: 1, max: 2000 }),
    body('priority').optional().isIn(['low', 'medium', 'high', 'critical']),
  ],
  validate,
  disputeController.createMyDispute
);

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
disputeRouter.post(
  '/:id/escalate',
  [param('id').isMongoId(), body('note').optional().isString().trim().isLength({ max: 2000 })],
  validate,
  disputeController.escalate
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

// P1.5 — the resolver queue: society leaders, district and state federation
// admins (scoped to their own society / federation, at their own level) and
// admins (any level). Every handler re-checks the scope per dispute.
export const disputeQueueRouter = Router();
disputeQueueRouter.use(
  verifyJwt,
  requireRole('mutha_leader', 'federation_district_admin', 'federation_state_admin', 'admin')
);
disputeQueueRouter.get('/', [query('status').optional().isIn(['resolved'])], validate, disputeController.listQueue);
disputeQueueRouter.get('/:id', [param('id').isMongoId()], validate, disputeController.getDispute);
disputeQueueRouter.post(
  '/:id/messages',
  [param('id').isMongoId(), body('message').isString().trim().isLength({ min: 1, max: 2000 })],
  validate,
  disputeController.addDisputeMessage
);
disputeQueueRouter.post(
  '/:id/escalate',
  [param('id').isMongoId(), body('note').optional().isString().trim().isLength({ max: 2000 })],
  validate,
  disputeController.escalate
);
disputeQueueRouter.patch(
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
