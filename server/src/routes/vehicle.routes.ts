import { Router } from 'express';
import { body } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as vehicleController from '../controllers/vehicle.controller';

export const vehicleRouter = Router();

vehicleRouter.use(verifyJwt, requireRole('driver'));

vehicleRouter.get('/me', vehicleController.getMyVehicle);
vehicleRouter.patch(
  '/me',
  [
    body('type').optional().isString().notEmpty(),
    body('capacityKg').optional().isFloat({ min: 1 }),
    body('photos').optional().isArray({ max: 6 }),
    body('photos.*').optional().isString(),
  ],
  validate,
  vehicleController.updateMyVehicle
);
