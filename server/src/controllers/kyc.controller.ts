import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { publicUser } from '../utils/publicUser';
import { User } from '../models/User';
import { writeAuditLog } from '../services/audit.service';

/** GET /api/admin/kyc-queue — every user awaiting KYC review, oldest first. */
export const listKycQueue = asyncHandler(async (_req: Request, res: Response) => {
  const users = await User.find({ kycStatus: 'pending' }).sort({ createdAt: 1 });
  res.status(200).json({ users: users.map(publicUser) });
});

/**
 * PATCH /api/admin/kyc-queue/:id — approve or reject one submission.
 * Approve clears any prior rejection reason; reject requires one (the
 * submission needs to know what to fix before resubmitting).
 */
export const updateKycStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status, rejectionReason } = req.body as { status: 'verified' | 'rejected'; rejectionReason?: string };
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'User not found');
  if (user.kycStatus !== 'pending') throw new ApiError(409, 'This submission has already been reviewed');

  const before = user.kycStatus;
  user.kycStatus = status;
  user.kycRejectionReason = status === 'rejected' ? rejectionReason : undefined;
  await user.save();

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: status === 'verified' ? 'kyc_approved' : 'kyc_rejected',
    targetType: 'User',
    targetId: user._id.toString(),
    details: { before, after: status, rejectionReason: rejectionReason ?? null },
  });

  res.status(200).json({ user: publicUser(user) });
});
