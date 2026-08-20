import { Router } from 'express';
import { body, param } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as surgeZoneController from '../controllers/surgeZone.controller';

export const surgeZoneRouter = Router();

// Admin always passes; Manager needs 'edit_fare_rules' — surge multiplier is
// a pricing lever, same permission family as FareRule edits per
// MANAGER_PERMISSIONS (no dedicated 'manage_surge' slot exists).
surgeZoneRouter.use(verifyJwt, requirePermission('edit_fare_rules'));

surgeZoneRouter.get('/', surgeZoneController.listSurgeZones);
surgeZoneRouter.post(
  '/',
  [
    body('name').isString().trim().isLength({ min: 1, max: 100 }),
    body('multiplier').isFloat({ min: 1, max: 3 }),
    body('durationMinutes').isInt({ min: 5, max: 1440 }),
  ],
  validate,
  surgeZoneController.createSurgeZone
);
surgeZoneRouter.patch('/:id/end', [param('id').isMongoId()], validate, surgeZoneController.endSurgeZone);
