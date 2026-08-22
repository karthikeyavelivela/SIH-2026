import { Router } from 'express';
import { body, param } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { agentLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import * as agentsController from '../controllers/agents.controller';
import type { KycDocumentType } from '@fyro/shared';

export const agentsRouter = Router();

agentsRouter.use(verifyJwt, agentLimiter);

// Agent A — any authenticated role may ask about their OWN records.
agentsRouter.post(
  '/support',
  [body('question').isString().trim().isLength({ min: 1, max: 500 })],
  validate,
  agentsController.askSupportAgent
);

// Agent B — admin-only, same posture as dispute.routes.ts (money/
// account-status decisions downstream of this).
agentsRouter.post(
  '/dispute-triage/:id',
  requireRole('admin'),
  [param('id').isMongoId()],
  validate,
  agentsController.triageDispute
);

// Agent C — worker roles get an earnings hint, mutha_leader gets
// workforce allocation, admin/manager get the surge-recommendation
// framing. requireRole here is deliberately the union of all of them —
// agents.controller.ts's AUDIENCE_BY_ROLE is what actually picks the
// framing per role, server-side, never trusted from the client.
agentsRouter.post(
  '/demand-forecast',
  requireRole('driver', 'hamali_solo', 'mutha_member', 'mutha_leader', 'admin', 'manager'),
  [body('region').isString().trim().isLength({ min: 1, max: 100 })],
  validate,
  agentsController.forecastDemand
);

// Agent D — any worker/fleet/warehouse role pre-checking their OWN just-
// uploaded document.
const KYC_DOCUMENT_TYPES: KycDocumentType[] = [
  'driving_licence', 'vehicle_rc', 'fastag', 'goods_carriage_permit',
  'puc', 'vehicle_fitness', 'aadhaar', 'pan', 'gstin',
];
agentsRouter.post(
  '/document-precheck',
  [body('documentType').isIn(KYC_DOCUMENT_TYPES)],
  validate,
  agentsController.precheckDocument
);

// Agent E — any authenticated role sanity-checking a quote (customer
// before booking; fleet_owner/warehouse_hub/admin setting/reviewing rates).
const FARE_CATEGORIES = ['vehicle_small', 'vehicle_medium', 'vehicle_large', 'hamali'];
agentsRouter.post(
  '/pricing-quote',
  [
    body('region').isString().trim().isLength({ min: 1, max: 100 }),
    body('category').isIn(FARE_CATEGORIES),
    body('distanceKm').isFloat({ min: 0, max: 5000 }),
    body('hamaliCount').optional().isInt({ min: 0, max: 50 }),
  ],
  validate,
  agentsController.getPricingQuote
);

// Agent F — admin/manager only, same role gate as analytics.routes.ts.
agentsRouter.post(
  '/market-insights',
  requireRole('admin', 'manager'),
  [body('region').optional().isString().trim().isLength({ min: 1, max: 100 })],
  validate,
  agentsController.getMarketInsights
);
