import { Router } from 'express';
import { body, param } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as federationController from '../controllers/federation.controller';

// Admin-only hierarchy management — mounted at /api/admin/federations.
export const adminFederationRouter = Router();
adminFederationRouter.use(verifyJwt, requireRole('admin'));

adminFederationRouter.get('/', federationController.listFederations);
adminFederationRouter.post(
  '/',
  [
    body('name').isString().trim().isLength({ min: 1, max: 150 }),
    body('type').isIn(['state', 'district']),
    body('parentFederationId').optional().isMongoId(),
    body('region').isString().trim().isLength({ min: 1, max: 100 }),
    body('registrationNumber').isString().trim().isLength({ min: 1, max: 100 }),
    body('registeredUnderAct').isString().trim().isLength({ min: 1, max: 200 }),
    body('contactDetails').optional().isObject(),
    body('maxCommissionRatePct').optional().isFloat({ min: 0, max: 100 }),
    body('maxWelfareDeductionRatePct').optional().isFloat({ min: 0, max: 100 }),
  ],
  validate,
  federationController.createFederation
);
adminFederationRouter.post(
  '/admins',
  [
    body('name').isString().trim().isLength({ min: 1, max: 100 }),
    body('phone').isString().trim().isLength({ min: 10, max: 15 }),
    body('password').isString().isLength({ min: 8 }),
    body('role').isIn(['federation_state_admin', 'federation_district_admin']),
    body('federationId').isMongoId(),
  ],
  validate,
  federationController.createFederationAdmin
);

// Federation-admin self-service — mounted at /api/federation.
export const federationRouter = Router();
federationRouter.use(verifyJwt, requireRole('federation_state_admin', 'federation_district_admin'));

// Every literal-path GET must be registered before the '/:id' catch-all
// GET below — Express matches in registration order, and '/:id' would
// otherwise swallow "training-needs"/"affiliation-requests" as an :id
// value and fail isMongoId() with a confusing 400 instead of ever
// reaching the real handler (same ordering rule booking.routes.ts's own
// '/frequent-routes' comment documents).
federationRouter.get('/me', federationController.getMyFederationDashboard);
federationRouter.get('/training-needs', federationController.getTrainingNeedsAssessment);
federationRouter.get(
  '/affiliation-requests',
  requireRole('federation_district_admin'),
  federationController.listAffiliationRequests
);
federationRouter.get(
  '/:id',
  [param('id').isMongoId()],
  validate,
  federationController.getDistrictFederationDashboard
);
federationRouter.patch(
  '/me/bounds',
  requireRole('federation_district_admin'),
  [
    body('maxCommissionRatePct').optional({ nullable: true }).isFloat({ min: 0, max: 100 }),
    body('maxWelfareDeductionRatePct').optional({ nullable: true }).isFloat({ min: 0, max: 100 }),
  ],
  validate,
  federationController.updateFederationBounds
);

federationRouter.patch(
  '/affiliation-requests/:muthaId/decide',
  requireRole('federation_district_admin'),
  [param('muthaId').isMongoId(), body('approve').isBoolean()],
  validate,
  federationController.decideAffiliationRequest
);
federationRouter.patch(
  '/societies/:muthaId/suspend',
  requireRole('federation_district_admin'),
  [param('muthaId').isMongoId()],
  validate,
  federationController.suspendSociety
);
