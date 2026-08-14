import { Router } from 'express';
import { body } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as availabilityController from '../controllers/availability.controller';

export const availabilityRouter = Router();

availabilityRouter.patch(
  '/',
  verifyJwt,
  requireRole('driver', 'hamali_solo', 'mutha_leader'),
  [
    body('status').isIn(['online', 'offline']),
    body('location.lat').if(body('status').equals('online')).isFloat({ min: -90, max: 90 }),
    body('location.lng').if(body('status').equals('online')).isFloat({ min: -180, max: 180 }),
  ],
  validate,
  availabilityController.setAvailability
);
