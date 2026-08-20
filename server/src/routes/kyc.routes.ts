import { Router } from 'express';
import { body, param } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as kycController from '../controllers/kyc.controller';

export const kycRouter = Router();

// Admin always passes; Manager needs 'verify_kyc' — same requirePermission()
// pattern as adminComplaint.routes.ts.
kycRouter.use(verifyJwt, requirePermission('verify_kyc'));

kycRouter.get('/', kycController.listKycQueue);
kycRouter.patch(
  '/:id',
  [
    param('id').isMongoId(),
    body('status').isIn(['verified', 'rejected']),
    body('rejectionReason')
      .if(body('status').equals('rejected'))
      .isString()
      .trim()
      .isLength({ min: 1, max: 500 }),
  ],
  validate,
  kycController.updateKycStatus
);
