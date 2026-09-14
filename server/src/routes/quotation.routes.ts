import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { UNIT_TYPES } from '@fyro/shared';
import * as quotationController from '../controllers/quotation.controller';

export const quotationRouter = Router();

quotationRouter.use(verifyJwt);

const WORKER_ROLES = ['driver', 'hamali_solo', 'mutha_member', 'mutha_leader'] as const;

// Both parties read from the same two routes; the service decides what each
// of them is allowed to see.
quotationRouter.get(
  '/',
  [query('as').optional().isIn(['worker', 'customer'])],
  validate,
  quotationController.listMine
);
quotationRouter.get('/:id', [param('id').isMongoId()], validate, quotationController.getOne);

// ---- customer ------------------------------------------------------------
quotationRouter.post(
  '/',
  requireRole('customer'),
  [
    body('workerId').isMongoId(),
    body('categorySlug').isString().trim().notEmpty(),
    body('jobDescription').isString().trim().isLength({ min: 10, max: 2000 }),
    body('photos').optional().isArray({ max: 6 }),
  ],
  validate,
  quotationController.create
);

quotationRouter.post(
  '/:id/accept',
  requireRole('customer'),
  [
    param('id').isMongoId(),
    // Accepting creates the booking the work happens under, so it needs the
    // place — the quotation itself only ever described the job.
    body('coordinates').isArray({ min: 2, max: 2 }),
    body('address').isString().trim().notEmpty(),
    body('region').optional().isString(),
  ],
  validate,
  quotationController.accept
);

quotationRouter.post(
  '/:id/reject',
  requireRole('customer'),
  [param('id').isMongoId(), body('reason').optional().isString().isLength({ max: 500 })],
  validate,
  quotationController.reject
);

quotationRouter.post(
  '/:id/negotiate',
  requireRole('customer'),
  [param('id').isMongoId(), body('note').isString().trim().isLength({ min: 3, max: 500 })],
  validate,
  quotationController.negotiate
);

quotationRouter.post(
  '/:id/milestones/:index/confirm',
  requireRole('customer'),
  [param('id').isMongoId(), param('index').isInt({ min: 0, max: 9 })],
  validate,
  quotationController.confirmMilestonePayment
);

// The customer's approval is the only thing that can move an agreed price.
quotationRouter.post(
  '/variations/:variationId/decide',
  requireRole('customer'),
  [
    param('variationId').isMongoId(),
    body('approve').isBoolean(),
    body('note').optional().isString().isLength({ max: 500 }),
  ],
  validate,
  quotationController.decideVariation
);

// ---- worker --------------------------------------------------------------
quotationRouter.post(
  '/:id/schedule-visit',
  requireRole(...WORKER_ROLES),
  [param('id').isMongoId(), body('scheduledAt').isISO8601()],
  validate,
  quotationController.schedule
);

quotationRouter.post(
  '/:id/visit-done',
  requireRole(...WORKER_ROLES),
  [param('id').isMongoId()],
  validate,
  quotationController.markVisitDone
);

quotationRouter.post(
  '/:id/submit',
  requireRole(...WORKER_ROLES),
  [
    param('id').isMongoId(),
    body('lineItems').isArray({ min: 1, max: 40 }),
    body('lineItems.*.description').isString().trim().notEmpty(),
    body('lineItems.*.quantity').isFloat({ min: 0 }),
    body('lineItems.*.rate').isFloat({ min: 0 }),
    body('lineItems.*.unitType').optional().isIn(UNIT_TYPES),
    body('lineItems.*.isMaterial').optional().isBoolean(),
    body('lineItems.*.materialIsEstimate').optional().isBoolean(),
    body('validityDays').optional().isInt({ min: 1, max: 90 }),
    body('note').optional().isString().isLength({ max: 500 }),
  ],
  validate,
  quotationController.submit
);

quotationRouter.post(
  '/:id/variations',
  requireRole(...WORKER_ROLES),
  [
    param('id').isMongoId(),
    body('description').isString().trim().isLength({ min: 5, max: 1000 }),
    // Negative is allowed: work that turned out to be unnecessary should be
    // able to reduce the bill through the same documented route.
    body('amount').isFloat(),
  ],
  validate,
  quotationController.raiseVariation
);
