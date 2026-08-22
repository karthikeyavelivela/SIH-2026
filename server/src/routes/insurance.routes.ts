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
insuranceRouter.get('/plans', insuranceController.listAvailablePlans);
insuranceRouter.post(
  '/enroll',
  [body('planId').isMongoId(), body('consent').isBoolean()],
  validate,
  insuranceController.enrollInPlan
);

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
    // Upper bound is a sanity ceiling against a fat-fingered or malicious
    // figure reaching the ledger, not a real business limit — admin-only
    // route, already a trusted actor, but a real financial amount deserves
    // a cap regardless.
    body('payoutAmount').optional().isFloat({ min: 0, max: 1_000_000 }),
    body('reviewNote').optional().isString().trim().isLength({ max: 2000 }),
  ],
  validate,
  insuranceController.updateClaimStatus
);

adminInsuranceRouter.post('/parametric/run-check', insuranceController.runParametricCheck);

const PLAN_CATEGORIES = ['commercial_auto', 'work_compensation', 'cargo_transit'];
const ROLES = ['customer', 'driver', 'hamali_solo', 'mutha_leader', 'mutha_member', 'manager', 'admin', 'fleet_owner', 'warehouse_hub'];
const triggerBodyRules = [
  body('defaultTrigger.condition').if(body('type').equals('parametric')).isIn(['earnings_below_threshold', 'days_unable_to_work']),
  body('defaultTrigger.thresholdValue').if(body('type').equals('parametric')).isFloat({ min: 0 }),
  body('defaultTrigger.periodDays').if(body('type').equals('parametric')).isInt({ min: 1, max: 365 }),
  body('defaultTrigger.payoutAmount').if(body('type').equals('parametric')).isFloat({ min: 0, max: 100_000 }),
];

adminInsuranceRouter.get('/plans', insuranceController.listAllPlans);
adminInsuranceRouter.post(
  '/plans',
  [
    body('name').isString().trim().isLength({ min: 1, max: 100 }),
    body('type').isIn(['standard', 'parametric']),
    body('category').isIn(PLAN_CATEGORIES),
    body('coverageAmount').isFloat({ min: 0 }),
    body('description').isString().trim().isLength({ min: 1, max: 1000 }),
    body('forRoles').isArray({ min: 1 }),
    body('forRoles.*').isIn(ROLES),
    body('premium').isFloat({ min: 0 }),
    ...triggerBodyRules,
  ],
  validate,
  insuranceController.createPlan
);
adminInsuranceRouter.patch(
  '/plans/:id',
  [
    param('id').isMongoId(),
    body('name').optional().isString().trim().isLength({ min: 1, max: 100 }),
    body('active').optional().isBoolean(),
    body('coverageAmount').optional().isFloat({ min: 0 }),
    body('description').optional().isString().trim().isLength({ min: 1, max: 1000 }),
    body('premium').optional().isFloat({ min: 0 }),
  ],
  validate,
  insuranceController.updatePlan
);

adminInsuranceRouter.get('/payout-monitor', insuranceController.getPayoutMonitor);
adminInsuranceRouter.patch(
  '/kill-switch',
  [body('enabled').isBoolean()],
  validate,
  insuranceController.updateKillSwitch
);
