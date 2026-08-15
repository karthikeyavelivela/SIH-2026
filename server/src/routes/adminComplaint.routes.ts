import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as complaintController from '../controllers/complaint.controller';

export const adminComplaintRouter = Router();

// Admin always passes; Manager needs the 'resolve_complaints' permission —
// same requirePermission() every other permission-scoped admin route uses.
adminComplaintRouter.use(verifyJwt, requirePermission('resolve_complaints'));

adminComplaintRouter.get(
  '/',
  [query('status').optional().isIn(['open', 'in_review', 'resolved'])],
  validate,
  complaintController.listComplaints
);

adminComplaintRouter.patch(
  '/:id/resolve',
  [
    param('id').isMongoId(),
    body('status').isIn(['in_review', 'resolved']),
    body('resolutionNote').isString().trim().isLength({ min: 1, max: 2000 }),
  ],
  validate,
  complaintController.resolveComplaint
);
