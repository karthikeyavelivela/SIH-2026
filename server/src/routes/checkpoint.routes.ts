import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as checkpointController from '../controllers/checkpoint.controller';

// SIH26089 Phase D.1 — driver + customer facing routes, any authenticated
// role for read-only lookups (nearby checkpoints/route suggestions are
// useful to a customer planning a booking too, not just a driver).
export const checkpointRouter = Router();
checkpointRouter.use(verifyJwt);

checkpointRouter.get(
  '/nearby',
  [query('lat').isFloat(), query('lng').isFloat(), query('radiusKm').optional().isFloat({ min: 1, max: 100 })],
  validate,
  checkpointController.listNearbyCheckpoints
);

checkpointRouter.get(
  '/route-suggestions',
  [
    query('pickupLat').isFloat(),
    query('pickupLng').isFloat(),
    query('dropLat').isFloat(),
    query('dropLng').isFloat(),
  ],
  validate,
  checkpointController.getRouteHaltSuggestions
);

checkpointRouter.post(
  '/halts/check-in',
  requireRole('driver'),
  [body('bookingId').isMongoId(), body('lat').isFloat(), body('lng').isFloat()],
  validate,
  checkpointController.checkInHalt
);

checkpointRouter.patch(
  '/halts/:id/check-out',
  requireRole('driver'),
  [
    param('id').isMongoId(),
    body('photoProofUrl').optional().isString(),
    body('odometerReading').optional().isFloat({ min: 0 }),
    body('sealIntact').optional().isBoolean(),
  ],
  validate,
  checkpointController.checkOutHalt
);

checkpointRouter.get(
  '/booking/:bookingId/halts',
  [param('bookingId').isMongoId()],
  validate,
  checkpointController.listHaltsForBooking
);

// --- Admin management ---
export const adminCheckpointRouter = Router();
adminCheckpointRouter.use(verifyJwt, requireRole('admin'));

adminCheckpointRouter.get('/', checkpointController.listAllCheckpoints);
adminCheckpointRouter.post(
  '/',
  [
    body('name').isString().trim().isLength({ min: 1 }),
    body('lat').isFloat(),
    body('lng').isFloat(),
    body('type').isIn(['toll_plaza', 'police_checkpost', 'verified_dhaba', 'fuel_station', 'designated_halt']),
    body('cctvAvailable').optional().isBoolean(),
    body('securityRating').optional().isInt({ min: 1, max: 5 }),
    body('operatingHours').optional().isString(),
    body('amenities').optional().isArray(),
    body('corridor').optional().isString(),
  ],
  validate,
  checkpointController.createCheckpoint
);
