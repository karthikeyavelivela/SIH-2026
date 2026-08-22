import { Router } from 'express';
import { body, param } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as warehouseHubController from '../controllers/warehouseHub.controller';

export const warehouseHubRouter = Router();

const DOCK_SLOT_STATUSES = ['available', 'occupied', 'reserved', 'closed'];

warehouseHubRouter.use(verifyJwt, requireRole('warehouse_hub'));

warehouseHubRouter.get('/me', warehouseHubController.getMyHub);
warehouseHubRouter.patch(
  '/me',
  [
    body('name').optional().isString().trim().isLength({ min: 1, max: 100 }),
    body('address').optional().isString().trim().isLength({ max: 300 }),
    body('operatingHours').optional().isString().trim().isLength({ max: 100 }),
    body('gateContacts').optional().isArray({ max: 10 }),
    body('gateContacts.*.name').optional().isString().trim().notEmpty(),
    body('gateContacts.*.phone').optional().isString().trim().isLength({ min: 10, max: 15 }),
  ],
  validate,
  warehouseHubController.updateMyHub
);

warehouseHubRouter.patch(
  '/dock-slots/:id',
  [param('id').isMongoId(), body('status').isIn(DOCK_SLOT_STATUSES)],
  validate,
  warehouseHubController.updateDockSlotStatus
);

warehouseHubRouter.post(
  '/dock-slots',
  [body('label').isString().trim().notEmpty()],
  validate,
  warehouseHubController.createDockSlot
);
