import { Router } from 'express';
import { body, param } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as governanceController from '../controllers/governance.controller';

// SIH26089 Phase B.2 — cooperative governance. Every route needs a Society
// membership (leader or member) — requireRole's union covers both, with
// several routes further restricted to mutha_leader only where the action
// is a real leadership decision (setting bye-laws, issuing shares,
// triggering a surplus run, creating/closing a poll).
export const governanceRouter = Router();
governanceRouter.use(verifyJwt, requireRole('mutha_leader', 'mutha_member'));

governanceRouter.patch(
  '/bye-laws',
  requireRole('mutha_leader'),
  [
    body('commissionRatePct').isFloat({ min: 0, max: 100 }),
    body('welfareDeductionRatePct').isFloat({ min: 0, max: 100 }),
  ],
  validate,
  governanceController.updateByLaws
);

governanceRouter.post(
  '/shares/issue',
  requireRole('mutha_leader'),
  [
    body('userId').isMongoId(),
    body('shareCount').isInt({ min: 1, max: 10000 }),
    body('shareValue').isFloat({ min: 0 }),
  ],
  validate,
  governanceController.issueShares
);
governanceRouter.get('/shares', governanceController.listShares);

governanceRouter.post(
  '/surplus/compute',
  requireRole('mutha_leader'),
  [body('periodStart').isISO8601(), body('periodEnd').isISO8601()],
  validate,
  governanceController.computeSurplusForSociety
);
governanceRouter.post(
  '/surplus/:id/distribute',
  requireRole('mutha_leader'),
  [param('id').isMongoId()],
  validate,
  governanceController.distributeSurplusForSociety
);
governanceRouter.get('/surplus', governanceController.listSurplusDistributions);

governanceRouter.get('/commission-records/me', governanceController.getMyCommissionRecords);

governanceRouter.post(
  '/polls',
  requireRole('mutha_leader'),
  [
    body('type').isIn(['rate_card', 'leader_election']),
    body('question').isString().trim().isLength({ min: 1, max: 300 }),
    body('options').isArray({ min: 2 }),
    body('options.*.label').isString().trim().isLength({ min: 1, max: 100 }),
    body('options.*.value').isString().trim().isLength({ min: 1, max: 500 }),
    body('closesAt').isISO8601(),
  ],
  validate,
  governanceController.createPoll
);
governanceRouter.get('/polls', governanceController.listPolls);
governanceRouter.post(
  '/polls/:id/vote',
  [param('id').isMongoId(), body('optionIndex').isInt({ min: 0 })],
  validate,
  governanceController.castVote
);
governanceRouter.post(
  '/polls/:id/close',
  requireRole('mutha_leader'),
  [param('id').isMongoId()],
  validate,
  governanceController.closePoll
);
