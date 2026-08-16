import { Router } from 'express';
import { body } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as availabilityController from '../controllers/availability.controller';

export const availabilityRouter = Router();

availabilityRouter.get(
  '/',
  verifyJwt,
  requireRole('driver', 'hamali_solo', 'mutha_member'),
  availabilityController.getAvailability
);

availabilityRouter.patch(
  '/',
  verifyJwt,
  // mutha_leader deliberately excluded — see the comment in
  // availability.controller.ts explaining why leaders have nothing to
  // toggle here (no HamaliProfile, no per-leader location concept; group
  // matchability is driven entirely by members' own availability).
  // mutha_member included — their HamaliProfile.availabilityStatus is
  // exactly what matching.service's findCandidateMuthas queries on, so
  // this is the endpoint that makes a member discoverable at all.
  requireRole('driver', 'hamali_solo', 'mutha_member'),
  [
    body('status').isIn(['online', 'offline']),
    // Bounds-checked whenever location is present, not only when going
    // online — a client sending status:'offline' with an out-of-range
    // location (e.g. lat:999) used to skip validation entirely, since the
    // conditional-on-'online' check simply never ran for that request. The
    // "location is REQUIRED for online" rule is enforced separately, in
    // the controller (a missing location isn't a shape problem
    // express-validator's .optional() semantics express cleanly here).
    body('location.lat').optional().isFloat({ min: -90, max: 90 }),
    body('location.lng').optional().isFloat({ min: -180, max: 180 }),
  ],
  validate,
  availabilityController.setAvailability
);

availabilityRouter.patch(
  '/willing-location',
  verifyJwt,
  requireRole('driver', 'hamali_solo', 'mutha_member'),
  [
    body('lat').isFloat({ min: -90, max: 90 }).optional({ nullable: true }),
    body('lng').isFloat({ min: -180, max: 180 }).optional({ nullable: true }),
  ],
  validate,
  availabilityController.setWillingLocation
);
