import { Router } from 'express';
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
