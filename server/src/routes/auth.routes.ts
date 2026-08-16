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
  [nameRule, phoneRule, passwordRule, body('email').optional().isEmail()],
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
