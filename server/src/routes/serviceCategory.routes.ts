import { Router } from 'express';
import { body, param } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as controller from '../controllers/serviceCategory.controller';

// Public (any authenticated role) — mounted at /api/service-categories.
export const serviceCategoryRouter = Router();
serviceCategoryRouter.use(verifyJwt);
serviceCategoryRouter.get('/', controller.listServiceCategories);

// Admin-only management — mounted at /api/admin/service-categories.
export const adminServiceCategoryRouter = Router();
adminServiceCategoryRouter.use(verifyJwt, requireRole('admin'));
adminServiceCategoryRouter.get('/', controller.listAllServiceCategories);
adminServiceCategoryRouter.post(
  '/',
  [
    body('name').isString().trim().isLength({ min: 1, max: 100 }),
    body('slug').isString().trim().isLength({ min: 1, max: 50 }).matches(/^[a-z0-9_-]+$/),
    body('icon').isString().trim().isLength({ min: 1, max: 50 }),
    body('accentColor').isString().trim().isLength({ min: 1, max: 20 }),
    body('pricingUnit').isIn(['per_hour', 'per_job', 'per_km', 'per_worker']),
    body('requiredSkills').optional().isArray(),
    body('requiresVehicle').optional().isBoolean(),
    body('requiresMaterials').optional().isBoolean(),
    body('defaultDurationMinutes').isInt({ min: 15 }),
    body('minWorkers').optional().isInt({ min: 1 }),
    body('dispatchType').isIn(['truck', 'hamali']),
  ],
  validate,
  controller.createServiceCategory
);
adminServiceCategoryRouter.patch(
  '/:id/active',
  [param('id').isMongoId(), body('active').isBoolean()],
  validate,
  controller.setServiceCategoryActive
);
