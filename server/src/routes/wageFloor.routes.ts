import { Router } from 'express';
import { body, query } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as wageFloorController from '../controllers/wageFloor.controller';
import { SKILL_BANDS, WAGE_ZONES, WAGE_SOURCE_TYPES } from '../models/GovernmentWageFloor';

/**
 * Readable by every signed-in role. A statutory floor that only the platform
 * can see is a claim, not a guarantee — the worker it protects and the
 * customer paying the bill both have a reason to check the figure and the
 * notification behind it.
 */
export const wageFloorRouter = Router();
wageFloorRouter.use(verifyJwt);

wageFloorRouter.get(
  '/',
  [query('state').optional().isString(), query('zone').optional().isIn(WAGE_ZONES)],
  validate,
  wageFloorController.listWageFloors
);

wageFloorRouter.get(
  '/applicable',
  [query('region').isString().trim().isLength({ min: 1 }), query('categorySlug').optional().isString()],
  validate,
  wageFloorController.getApplicableFloor
);

/**
 * Admin-only, no manager carve-out. This is the number every other rate on
 * the platform is checked against; the same posture as fare rules and the
 * platform commission.
 */
export const adminWageFloorRouter = Router();
adminWageFloorRouter.use(verifyJwt, requireRole('admin'));

adminWageFloorRouter.post(
  '/',
  [
    body('state').isString().trim().isLength({ min: 2 }),
    body('zone').isIn(WAGE_ZONES),
    body('skillBand').isIn(SKILL_BANDS),
    body('monthlyRate').isFloat({ min: 0 }),
    body('basicComponent').optional().isFloat({ min: 0 }),
    body('vdaComponent').optional().isFloat({ min: 0 }),
    body('workingDaysPerMonth').optional().isInt({ min: 1, max: 31 }),
    body('workingHoursPerDay').optional().isInt({ min: 1, max: 24 }),
    body('scheduledEmployment').isString().trim().isLength({ min: 2 }),
    // The notification number is required, not optional. A floor that
    // refuses somebody's rate has to be able to name the instrument it is
    // standing on.
    body('notificationNumber').isString().trim().isLength({ min: 2 }),
    body('notificationDate').isISO8601(),
    body('effectiveFrom').isISO8601(),
    body('effectiveUntil').optional().isISO8601(),
    body('sourceType').isIn(WAGE_SOURCE_TYPES),
    body('sourceUrl').optional().isString().trim(),
    body('sourceNote').optional().isString().trim(),
  ],
  validate,
  wageFloorController.createWageFloor
);
