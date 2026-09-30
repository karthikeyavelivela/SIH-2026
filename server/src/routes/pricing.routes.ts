import { Router } from 'express';
import { body, query } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as pricingController from '../controllers/pricing.controller';
import { PRICING_MODES, UNIT_TYPES } from '@fyro/shared';

export const pricingRouter = Router();

pricingRouter.use(verifyJwt);

// The controlled list of units and what each one declares. Public to any
// signed-in account because both sides of a booking need to read the same
// definition — that shared definition is the point.
pricingRouter.get('/units', pricingController.getUnitDeclarations);

// The trade's common jobs and typical bands, for the worker's own form.
pricingRouter.get(
  '/guide',
  [query('categorySlug').isString().trim().notEmpty()],
  validate,
  pricingController.getCategoryGuide
);

// ---- worker: publish your own rates -------------------------------------
// Every service-providing role. A driver prices an hourly engagement, a
// hamali prices loading, a society member prices their trade.
const WORKER_ROLES = ['driver', 'hamali_solo', 'mutha_member', 'mutha_leader'] as const;

pricingRouter.get('/mine', requireRole(...WORKER_ROLES), pricingController.getMyPricing);

pricingRouter.get(
  '/mine/floors',
  requireRole(...WORKER_ROLES),
  [query('categorySlug').isString().trim().notEmpty()],
  validate,
  pricingController.getMyFloors
);

pricingRouter.put(
  '/mine',
  requireRole(...WORKER_ROLES),
  [
    body('categorySlug').isString().trim().notEmpty(),
    body('modesOffered').isArray({ min: 1 }),
    body('modesOffered.*').isIn(PRICING_MODES),
    body('hourly.rate').optional().isFloat({ min: 1 }),
    body('hourly.minimumBlockHours').optional().isFloat({ min: 0.5, max: 12 }),
    body('perUnit').optional().isArray(),
    // A per-unit rate with no declared unit is the ambiguity this whole
    // feature exists to remove, so it cannot even be submitted.
    body('perUnit.*.unitType').isIn(UNIT_TYPES),
    body('perUnit.*.rate').isFloat({ min: 1 }),
    body('perUnit.*.minutesPerUnit').optional({ values: 'null' }).isInt({ min: 1, max: 600 }),
    body('perTask').optional().isArray(),
    body('perTask.*.taskSlug').optional().isString(),
    body('perTask.*.taskName').isString().trim().notEmpty(),
    body('perTask.*.fixedPrice').isFloat({ min: 1 }),
    body('quotation.siteVisitFee').optional().isFloat({ min: 0 }),
  ],
  validate,
  pricingController.upsertMyPricing
);

// ---- society: the floor beneath its members -----------------------------
pricingRouter.get('/society/floors', pricingController.listSocietyFloors);

pricingRouter.put(
  '/society/floors',
  requireRole('mutha_leader'),
  [
    body('categorySlug').isString().trim().notEmpty(),
    body('mode').isIn(PRICING_MODES),
    body('unitType').optional().isIn(UNIT_TYPES),
    body('minimumRate').isFloat({ min: 0 }),
  ],
  validate,
  pricingController.setSocietyFloor
);

// ---- customer: browse and quote -----------------------------------------
pricingRouter.get(
  '/workers',
  [query('categorySlug').isString().trim().notEmpty(), query('mode').optional().isIn(PRICING_MODES)],
  validate,
  pricingController.listWorkersForCategory
);

pricingRouter.post(
  '/quote',
  [
    body('workerId').isMongoId(),
    body('categorySlug').isString().trim().notEmpty(),
    body('mode').isIn(PRICING_MODES),
    body('unitType').optional().isIn(UNIT_TYPES),
    body('quantity').optional().isFloat({ min: 0 }),
    body('taskName').optional().isString(),
    body('quotationId').optional().isMongoId(),
  ],
  validate,
  pricingController.quoteWork
);
