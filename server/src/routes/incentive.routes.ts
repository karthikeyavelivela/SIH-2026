import { Router } from 'express';
import { body, param } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as incentiveController from '../controllers/incentive.controller';

export const incentiveRouter = Router();

// Admin-only — no permission carve-out for Managers, same as fare rules
// (a bonus-granting lever is a pricing-adjacent lever, and
// MANAGER_PERMISSIONS in shared/types.ts has no 'grant_incentives' slot).
incentiveRouter.use(verifyJwt, requireRole('admin'));

incentiveRouter.get('/rules', incentiveController.listIncentiveRules);
incentiveRouter.post(
  '/rules',
  [
    body('minRatingAvg').isFloat({ min: 0, max: 5 }),
    body('minCompletedJobs').isInt({ min: 0 }),
    body('bonusAmount').isFloat({ min: 0 }),
    body('region').optional().isString().trim(),
  ],
  validate,
  incentiveController.createIncentiveRule
);
incentiveRouter.patch(
  '/rules/:id/deactivate',
  [param('id').isMongoId()],
  validate,
  incentiveController.deactivateIncentiveRule
);

incentiveRouter.post('/run', incentiveController.runIncentives);
incentiveRouter.get('/', incentiveController.listIncentives);
