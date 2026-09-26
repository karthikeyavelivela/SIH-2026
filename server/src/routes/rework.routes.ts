import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validateZod, objectId } from '../middleware/zod';
import { requestsLimiter } from '../middleware/rateLimit';
import { asyncHandler } from '../utils/asyncHandler';
import { recordReworkMaterials, reassignRework } from '../services/guarantee.service';

/**
 * P1.3 — guarantee re-work jobs. The start / complete flow is the ordinary
 * one (requests routes); these two are what is different about a re-work.
 */
export const reworkRouter = Router();
reworkRouter.use(verifyJwt);

// The assigned worker records the materials used — the only thing the customer pays.
reworkRouter.post(
  '/:id/materials',
  requireRole('hamali_solo', 'mutha_member', 'driver'),
  requestsLimiter,
  validateZod({
    params: z.object({ id: objectId }),
    body: z.object({ amount: z.number().min(0).max(100000), note: z.string().max(300).optional() }),
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const { amount, note } = req.body as { amount: number; note?: string };
    const booking = await recordReworkMaterials(req.user!.id, req.params.id, amount, note);
    res.status(200).json({ booking });
  })
);

// The society leader reassigns a re-work that has not started to other members.
reworkRouter.patch(
  '/:id/assign',
  requireRole('mutha_leader'),
  validateZod({
    params: z.object({ id: objectId }),
    body: z.object({ memberIds: z.array(objectId).min(1).max(20) }),
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const booking = await reassignRework(req.user!.id, req.params.id, (req.body as { memberIds: string[] }).memberIds);
    res.status(200).json({ booking });
  })
);
