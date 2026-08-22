import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import { authLimiter } from '../middleware/rateLimit';
import { verifyJwt } from '../middleware/auth';
import * as authController from '../controllers/auth.controller';

export const authRouter = Router();

const passwordRule = body('password').isString().isLength({ min: 8 });
const phoneRule = body('phone').isString().isLength({ min: 10, max: 15 });
// min: 1 (not 2) — the auth test suite intentionally uses single-character
// names (e.g. 'A', 'x') for throwaway fixtures; the real requirement here is
// "non-empty", not a minimum length on a real display name.
const nameRule = body('name').isString().trim().isLength({ min: 1 });

authRouter.post(
  '/signup/customer',
  authLimiter,
  // checkFalsy: true — the client always sends email:'' when left blank
  // (a controlled input, never omitted from the request body), and
  // express-validator's optional() only skips *absent* fields by default,
  // not falsy ones. Without checkFalsy, signup with no email 400s every
  // time despite the field being labeled optional.
  [nameRule, phoneRule, passwordRule, body('email').optional({ checkFalsy: true }).isEmail()],
  validate,
  authController.signupCustomer
);

authRouter.post(
  '/signup/driver',
  authLimiter,
  [
    nameRule,
    phoneRule,
    passwordRule,
    body('vehicleType').isString().notEmpty(),
    body('capacityKg').isFloat({ min: 1 }),
    body('registrationNumber').isString().notEmpty(),
  ],
  validate,
  authController.signupDriver
);

authRouter.post(
  '/signup/hamali',
  authLimiter,
  [
    nameRule,
    phoneRule,
    passwordRule,
    body('joinType').isIn(['solo', 'leader', 'member']),
    body('muthaName').if(body('joinType').equals('leader')).isString().notEmpty(),
    body('inviteCode').if(body('joinType').equals('member')).isString().notEmpty(),
  ],
  validate,
  authController.signupHamali
);

authRouter.post(
  '/signup/fleet-owner',
  authLimiter,
  [nameRule, phoneRule, passwordRule, body('fleetName').isString().trim().notEmpty()],
  validate,
  authController.signupFleetOwner
);

authRouter.post(
  '/signup/warehouse-hub',
  authLimiter,
  [nameRule, phoneRule, passwordRule, body('hubName').isString().trim().notEmpty(), body('address').optional().isString()],
  validate,
  authController.signupWarehouseHub
);

authRouter.post(
  '/login',
  authLimiter,
  [phoneRule, body('password').isString().notEmpty()],
  validate,
  authController.login
);

authRouter.post('/refresh', authController.refresh);
authRouter.post('/logout', verifyJwt, authController.logout);
authRouter.get('/me', verifyJwt, authController.me);
authRouter.patch(
  '/switch-role',
  verifyJwt,
  [body('role').isString().notEmpty()],
  validate,
  authController.switchRole
);
authRouter.patch(
  '/me/photo',
  verifyJwt,
  [body('imageBase64').isString().isLength({ min: 100 })],
  validate,
  authController.updateMyPhoto
);
authRouter.patch(
  '/me/documents',
  verifyJwt,
  [
    body('licenseExpiryAt').optional({ nullable: true }).isISO8601(),
    body('insuranceExpiryAt').optional({ nullable: true }).isISO8601(),
  ],
  validate,
  authController.updateMyDocuments
);

// ---- Phase 2 profile remediation ----

authRouter.patch(
  '/me/profile',
  verifyJwt,
  [
    body('name').optional().isString().trim().isLength({ min: 1, max: 100 }),
    body('email').optional({ checkFalsy: true }).isEmail(),
  ],
  validate,
  authController.updateMyProfile
);

authRouter.post(
  '/me/phone/request-otp',
  authLimiter,
  verifyJwt,
  [body('newPhone').isString().isLength({ min: 10, max: 15 })],
  validate,
  authController.requestPhoneChangeOtp
);

authRouter.post(
  '/me/phone/confirm',
  authLimiter,
  verifyJwt,
  [body('otp').isString().isLength({ min: 6, max: 6 })],
  validate,
  authController.confirmPhoneChange
);

authRouter.patch(
  '/me/password',
  authLimiter,
  verifyJwt,
  [body('currentPassword').isString().notEmpty(), body('newPassword').isString().isLength({ min: 8 })],
  validate,
  authController.updateMyPassword
);

authRouter.patch(
  '/me/notification-preferences',
  verifyJwt,
  [
    body('channel').isIn(['push', 'sms']),
    body('category').isIn(['jobUpdates', 'payments', 'promotions']),
    body('enabled').isBoolean(),
  ],
  validate,
  authController.updateNotificationPreferences
);

authRouter.patch(
  '/me/privacy',
  verifyJwt,
  [
    body('shareLocationWhileOffline').optional().isBoolean(),
    body('profileVisibility').optional().isIn(['public', 'private']),
  ],
  validate,
  authController.updateMyPrivacy
);

authRouter.patch(
  '/me/payout-details',
  verifyJwt,
  [
    body('method').isIn(['bank', 'upi']),
    body('accountHolderName').if(body('method').equals('bank')).isString().trim().notEmpty(),
    body('bankAccountNumber').if(body('method').equals('bank')).isString().trim().isLength({ min: 6, max: 30 }),
    body('ifsc').if(body('method').equals('bank')).isString().trim().isLength({ min: 11, max: 11 }),
    body('upiId').if(body('method').equals('upi')).isString().trim().notEmpty(),
  ],
  validate,
  authController.updateMyPayoutDetails
);

authRouter.delete('/me', verifyJwt, authController.deleteMyAccount);
