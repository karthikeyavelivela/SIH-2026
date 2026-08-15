import { Router } from 'express';
import { param } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { requestsLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import * as muthaController from '../controllers/mutha.controller';

export const muthaRouter = Router();

// Leader-only — a mutha_member has no group-management authority (spec:
// membership/assignment is leader-controlled), so this router doesn't
// accept that role at all.
muthaRouter.use(verifyJwt, requestsLimiter, requireRole('mutha_leader'));

muthaRouter.get('/me', muthaController.getMyMutha);
muthaRouter.delete(
  '/members/:userId',
  [param('userId').isMongoId()],
  validate,
  muthaController.removeMember
);
