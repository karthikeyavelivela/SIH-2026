import { Router } from 'express';
import { param } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { storeFor } from '../infra/limiterStore';
import { clientIp } from '../middleware/clientIp';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { requestsLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import * as ivr from '../controllers/ivr.controller';

/**
 * Exotel's webhooks. No login (Exotel has none); the secret in the URL is the
 * check, and calls are limited per caller so a number cannot be used to hammer
 * the database. Mounted at /api/ivr/exotel.
 */
export const ivrRouter = Router();

const ivrLimiter = rateLimit({
  ...storeFor('ivrLimiter'),
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Please try again later.',
  keyGenerator: (req) => `${ivr.callerDigits(req.query.From) ?? clientIp(req)}:${req.path}`,
});

ivrRouter.get('/next-assignment', ivrLimiter, ivr.nextAssignment);
ivrRouter.get('/callback-request', ivrLimiter, ivr.requestCallback);

/** For the people who call back. Mounted at /api/admin/callback-requests. */
export const adminCallbackRouter = Router();
adminCallbackRouter.use(verifyJwt, requireRole('admin', 'manager'), requestsLimiter);
adminCallbackRouter.get('/', ivr.listCallbackRequests);
adminCallbackRouter.patch('/:id/done', [param('id').isMongoId()], validate, ivr.markCallbackDone);
