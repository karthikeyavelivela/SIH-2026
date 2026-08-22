import { Router } from 'express';
import { body, param } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as loadboardController from '../controllers/loadboard.controller';

export const loadboardRouter = Router();

loadboardRouter.use(verifyJwt);

// Driver/hamali_solo browsing open-for-bidding loads for their own type —
// role check lives inside the controller (mirrors requests.routes.ts's own
// posture: the per-role eligibility logic is genuinely branchy, not a flat
// role list express-validator can express cleanly).
loadboardRouter.get('/', requireRole('driver', 'hamali_solo'), loadboardController.listLoadBoard);

loadboardRouter.post(
  '/:bookingId/bids',
  requireRole('driver', 'hamali_solo'),
  [
    param('bookingId').isMongoId(),
    body('amount').isFloat({ min: 1 }),
    body('message').optional().isString().trim().isLength({ max: 300 }),
  ],
  validate,
  loadboardController.placeBid
);

loadboardRouter.post(
  '/:bookingId/bids/:bidId/withdraw',
  requireRole('driver', 'hamali_solo'),
  [param('bookingId').isMongoId(), param('bidId').isMongoId()],
  validate,
  loadboardController.withdrawBid
);

// Customer (booking owner) or admin reviewing/deciding bids.
loadboardRouter.get(
  '/:bookingId/bids',
  requireRole('customer', 'admin'),
  [param('bookingId').isMongoId()],
  validate,
  loadboardController.listBidsForBooking
);

loadboardRouter.post(
  '/:bookingId/bids/:bidId/accept',
  requireRole('customer'),
  [param('bookingId').isMongoId(), param('bidId').isMongoId()],
  validate,
  loadboardController.acceptBid
);
