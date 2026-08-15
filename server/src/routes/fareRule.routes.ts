import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as fareRuleController from '../controllers/fareRule.controller';

export const fareRuleRouter = Router();

// Admin-only for every route below (fare rules are a pricing lever — no
// manager-permission carve-out per spec), enforced once at the router level
// so a future added route can't accidentally skip the gate.
fareRuleRouter.use(verifyJwt, requireRole('admin'));

const CATEGORIES = ['vehicle_small', 'vehicle_medium', 'vehicle_large', 'hamali'];

fareRuleRouter.get(
  '/',
  [query('region').optional().isString(), query('category').optional().isIn(CATEGORIES)],
  validate,
  fareRuleController.listFareRules
);

fareRuleRouter.post(
  '/',
  [
    body('region').isString().trim().isLength({ min: 1 }),
    body('category').isIn(CATEGORIES),
    body('baseFare').isFloat({ min: 0 }),
    body('perKmRate').isFloat({ min: 0 }),
    body('minimumFare').isFloat({ min: 0 }),
  ],
  validate,
  fareRuleController.createFareRule
);

fareRuleRouter.patch(
  '/:id',
  [
    param('id').isMongoId(),
    body('baseFare').optional().isFloat({ min: 0 }),
    body('perKmRate').optional().isFloat({ min: 0 }),
    body('minimumFare').optional().isFloat({ min: 0 }),
    body('active').optional().isBoolean(),
  ],
  validate,
  fareRuleController.updateFareRule
);
