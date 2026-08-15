import { Router } from 'express';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { requestsLimiter } from '../middleware/rateLimit';
import * as earningsController from '../controllers/earnings.controller';

export const earningsRouter = Router();

earningsRouter.use(verifyJwt, requestsLimiter);
earningsRouter.get(
  '/me',
  requireRole('driver', 'hamali_solo', 'mutha_member', 'mutha_leader'),
  earningsController.getMyEarnings
);
