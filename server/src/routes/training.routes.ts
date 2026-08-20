import { Router } from 'express';
import { param } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as trainingController from '../controllers/training.controller';

export const trainingRouter = Router();

// Training academy + certification is scoped to the worker/partner roles it
// was built for (DESIGN_INVENTORY: driver, hamali_solo, fleet_owner).
trainingRouter.use(verifyJwt, requireRole('driver', 'hamali_solo', 'fleet_owner'));

trainingRouter.get('/progress', trainingController.getMyTrainingProgress);

trainingRouter.post(
  '/modules/:moduleId/complete',
  [param('moduleId').isMongoId()],
  validate,
  trainingController.completeTrainingModule
);

trainingRouter.get('/certifications', trainingController.getMyCertifications);
