import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as insuranceController from '../controllers/insurance.controller';

const WORKER_ROLES = ['driver', 'hamali_solo', 'mutha_member'] as const;

// Worker-facing router, mounted at /api/insurance — a driver/hamali_solo/
// mutha_member viewing and filing against their own coverage. Mirrors the
// incentive.routes.ts split of a worker-facing router + a separate
// admin-only router below.
export const insuranceRouter = Router();

insuranceRouter.use(verifyJwt, requireRole(...WORKER_ROLES));

insuranceRouter.get('/me', insuranceController.getMyInsurance);

insuranceRouter.post(
  '/claims',
  [
    body('policyId').isMongoId(),
    body('incidentDescription').isString().trim().isLength({ min: 1, max: 2000 }),
    body('incidentDate').isISO8601(),
    body('photos').optional().isArray(),
    body('photos.*').optional().isString(),
  ],
  validate,
  insuranceController.fileClaim
);

insuranceRouter.get('/claims/:id', [param('id').isMongoId()], validate, insuranceController.getClaimById);

// Admin-only router, mounted at /api/admin/insurance — claim review queue
// plus the manual/future-scheduler entry point for the parametric batch
// check. Admin-only (no Manager permission carve-out): approving a payout
// is a money-moving decision, same posture as incentive.routes.ts's admin
// router and fareRule.routes.ts.
export const adminInsuranceRouter = Router();

adminInsuranceRouter.use(verifyJwt, requireRole('admin'));

adminInsuranceRouter.get(
  '/claims',
  [query('status').optional().isIn(['submitted', 'under_review', 'approved', 'rejected', 'paid'])],
  validate,
  insuranceController.listAllClaims
);

adminInsuranceRouter.patch(
  '/claims/:id',
  [
    param('id').isMongoId(),
    body('status').isIn(['under_review', 'approved', 'rejected', 'paid']),
    body('payoutAmount').optional().isFloat({ min: 0 }),
    body('reviewNote').optional().isString().trim().isLength({ max: 2000 }),
  ],
  validate,
  insuranceController.updateClaimStatus
);

adminInsuranceRouter.post('/parametric/run-check', insuranceController.runParametricCheck);
