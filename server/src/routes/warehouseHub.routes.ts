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
