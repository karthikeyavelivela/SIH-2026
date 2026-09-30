import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { requestsLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { SCHEME_CODES } from '../models/SchemePlan';
import * as schemes from '../services/scheme.service';
import type { Role } from '@fyro/shared';

const actor = (req: { user?: { id: string; role: string } }) => ({ id: req.user!.id, role: req.user!.role as Role });

/** PMSBY / PMJJBY: plans, and enrolment records made through the member's bank (mounted at /api/schemes). */
export const schemeRouter = Router();
schemeRouter.use(verifyJwt, requestsLimiter);

const code = param('code').isIn(SCHEME_CODES);

schemeRouter.get('/', asyncHandler(async (_req, res) => void res.status(200).json({ label: schemes.ENROLMENT_LABEL, plans: await schemes.listPlans() })));
schemeRouter.get('/mine', asyncHandler(async (req, res) => void res.status(200).json({ enrolments: await schemes.listMine(req.user!.id) })));
schemeRouter.get('/society', requireRole('mutha_leader'), asyncHandler(async (req, res) => void res.status(200).json({ enrolments: await schemes.listForSociety(req.user!.id) })));

schemeRouter.post(
  '/:code/enrol',
  [
    code,
    body('memberId').optional({ checkFalsy: true }).isMongoId(),
    body('bankName').isString().trim().isLength({ min: 2, max: 100 }),
    body('accountLast4').optional({ checkFalsy: true }).isString().matches(/^\d{4}$/).withMessage('Give only the last 4 digits of the account'),
    body('nominee.name').isString().trim().isLength({ min: 2, max: 100 }),
    body('nominee.relation').isString().trim().isLength({ min: 2, max: 40 }),
    body('consent').isBoolean(),
    body('bankReference').optional({ checkFalsy: true }).isString().trim().isLength({ max: 60 }),
  ],
  validate,
  asyncHandler(async (req, res) => void res.status(201).json({ enrolment: await schemes.enrol(actor(req), req.params.code as never, req.body) }))
);

schemeRouter.post(
  '/enrolments/:id/bank-confirmation',
  [param('id').isMongoId(), body('bankReference').isString().trim().isLength({ min: 3, max: 60 })],
  validate,
  asyncHandler(async (req, res) => void res.status(200).json({ enrolment: await schemes.confirmWithBank(actor(req), req.params.id, req.body.bankReference) }))
);

/** Admin: the published figures, with a source (mounted at /api/admin/scheme-plans). */
export const adminSchemeRouter = Router();
adminSchemeRouter.use(verifyJwt, requireRole('admin'), requestsLimiter);

adminSchemeRouter.put(
  '/:code',
  [
    code,
    body('premiumAnnual').isFloat({ gt: 0, max: 100000 }).toFloat(),
    body('coverageAmount').optional({ checkFalsy: true }).isFloat({ gt: 0 }).toFloat(),
    body('sourceUrl').isString().trim().isURL({ require_protocol: true, protocols: ['http', 'https'] }),
    body('sourceNote').optional({ checkFalsy: true }).isString().trim().isLength({ max: 300 }),
  ],
  validate,
  asyncHandler(async (req, res) => void res.status(200).json({ plan: await schemes.setPlanFigures(actor(req), req.params.code as never, req.body) }))
);

// Dry run by default: computing never pays anything unless asked to.
adminSchemeRouter.post(
  '/renewals/run',
  [query('dryRun').optional().isIn(['true', 'false'])],
  validate,
  asyncHandler(async (req, res) => {
    const dryRun = req.query.dryRun !== 'false';
    res.status(200).json({ dryRun, results: await schemes.runSchemeRenewals({ dryRun }) });
  })
);
