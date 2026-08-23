import { Router } from 'express';
import { body, param } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { requestsLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import * as muthaController from '../controllers/mutha.controller';
import { requestAffiliation } from '../controllers/governance.controller';

export const muthaRouter = Router();

// Every route needs auth + the shared rate limiter; role is enforced
// per-route below (not router-wide) because /my-group is the one route a
// mutha_member is allowed to hit — a member has no group-MANAGEMENT
// authority (membership/assignment stays leader-controlled per spec), but
// does need read access to their own group/leader info.
muthaRouter.use(verifyJwt, requestsLimiter);

muthaRouter.get('/me', requireRole('mutha_leader'), muthaController.getMyMutha);
muthaRouter.get('/district-federations', requireRole('mutha_leader'), muthaController.listDistrictFederations);

muthaRouter.patch(
  '/me',
  requireRole('mutha_leader'),
  [
    body('name').optional().isString().trim().isLength({ min: 1, max: 80 }),
    body('region').optional().isString().trim().isLength({ max: 80 }),
    body('imageBase64').optional().isString().isLength({ min: 100 }),
  ],
  validate,
  muthaController.updateMyGroup
);

muthaRouter.delete(
  '/members/:userId',
  requireRole('mutha_leader'),
  [param('userId').isMongoId()],
  validate,
  muthaController.removeMember
);

muthaRouter.get('/my-group', requireRole('mutha_member'), muthaController.getMyGroupAsMember);

muthaRouter.post('/leave', requireRole('mutha_member'), muthaController.leaveMutha);

muthaRouter.post(
  '/earnings-discrepancy',
  requireRole('mutha_member'),
  [
    body('bookingId').isMongoId(),
    body('description').isString().trim().isLength({ min: 1, max: 1000 }),
  ],
  validate,
  muthaController.flagEarningsDiscrepancy
);

// SIH26089 Phase B.1 — leader requests affiliation to a district
// federation. Lives in governance.controller.ts (governance-flavoured),
// mounted here since /api/mutha is the leader's own existing surface.
muthaRouter.post(
  '/affiliation-request',
  requireRole('mutha_leader'),
  [
    body('districtFederationId').isMongoId(),
    body('societyRegistrationNumber').isString().trim().isLength({ min: 1, max: 100 }),
    body('registeredUnderAct').isIn(['AP Cooperative Societies Act 1964', 'AP Mutually Aided Cooperative Societies Act 1995']),
  ],
  validate,
  requestAffiliation
);

muthaRouter.post(
  '/jobs/:bookingId/assign',
  requireRole('mutha_leader'),
  [
    param('bookingId').isMongoId(),
    body('memberIds').isArray({ min: 1 }),
    body('memberIds.*').isMongoId(),
  ],
  validate,
  muthaController.assignJobMembers
);
