import { Router } from 'express';
import { body, param } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as ratingController from '../controllers/rating.controller';

export const ratingRouter = Router();

ratingRouter.use(verifyJwt);

ratingRouter.get('/pending', ratingController.getPendingRating);

// "Rate later" — releases the rating gate for one booking without marking it
// rated. See RatingDeferral for why this exists.
ratingRouter.post(
  '/:bookingId/defer',
  requireRole('customer', 'driver', 'hamali_solo', 'mutha_member', 'mutha_leader'),
  [param('bookingId').isMongoId()],
  validate,
  ratingController.deferRating
);
ratingRouter.get('/mine', ratingController.getMyRatings);

ratingRouter.post(
  '/',
  requireRole('customer', 'driver', 'hamali_solo', 'mutha_member', 'mutha_leader'),
  [
    body('bookingId').isMongoId(),
    body('score').isInt({ min: 1, max: 5 }),
    body('comment').optional().isString().trim().isLength({ max: 1000 }),
  ],
  validate,
  ratingController.submitRating
);
