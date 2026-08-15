import { Router } from 'express';
import { body, param } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as regionController from '../controllers/region.controller';

export const regionRouter = Router();

// Admin-only, no Manager carve-out — "enables/launches new regions" is
// listed under the Admin (not Manager) hierarchy in the spec.
regionRouter.use(verifyJwt, requireRole('admin'));

regionRouter.get('/', regionController.listRegions);
regionRouter.post('/', [body('name').isString().trim().isLength({ min: 2, max: 100 })], validate, regionController.launchRegion);
regionRouter.patch(
  '/:id',
  [param('id').isMongoId(), body('enabled').isBoolean()],
  validate,
  regionController.setRegionEnabled
);
