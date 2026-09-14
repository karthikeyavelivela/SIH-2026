import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as emergencyController from '../controllers/emergency.controller';

export const emergencyRouter = Router();

emergencyRouter.use(verifyJwt);

// Raising an SOS is open to every authenticated role and asks for nothing it
// can do without: kind, note, location and booking are all optional. A person
// who has denied location permission, or who is nowhere near a booking, can
// still call for help.
emergencyRouter.post(
  '/',
  [
    body('kind').optional().isIn(['accident', 'unsafe', 'medical', 'vehicle', 'other']),
    body('note').optional().isString().trim().isLength({ max: 500 }),
    body('lat').optional().isFloat({ min: -90, max: 90 }),
    body('lng').optional().isFloat({ min: -180, max: 180 }),
    body('bookingId').optional().isMongoId(),
  ],
  validate,
  emergencyController.raiseAlert
);

emergencyRouter.get('/mine', emergencyController.myAlerts);

// Acting on someone's emergency is admin/manager only, and every action is
// audit-logged with who took it.
emergencyRouter.get(
  '/',
  requireRole('admin', 'manager'),
  [query('status').optional().isIn(['open', 'acknowledged', 'resolved'])],
  validate,
  emergencyController.listAlerts
);

emergencyRouter.patch(
  '/:id/acknowledge',
  requireRole('admin', 'manager'),
  [param('id').isMongoId()],
  validate,
  emergencyController.acknowledgeAlert
);

emergencyRouter.patch(
  '/:id/resolve',
  requireRole('admin', 'manager'),
  [param('id').isMongoId(), body('resolutionNote').optional().isString().trim().isLength({ max: 1000 })],
  validate,
  emergencyController.resolveAlert
);
