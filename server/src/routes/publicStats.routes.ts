import { Router } from 'express';
import * as publicStatsController from '../controllers/publicStats.controller';

/**
 * The only unauthenticated data route in the product, mounted at
 * /api/public. Aggregate counts and one sum, nothing per-record — see the
 * controller for why that scoping is what makes it safe to expose.
 */
export const publicRouter = Router();

publicRouter.get('/stats', publicStatsController.getPublicStats);
