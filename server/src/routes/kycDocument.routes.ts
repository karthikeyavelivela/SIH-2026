import { Router } from 'express';
import { z } from 'zod';
import { validateZod, objectId } from '../middleware/zod';
import { requestsLimiter, offlineKycLimiter } from '../middleware/rateLimit';
import * as aadhaarOfflineKycController from '../controllers/aadhaarOfflineKyc.controller';
import { body, param } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as kycDocumentController from '../controllers/kycDocument.controller';
import { KYC_DOCUMENT_TYPES } from '../controllers/kycDocument.controller';

export const kycDocumentRouter = Router();

// Any authenticated role may reach these (not role-restricted to the
// worker/fleet/warehouse roles that actually need KYC) — a customer hitting
// this is harmless (they'd just be uploading a document nothing ever gates
// on) and restricting it would need to duplicate REQUIRED_KYC_DOCS_BY_ROLE's
// role list here for no real safety benefit; ownership scoping via
// req.user!.id (never a client-supplied id) is what actually matters.
kycDocumentRouter.use(verifyJwt);

kycDocumentRouter.get('/', kycDocumentController.listMyKycDocuments);

// P4.1 — Aadhaar Paperless Offline e-KYC. Off unless AADHAAR_OFFLINE_EKYC_ENABLED.
kycDocumentRouter.get('/aadhaar-offline', aadhaarOfflineKycController.offlineKycStatus);
kycDocumentRouter.post(
  '/aadhaar-offline',
  offlineKycLimiter,
  [body('fileBase64').isString().isLength({ min: 1, max: 2_000_000 }), body('shareCode').isString().isLength({ min: 1, max: 64 })],
  validate,
  aadhaarOfflineKycController.submitOfflineKyc
);
kycDocumentRouter.get(
  '/:id/url',
  requestsLimiter,
  validateZod({ params: z.object({ id: objectId }) }),
  kycDocumentController.getKycDocumentUrl
);

kycDocumentRouter.post(
  '/',
  [
    body('type').isIn(KYC_DOCUMENT_TYPES),
    body('fileBase64').isString().isLength({ min: 1 }),
  ],
  validate,
  kycDocumentController.uploadKycDocument
);

kycDocumentRouter.delete(
  '/:type',
  [param('type').isIn(KYC_DOCUMENT_TYPES)],
  validate,
  kycDocumentController.deleteKycDocument
);
