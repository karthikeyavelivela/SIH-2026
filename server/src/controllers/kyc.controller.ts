import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { publicUser } from '../utils/publicUser';
import { User } from '../models/User';
import { writeAuditLog } from '../services/audit.service';
import { createNotification } from '../services/notification.service';

/**
 * GET /api/admin/kyc-queue — users actually awaiting KYC review, oldest
 * first. `kycStatus` alone used to be the filter — but every user defaults
 * to 'pending' forever (there was previously no document-upload endpoint
 * to ever move them past it, see kycDocument.controller.ts), so that filter
 * meant literally every never-reviewed account showed up here regardless
 * of whether they'd submitted anything. Now also requires at least one
 * uploaded document — a genuine "ready for review" queue, not "everyone
 * who signed up and was never looked at."
 */
export const listKycQueue = asyncHandler(async (_req: Request, res: Response) => {
  const users = await User.find({
    kycStatus: 'pending',
    'kycDocs.0': { $exists: true },
  }).sort({ createdAt: 1 });
  res.status(200).json({ users: users.map(publicUser) });
});

/**
 * PATCH /api/admin/kyc-queue/:id — approve or reject one submission.
 * Approve clears any prior rejection reason; reject requires one (the
 * submission needs to know what to fix before resubmitting).
 *
 * Cascades to every individual kycDocs[] entry currently 'under_review' —
 * found missing during Phase 1 live verification: this endpoint only ever
 * flipped the whole-user kycStatus, and nothing else in the codebase ever
 * set an individual document's status to 'verified'. Since
 * availability.controller.ts's KYC gate (Phase 1.3) checks each required
 * document's own status, not kycStatus, the gate was unsatisfiable through
 * any real admin action — a worker could upload every document and an
 * admin could "approve" them, and the worker would still be blocked from
 * going online. This is the fix: approving the whole submission verifies
 * every document that was actually under review; rejecting marks them
 * rejected with the same reason (per-document review with its own reason
 * per document is a real, separate feature — flagged as a Phase 2/6
 * follow-up rather than built here, since it needs its own review UI).
 */
export const updateKycStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status, rejectionReason } = req.body as { status: 'verified' | 'rejected'; rejectionReason?: string };
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'User not found');
  if (user.kycStatus !== 'pending') throw new ApiError(409, 'This submission has already been reviewed');

  const before = user.kycStatus;
  user.kycStatus = status;
  user.kycRejectionReason = status === 'rejected' ? rejectionReason : undefined;

  const now = new Date();
  let documentsUpdated = 0;
  for (const doc of user.kycDocs) {
    if (doc.status !== 'under_review') continue;
    doc.status = status;
    doc.rejectionReason = status === 'rejected' ? rejectionReason : undefined;
    doc.reviewedAt = now;
    doc.reviewedByAdminId = new Types.ObjectId(req.user!.id);
    documentsUpdated++;
  }

  await user.save();

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: status === 'verified' ? 'kyc_approved' : 'kyc_rejected',
    targetType: 'User',
    targetId: user._id.toString(),
    details: { before, after: status, rejectionReason: rejectionReason ?? null, documentsUpdated },
  });

  await createNotification(user._id.toString(), 'kyc_decision', {
    status,
    reason: rejectionReason ?? '',
  });

  res.status(200).json({ user: publicUser(user) });
});
