import { Router } from 'express';
import { verifyJwt } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import * as analyticsController from '../controllers/analytics.controller';

export const analyticsRouter = Router();

// Admin always passes; Manager needs 'view_analytics' — same permission
// adminStats.routes.ts already gates the dashboard KPIs behind.
analyticsRouter.use(verifyJwt, requirePermission('view_analytics'));

analyticsRouter.get('/overview', analyticsController.getAnalyticsOverview);
