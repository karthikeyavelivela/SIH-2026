import { Router } from 'express';
import { verifyJwt } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import * as opsHubController from '../controllers/opsHub.controller';

export const opsHubRouter = Router();

// Admin always passes; Manager needs 'view_analytics' — the ops hub is a
// read-only monitoring surface (operations_manager_hub in
// DESIGN_INVENTORY.md is a manager-role screen).
opsHubRouter.use(verifyJwt, requirePermission('view_analytics'));

opsHubRouter.get('/', opsHubController.getOpsHub);
