import { Router } from 'express';
import { body, param } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { requestsLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import * as requestsController from '../controllers/requests.controller';

export const requestsRouter = Router();

// Every route below is worker-side (driver / hamali_solo / mutha_leader /
// mutha_member), never the customer — customer-side booking access is
// booking.routes.ts.
requestsRouter.use(verifyJwt, requestsLimiter);

requestsRouter.get('/', requireRole('driver', 'hamali_solo', 'mutha_leader'), requestsController.listRequests);

requestsRouter.get(
  '/mine',
  requireRole('driver', 'hamali_solo', 'mutha_leader', 'mutha_member'),
  requestsController.myAssignedBookings
);

requestsRouter.post(
  '/:id/accept',
  requireRole('driver', 'hamali_solo', 'mutha_leader'),
  [
    param('id').isMongoId(),
    body('memberIds').optional().isArray({ min: 1 }),
    body('memberIds.*').optional().isMongoId(),
  ],
  validate,
  requestsController.acceptRequest
);

requestsRouter.post(
  '/:id/reject',
  requireRole('driver', 'hamali_solo', 'mutha_leader'),
  [param('id').isMongoId()],
  validate,
  requestsController.rejectRequest
);

requestsRouter.post(
  '/:id/start',
  requireRole('driver', 'hamali_solo', 'mutha_leader'),
  [param('id').isMongoId()],
  validate,
  requestsController.startJob
);

requestsRouter.post(
  '/:id/complete',
  requireRole('driver', 'hamali_solo', 'mutha_leader'),
  [param('id').isMongoId()],
  validate,
  requestsController.completeJob
);
