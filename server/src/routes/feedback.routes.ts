import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { FEEDBACK_CATEGORIES } from '../models/Feedback';
import * as feedbackController from '../controllers/feedback.controller';

export const feedbackRouter = Router();

feedbackRouter.use(verifyJwt);

// Every role can tell us something — a driver's view of the app is as useful
// as a customer's, and the two see completely different screens.
feedbackRouter.post(
  '/',
  [
    body('category').isIn(FEEDBACK_CATEGORIES),
    body('message').isString().trim().isLength({ min: 5, max: 2000 }),
    body('requestedService').optional().isString().trim().isLength({ max: 120 }),
    body('screenshotUrl').optional().isString(),
  ],
  validate,
  feedbackController.submit
);

feedbackRouter.get('/mine', feedbackController.listMine);

feedbackRouter.get(
  '/',
  requireRole('admin', 'manager'),
  [query('status').optional().isString(), query('category').optional().isIn(FEEDBACK_CATEGORIES)],
  validate,
  feedbackController.listAll
);

// The demand signal: services people asked for that do not exist yet.
feedbackRouter.get('/demand', requireRole('admin', 'manager'), feedbackController.demandForNewServices);

feedbackRouter.patch(
  '/:id',
  requireRole('admin', 'manager'),
  [
    param('id').isMongoId(),
    body('status').isIn(['new', 'reviewing', 'planned', 'closed']),
    body('adminNote').optional().isString().isLength({ max: 1000 }),
  ],
  validate,
  feedbackController.updateStatus
);
