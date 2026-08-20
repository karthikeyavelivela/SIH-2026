import { Router } from 'express';
import { body, param } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { requestsLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import * as loadManifestController from '../controllers/loadManifest.controller';

export const loadManifestRouter = Router();

// Driver-only — only the assigned driver on a booking may ever read or
// sign its manifest (enforced again inside the controller against
// Booking.assignedDriverIds, never trusted from the URL alone).
loadManifestRouter.use(verifyJwt, requireRole('driver'), requestsLimiter);

loadManifestRouter.get(
  '/:bookingId',
  [param('bookingId').isMongoId()],
  validate,
  loadManifestController.getOrCreateManifest
);

loadManifestRouter.post(
  '/:bookingId/sign',
  [param('bookingId').isMongoId(), body('signatureImageBase64').isString().isLength({ min: 100 })],
  validate,
  loadManifestController.signManifest
);
