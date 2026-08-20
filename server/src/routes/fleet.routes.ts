import { Router } from 'express';
import { body } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as fleetController from '../controllers/fleet.controller';

export const fleetRouter = Router();

fleetRouter.use(verifyJwt, requireRole('fleet_owner'));

fleetRouter.get('/me', fleetController.getMyFleet);

fleetRouter.post(
  '/vehicles',
  [
    body('vehicleType').isString().trim().notEmpty(),
    body('capacityKg').isFloat({ min: 1 }),
    body('registrationNumber').isString().trim().notEmpty(),
  ],
  validate,
  fleetController.registerFleetVehicle
);

fleetRouter.post(
  '/assign-driver',
  [body('driverId').isMongoId(), body('vehicleId').isMongoId()],
  validate,
  fleetController.assignDriverToVehicle
);
