import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as fleetController from '../controllers/fleet.controller';

export const fleetRouter = Router();

fleetRouter.use(verifyJwt, requireRole('fleet_owner'));

fleetRouter.get('/me', fleetController.getMyFleet);
fleetRouter.patch(
  '/me',
  [body('name').isString().trim().isLength({ min: 1, max: 100 })],
  validate,
  fleetController.updateMyFleet
);

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

// ---- Fleet maintenance + vehicle inspection/compliance ----

fleetRouter.get('/health', fleetController.getFleetHealth);

fleetRouter.get(
  '/maintenance',
  [query('vehicleId').optional().isMongoId()],
  validate,
  fleetController.listMaintenanceSchedules
);

fleetRouter.post(
  '/vehicles/:vehicleId/maintenance',
  [
    param('vehicleId').isMongoId(),
    body('type').isIn(['mileage_triggered', 'date_triggered']),
    body('description').isString().trim().notEmpty(),
    body('dueAt').optional().isISO8601(),
    body('dueMileageKm').optional().isFloat({ min: 0 }),
  ],
  validate,
  fleetController.createMaintenanceSchedule
);

fleetRouter.patch(
  '/maintenance/:scheduleId',
  [param('scheduleId').isMongoId(), body('status').isIn(['upcoming', 'due', 'overdue', 'completed'])],
  validate,
  fleetController.updateMaintenanceSchedule
);

fleetRouter.get(
  '/vehicles/:vehicleId/inspections',
  [param('vehicleId').isMongoId()],
  validate,
  fleetController.listVehicleInspections
);

fleetRouter.post(
  '/vehicles/:vehicleId/inspections',
  [
    param('vehicleId').isMongoId(),
    body('photos.front').isString().notEmpty(),
    body('photos.rear').isString().notEmpty(),
    body('photos.driverSide').isString().notEmpty(),
    body('photos.passengerSide').isString().notEmpty(),
    body('checklist').isArray({ min: 1 }),
    body('checklist.*.item').isString().trim().notEmpty(),
    body('checklist.*.result').isIn(['pass', 'warn', 'fail']),
    body('overallVerdict').isIn(['compliant', 'non_compliant']),
  ],
  validate,
  fleetController.submitVehicleInspection
);
