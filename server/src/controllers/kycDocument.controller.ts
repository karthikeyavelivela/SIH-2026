import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { User } from '../models/User';
import { uploadImage } from '../services/cloudinary.service';
import type { KycDocumentType } from '@fyro/shared';

// AUDIT_REPORT.md Section D item 1 / Phase 1.2: DocumentUploadCard.tsx
// existed with zero callers and no backend to call — no user could ever
// upload a KYC document, while a full admin review queue (kyc.controller.ts)
// sat waiting for documents that could never arrive. This is that backend.
//
// Deliberately does NOT touch User.kycStatus (the overall account gate) —
// uploading a document only ever sets that document's own status to
// 'under_review'. An admin still explicitly approves/rejects the whole
// submission via the existing kyc.controller.ts endpoints once they've
// looked at what's here. Auto-flipping kycStatus the moment every required
// document is 'verified' was considered and deliberately deferred: it would
// mean the account-level status could change with no human action and no
// audit-log entry naming an actor, which doesn't fit this codebase's
// existing pattern of every privileged status change being an explicit,
// audited decision (see kyc.controller.ts, fraud.controller.ts, dispute.
// controller.ts — all the same shape). Flagged for a product decision
// rather than decided unilaterally here, per the build prompt's own rule
// ("if you think something should be cut or deferred, ask").
const MAX_KYC_DOCUMENT_BYTES = 8 * 1024 * 1024; // 8MB — generous for a scanned PDF, cheap ceiling against abuse

const KYC_DOCUMENT_TYPES: KycDocumentType[] = [
  'driving_licence',
  'vehicle_rc',
  'fastag',
  'goods_carriage_permit',
  'puc',
  'vehicle_fitness',
  'aadhaar',
  'pan',
  'gstin',
];

/** GET /api/kyc/documents — the caller's own uploaded documents. */
export const listMyKycDocuments = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user!.id).select('kycDocs kycStatus kycRejectionReason');
  if (!user) throw new ApiError(404, 'User not found');
  res.status(200).json({ kycStatus: user.kycStatus, kycRejectionReason: user.kycRejectionReason, documents: user.kycDocs });
});

/**
 * POST /api/kyc/documents — upload (or re-upload) one document. Accepts a
 * base64 data URL in a JSON body, same convention as requests.controller.ts's
 * proof-photo upload and loadManifest.controller.ts's signature upload — no
 * multer dependency exists in this codebase, a data URL in a JSON body is
 * the established pattern for a single small file.
 */
export const uploadKycDocument = asyncHandler(async (req: Request, res: Response) => {
  const { type, fileBase64 } = req.body as { type: KycDocumentType; fileBase64: string };

  const user = await User.findById(req.user!.id);
  if (!user) throw new ApiError(404, 'User not found');

  const existing = user.kycDocs.find((d) => d.type === type);
  if (existing?.status === 'verified') {
    throw new ApiError(400, 'This document is already verified — it cannot be replaced');
  }

  const match = /^data:(image\/(png|jpe?g|webp)|application\/pdf);base64,(.+)$/.exec(fileBase64 ?? '');
  if (!match) throw new ApiError(400, 'fileBase64 must be a data:image/(png|jpeg|webp) or data:application/pdf base64 URL');
  const mime = match[1];
  const buffer = Buffer.from(match[3], 'base64');
  if (buffer.byteLength === 0) throw new ApiError(400, 'File is empty');
  if (buffer.byteLength > MAX_KYC_DOCUMENT_BYTES) throw new ApiError(400, 'File too large (max 8MB)');

  const resourceType = mime === 'application/pdf' ? 'raw' : 'image';
  const { url } = await uploadImage(buffer, `kyc/${user._id}/${type}`, resourceType);

  const newDoc = {
    type,
    url,
    status: 'under_review' as const,
    rejectionReason: undefined,
    expiryDate: undefined,
    uploadedAt: new Date(),
    reviewedAt: undefined,
    reviewedByAdminId: undefined,
  };

  if (existing) {
    Object.assign(existing, newDoc);
  } else {
    // Mongoose generates _id for a pushed subdocument itself — the literal
    // above deliberately omits it, cast here rather than in the shared
    // object so the omission stays visible at the call site.
    user.kycDocs.push(newDoc as unknown as (typeof user.kycDocs)[number]);
  }

  // Found during Phase 1 live verification: without this, a user whose
  // whole submission was rejected (or a fresh document uploaded after
  // already being fully verified) would upload a fixed document that sat
  // 'under_review' on the document itself, but the whole-user kycStatus —
  // what listKycQueue filters on, and what the KYC gate ultimately reads
  // via outstandingKycDocs — stayed 'rejected'/'verified' forever, since
  // nothing else in the codebase ever moves it back to 'pending'. They'd
  // never reappear in the admin queue and could never get reviewed again.
  if (user.kycStatus !== 'pending') {
    user.kycStatus = 'pending';
    user.kycRejectionReason = undefined;
  }

  await user.save();

  res.status(200).json({ document: user.kycDocs.find((d) => d.type === type) });
});

/**
 * DELETE /api/kyc/documents/:type — remove one document before it's been
 * verified (matches DocumentUploadCard's canUpload = status !== 'verified'
 * gate; a verified document can never be deleted this way, same rule as
 * the upload path above).
 */
export const deleteKycDocument = asyncHandler(async (req: Request, res: Response) => {
  const type = req.params.type as KycDocumentType;
  const user = await User.findById(req.user!.id);
  if (!user) throw new ApiError(404, 'User not found');

  const existing = user.kycDocs.find((d) => d.type === type);
  if (!existing) throw new ApiError(404, 'No document of this type on file');
  if (existing.status === 'verified') throw new ApiError(400, 'A verified document cannot be deleted');

  user.kycDocs = user.kycDocs.filter((d) => d.type !== type) as typeof user.kycDocs;
  await user.save();

  res.status(200).json({ documents: user.kycDocs });
});

export { KYC_DOCUMENT_TYPES };
