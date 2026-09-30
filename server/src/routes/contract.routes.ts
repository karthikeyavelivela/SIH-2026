import { Router } from 'express';
import { z } from 'zod';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validateZod, objectId } from '../middleware/zod';
import { requestsLimiter } from '../middleware/rateLimit';
import * as contractController from '../controllers/contract.controller';

/**
 * P1.6 — institutions and bulk contracts. Institutions are customers with
 * accountType 'institution'; the service re-checks that on every proposal.
 */
export const contractRouter = Router();
contractRouter.use(verifyJwt, requestsLimiter);

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

contractRouter.put(
  '/institution-profile',
  requireRole('customer'),
  validateZod({
    body: z
      .object({
        accountType: z.enum(['household', 'institution']),
        institutionType: z
          .enum(['school', 'college', 'hospital', 'hostel', 'office', 'apartment_association', 'factory', 'warehouse', 'other'])
          .optional(),
        orgName: z.string().trim().min(2).max(200).optional(),
        gstin: z.string().trim().toUpperCase().regex(GSTIN, 'GSTIN is not in the 15-character format').optional().or(z.literal('')),
      })
      .refine((b) => b.accountType === 'household' || (!!b.institutionType && !!b.orgName), {
        message: 'An institution needs a type and a name',
      }),
  }),
  contractController.setInstitutionProfile
);

const schedule = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  frequency: z.enum(['weekly', 'monthly']).optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  dayOfMonth: z.number().int().min(1).max(28).optional(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  durationHours: z.number().min(1).max(12),
});

const proposal = z.object({
  muthaId: objectId,
  categorySlug: z.string().trim().min(1).max(60),
  scope: z.string().trim().min(5).max(2000),
  kind: z.enum(['one_off', 'recurring']),
  schedule,
  workersPerVisit: z.number().int().min(1).max(50),
  ratePerWorkerPerVisit: z.number().positive().max(100000),
  region: z.string().trim().min(1).max(100),
  location: z.object({ coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]), address: z.string().trim().min(1).max(300) }),
});

contractRouter.get('/societies', requireRole('customer'), contractController.listSocieties);
contractRouter.post(
  '/check-rate',
  requireRole('customer', 'mutha_leader'),
  validateZod({
    body: z.object({
      categorySlug: z.string().min(1),
      region: z.string().min(1),
      ratePerWorkerPerVisit: z.number().positive(),
      schedule: z.object({ durationHours: z.number().min(1).max(12) }),
    }),
  }),
  contractController.checkRate
);
contractRouter.post('/', requireRole('customer'), validateZod({ body: proposal }), contractController.propose);
contractRouter.get('/mine', requireRole('customer', 'mutha_leader'), contractController.listMine);
contractRouter.get(
  '/federation',
  requireRole('federation_district_admin', 'federation_state_admin', 'admin'),
  contractController.listForFederation
);
contractRouter.get('/:id', validateZod({ params: z.object({ id: objectId }) }), contractController.getOne);
contractRouter.post(
  '/:id/leader',
  requireRole('mutha_leader'),
  validateZod({
    params: z.object({ id: objectId }),
    body: z.object({
      action: z.enum(['accept', 'counter', 'reject', 'cancel']),
      ratePerWorkerPerVisit: z.number().positive().max(100000).optional(),
      workersPerVisit: z.number().int().min(1).max(50).optional(),
      note: z.string().trim().max(1000).optional(),
    }),
  }),
  contractController.leaderAction
);
contractRouter.post(
  '/:id/institution',
  requireRole('customer'),
  validateZod({
    params: z.object({ id: objectId }),
    body: z.object({
      action: z.enum(['accept_counter', 'reject_counter', 'pause', 'resume', 'cancel']),
      note: z.string().trim().max(1000).optional(),
    }),
  }),
  contractController.institutionAction
);
contractRouter.get(
  '/:id/statement',
  validateZod({ params: z.object({ id: objectId }), query: z.object({ month: z.string().optional() }) }),
  contractController.statement
);
contractRouter.get(
  '/:id/invoice',
  validateZod({ params: z.object({ id: objectId }), query: z.object({ month: z.string().optional() }) }),
  contractController.invoice
);
