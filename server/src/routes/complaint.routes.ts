import { Router } from 'express';
import { body } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as complaintController from '../controllers/complaint.controller';

export const complaintRouter = Router();

// 'workmanship' is deliberately NOT here: a guarantee claim goes through
// POST /api/bookings/:id/guarantee-claim, which checks the category actually
// carries a guarantee and that the window is still open. Letting it be
// selected on the plain complaint form would bypass both checks.
const CATEGORIES = ['no_show', 'damage', 'payment', 'misconduct', 'other'];

complaintRouter.use(verifyJwt);

complaintRouter.post(
  '/',
  requireRole('customer', 'driver', 'hamali_solo', 'mutha_leader', 'mutha_member'),
  [
    body('bookingId').isMongoId(),
    body('category').isIn(CATEGORIES),
    body('description').isString().trim().isLength({ min: 1, max: 2000 }),
    body('againstUserId').optional().isMongoId(),
    body('againstMuthaId').optional().isMongoId(),
  ],
  validate,
  complaintController.raiseComplaint
);

complaintRouter.get('/mine', complaintController.myComplaints);
