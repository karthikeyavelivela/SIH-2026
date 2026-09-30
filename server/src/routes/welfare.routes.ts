import { Router } from 'express';
import { z } from 'zod';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validateZod } from '../middleware/zod';
import { requestsLimiter } from '../middleware/rateLimit';
import * as welfareController from '../controllers/welfare.controller';

// A worker's own welfare card.
export const welfareRouter = Router();
welfareRouter.use(verifyJwt, requireRole('hamali_solo', 'mutha_member', 'mutha_leader', 'driver'));
welfareRouter.get('/me', requestsLimiter, welfareController.getMyWelfare);

// The federation panel.
export const federationWelfareRouter = Router();
federationWelfareRouter.use(verifyJwt, requireRole('federation_state_admin', 'federation_district_admin'));
federationWelfareRouter.get('/', welfareController.getFederationWelfare);

// Admin: run the weekly check now (dry run unless dryRun=false), list real checks.
export const adminWelfareRouter = Router();
adminWelfareRouter.use(verifyJwt, requireRole('admin'));
adminWelfareRouter.post(
  '/run-check',
  validateZod({ query: z.object({ dryRun: z.enum(['true', 'false']).optional() }) }),
  welfareController.runCheck
);
adminWelfareRouter.get('/checks', welfareController.listChecks);
