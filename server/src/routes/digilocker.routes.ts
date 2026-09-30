import { Router } from 'express';
import { body } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requestsLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { digilockerStatus, startFlow, completeFlow, DOCTYPE_CODES, type DigiLockerDocType } from '../services/digilocker.service';
import { storeKycDocument } from '../controllers/kycDocument.controller';
import type { KycDocumentType, Role } from '@fyro/shared';

/**
 * DigiLocker (mounted at /api/digilocker). Three calls: is it on, start a
 * sign-in (returns the DigiLocker address to send the person to), and finish it
 * (the web app's /digilocker/callback page passes DigiLocker's redirect here).
 * The fetched document is stored exactly like an uploaded one and still waits
 * for review.
 */
export const digilockerRouter = Router();
digilockerRouter.use(verifyJwt, requestsLimiter);

digilockerRouter.get('/status', asyncHandler(async (_req, res) => void res.status(200).json(digilockerStatus())));

digilockerRouter.post(
  '/start',
  [body('docType').isIn(Object.keys(DOCTYPE_CODES))],
  validate,
  asyncHandler(async (req, res) => void res.status(200).json(await startFlow(req.user!.id, req.body.docType as DigiLockerDocType)))
);

digilockerRouter.post(
  '/complete',
  [
    body('state').isString().isLength({ min: 10, max: 200 }),
    body('code').optional({ checkFalsy: true }).isString().isLength({ max: 500 }),
    body('error').optional({ checkFalsy: true }).isString().isLength({ max: 200 }),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const doc = await completeFlow(req.user!.id, req.user!.role as Role, req.body);
    const mime = doc.mime === 'image/jpg' ? 'image/jpeg' : doc.mime;
    const document = await storeKycDocument(req.user!.id, doc.docType as KycDocumentType, `data:${mime};base64,${doc.buffer.toString('base64')}`, 'digilocker');
    res.status(200).json({ document });
  })
);
