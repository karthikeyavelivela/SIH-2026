import { Router } from 'express';
import { body, param } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requestsLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import * as eshram from '../services/eshram.service';
import * as police from '../services/policeVerification.service';
import type { Role } from '@fyro/shared';

/** e-Shram: the worker's own record (mounted at /api/eshram). */
export const eShramRouter = Router();
eShramRouter.use(verifyJwt, requestsLimiter);

eShramRouter.get('/', asyncHandler(async (req, res) => void res.status(200).json(await eshram.getMyEShram(req.user!.id))));
eShramRouter.put(
  '/',
  [body('uan').isString().trim().matches(/^\d{12}$/).withMessage('The e-Shram number (UAN) is 12 digits')],
  validate,
  asyncHandler(async (req, res) => void res.status(200).json(await eshram.setUan(req.user!.id, req.user!.role as Role, req.body.uan)))
);
eShramRouter.post(
  '/card',
  [body('fileBase64').isString().isLength({ min: 1 })],
  validate,
  asyncHandler(async (req, res) => void res.status(200).json(await eshram.setCard(req.user!.id, req.user!.role as Role, req.body.fileBase64)))
);
eShramRouter.get('/card/url', asyncHandler(async (req, res) => void res.status(200).json(await eshram.myCardLink(req.user!.id))));

/** Police verification (mounted at /api/police-verification). */
export const policeVerificationRouter = Router();
policeVerificationRouter.use(verifyJwt, requestsLimiter);

const actor = (req: { user?: { id: string; role: string } }) => ({ id: req.user!.id, role: req.user!.role as Role });

policeVerificationRouter.post(
  '/',
  [
    body('referenceNumber').optional({ checkFalsy: true }).isString().trim().isLength({ max: 60 }),
    body('issuedOn').optional({ checkFalsy: true }).isISO8601(),
    body('fileBase64').optional({ checkFalsy: true }).isString(),
  ],
  validate,
  asyncHandler(async (req, res) => void res.status(201).json({ verification: await police.submit(req.user!.id, req.user!.role as Role, req.body) }))
);
policeVerificationRouter.get('/', asyncHandler(async (req, res) => void res.status(200).json({ verifications: await police.listMine(req.user!.id) })));
// Before '/:id' so "queue" is not read as an id.
policeVerificationRouter.get('/queue', asyncHandler(async (req, res) => void res.status(200).json({ queue: await police.queueFor(actor(req)) })));
policeVerificationRouter.patch(
  '/:id',
  [param('id').isMongoId(), body('decision').isIn(['verified', 'rejected']), body('reason').optional({ checkFalsy: true }).isString().trim().isLength({ max: 300 })],
  validate,
  asyncHandler(async (req, res) => void res.status(200).json({ verification: await police.decide(actor(req), req.params.id, req.body.decision, req.body.reason) }))
);
policeVerificationRouter.get(
  '/:id/url',
  [param('id').isMongoId()],
  validate,
  asyncHandler(async (req, res) => void res.status(200).json(await police.viewLink(actor(req), req.params.id)))
);
