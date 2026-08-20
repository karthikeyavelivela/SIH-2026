import { Router } from 'express';
import { body } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as referralController from '../controllers/referral.controller';

// Self-service router — mount at /api/referrals. Every route is scoped to
// req.user.id server-side (see referral.controller); no client-supplied
// referrerId is ever trusted.
export const referralRouter = Router();

referralRouter.use(verifyJwt, requireRole('driver', 'hamali_solo', 'fleet_owner'));

referralRouter.get('/me', referralController.getMyReferrals);
referralRouter.post('/code', referralController.createMyReferralCode);
referralRouter.post(
  '/invite',
  [body('phone').isString().trim().notEmpty().isLength({ min: 6, max: 20 })],
  validate,
  referralController.inviteReferral
);

// Admin-only payout scan — see referral.controller.checkReferralPayouts for
// why this is the trigger instead of a hook in the booking-completion path.
// Mount at /api/admin/referrals.
export const adminReferralRouter = Router();

adminReferralRouter.use(verifyJwt, requireRole('admin'));
adminReferralRouter.post('/check-payouts', referralController.checkReferralPayouts);
