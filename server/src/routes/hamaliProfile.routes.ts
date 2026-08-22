import { Router } from 'express';
import { body } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as hamaliProfileController from '../controllers/hamaliProfile.controller';
import { KNOWN_SKILLS } from '../controllers/hamaliProfile.controller';

export const hamaliProfileRouter = Router();

hamaliProfileRouter.use(verifyJwt, requireRole('hamali_solo', 'mutha_member'));

hamaliProfileRouter.get('/me', hamaliProfileController.getMyHamaliProfile);
hamaliProfileRouter.patch(
  '/me',
  [
    body('skills').optional().isArray(),
    body('skills.*').optional().isIn(KNOWN_SKILLS),
    body('physicalCapacityKg').optional({ nullable: true }).isFloat({ min: 0, max: 500 }),
  ],
  validate,
  hamaliProfileController.updateMyHamaliProfile
);
