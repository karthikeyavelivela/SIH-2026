import { Router } from 'express';
import { verifyJwt } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import * as adminStatsController from '../controllers/adminStats.controller';

export const adminStatsRouter = Router();

// Gated by 'view_analytics' — Admin always passes; Manager needs the
// permission explicitly, matching MANAGER_PERMISSIONS in shared/types.ts.
adminStatsRouter.get('/', verifyJwt, requirePermission('view_analytics'), adminStatsController.getAdminStats);
