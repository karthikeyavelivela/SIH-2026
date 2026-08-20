import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as fraudController from '../controllers/fraud.controller';

export const fraudRouter = Router();

// Admin-only — security_fraud_alerts is an Admin-hierarchy screen per
// DESIGN_INVENTORY.md, and account suspension is a real, irreversible-
// feeling action that should not be delegable to a Manager permission yet.
fraudRouter.use(verifyJwt, requireRole('admin'));

fraudRouter.get(
  '/cases',
  [query('status').optional().isIn(['open', 'investigating', 'cleared', 'suspended'])],
  validate,
  fraudController.listFraudCases
);
fraudRouter.get('/cases/:id', [param('id').isMongoId()], validate, fraudController.getFraudCase);
fraudRouter.patch(
  '/cases/:id/investigate',
  [param('id').isMongoId()],
  validate,
  fraudController.investigateFraudCase
);
fraudRouter.patch(
  '/cases/:id/resolve',
  [
    param('id').isMongoId(),
    body('resolution').isIn(['clear', 'suspend']),
    body('notes').optional().isString().trim().isLength({ max: 1000 }),
  ],
  validate,
  fraudController.resolveFraudCase
);
